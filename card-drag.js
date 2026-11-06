'use strict';

// Move the cards themselves; tab actions and the row drag handles keep their existing behavior.
globalThis.AstabCardDrag = (() => {
  let drag = null, saving = false, pendingRender = false, frame = 0, suppressClickUntil = 0;
  const cards = list => [...list.querySelectorAll(':scope > .mission-card')];
  const keys = list => cards(list).map(card => card.dataset.groupId);
  function deferRender() {
    if (!drag && !saving) return false;
    pendingRender = true;
    return true;
  }
  function restoreOrder(state) {
    state.original.forEach(key => {
      const card = cards(state.list).find(item => item.dataset.groupId === key);
      if (card) state.list.append(card);
    });
  }
  async function finish(cancel = false) {
    if (!drag) return;
    const state = drag;
    drag = null;
    cancelAnimationFrame(frame);
    if (state.placeholder) state.list.insertBefore(state.card, state.placeholder);
    state.card.hidden = false;
    state.placeholder?.remove(); state.ghost?.remove();
    state.card.classList.remove('is-keyboard-dragging');
    document.body.classList.remove('card-dragging');
    if (cancel) restoreOrder(state);
    if (state.moved) suppressClickUntil = Date.now() + 300;
    if (state.keyboard) state.card.querySelector('.mission-heading')?.focus({ preventScroll: true });
    const order = keys(state.list);
    if (!cancel && state.moved && order.join('\n') !== state.original.join('\n')) {
      saving = true;
      try {
        await saveGroupOrder({ ...groupOrderState, sessionOrder: order, pinnedOrder: order, pinEnabled: true });
        const groups = new Map(domainGroups.map(group => [group.domain, group]));
        domainGroups = order.map(key => groups.get(key)).filter(Boolean);
      } catch {
        restoreOrder(state); showToast('Could not save card order'); pendingRender = true;
      } finally { saving = false; }
    }
    if (pendingRender) { pendingRender = false; queueRenderDashboard(); }
  }
  function place() {
    if (!drag?.ghost) return;
    const state = drag;
    state.ghost.style.left = (state.x - state.offsetX) + 'px';
    state.ghost.style.top = (state.y - state.offsetY) + 'px';
    const target = cards(state.list).find(card => {
      if (card === state.card) return false;
      const rect = card.getBoundingClientRect();
      return state.y < rect.top + rect.height / 2;
    });
    state.list.insertBefore(state.placeholder, target || null);
  }
  function scrollFrame() {
    if (!drag?.ghost) return;
    const edge = 70;
    const speed = drag.y < edge ? -Math.ceil((edge - drag.y) / 5) :
      drag.y > innerHeight - edge ? Math.ceil((drag.y - innerHeight + edge) / 5) : 0;
    if (speed) { window.scrollBy(0, Math.max(-22, Math.min(22, speed))); place(); }
    frame = requestAnimationFrame(scrollFrame);
  }
  function begin(card, event, keyboard = false) {
    const rect = card.getBoundingClientRect();
    drag = { card, list: card.parentElement, original: keys(card.parentElement), keyboard,
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      x: event.clientX, y: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, moved: false };
    if (keyboard) card.classList.add('is-keyboard-dragging');
  }
  document.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag || saving) return;
    const card = event.target.closest('#openTabsMissions > .mission-card');
    if (!card || event.target.closest('button,a,input,textarea,select,[contenteditable],.chip-favicon')) return;
    event.preventDefault();
    card.querySelector('.mission-heading')?.focus({ preventScroll: true });
    begin(card, event);
  });
  document.addEventListener('pointermove', event => {
    if (!drag || drag.keyboard || drag.pointerId !== event.pointerId) return;
    drag.x = event.clientX; drag.y = event.clientY;
    if (!drag.moved && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 5) return;
    event.preventDefault();
    if (!drag.moved) {
      drag.moved = true;
      const rect = drag.card.getBoundingClientRect();
      drag.placeholder = document.createElement('div');
      drag.placeholder.className = 'card-drop-placeholder';
      drag.placeholder.style.height = rect.height + 'px';
      drag.list.insertBefore(drag.placeholder, drag.card);
      drag.ghost = drag.card.cloneNode(true);
      drag.ghost.classList.add('is-card-ghost');
      drag.ghost.setAttribute('aria-hidden', 'true'); drag.ghost.inert = true;
      drag.ghost.style.width = rect.width + 'px';
      drag.ghost.style.height = rect.height + 'px';
      document.body.append(drag.ghost);
      drag.card.hidden = true;
      document.body.classList.add('card-dragging');
      frame = requestAnimationFrame(scrollFrame);
    }
    place();
  }, { passive: false });
  document.addEventListener('pointerup', event => {
    if (drag && !drag.keyboard && drag.pointerId === event.pointerId) finish();
  });
  document.addEventListener('pointercancel', () => finish(true));
  window.addEventListener('blur', () => finish(true));
  document.addEventListener('click', event => {
    if (Date.now() < suppressClickUntil && event.target.closest('#openTabsMissions')) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drag) { event.preventDefault(); finish(true); return; }
    const handle = event.target.closest('#openTabsMissions .mission-heading');
    if (!handle || saving) return;
    if (!drag && [' ', 'Enter'].includes(event.key)) {
      event.preventDefault(); begin(handle.closest('.mission-card'), event, true); return;
    }
    if (!drag?.keyboard) return;
    if ([' ', 'Enter', 'Tab'].includes(event.key)) {
      if (event.key !== 'Tab') event.preventDefault();
      finish(); return;
    }
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const all = cards(drag.list), index = all.indexOf(drag.card);
    const target = all[index + (event.key === 'ArrowUp' ? -1 : 1)];
    if (!target) return;
    drag.list.insertBefore(drag.card, event.key === 'ArrowUp' ? target : target.nextSibling);
    drag.moved = true;
    handle.focus({ preventScroll: true }); drag.card.scrollIntoView({ block: 'nearest' });
  });
  return { deferRender };
})();
