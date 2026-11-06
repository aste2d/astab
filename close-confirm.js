'use strict';

globalThis.AstabCloseConfirm = (() => {
  let armed = null, timer = null;
  function reset() {
    if (!armed) return;
    clearTimeout(timer);
    const { button, html, label, width, scope } = armed;
    button.innerHTML = html;
    if (label === null) button.removeAttribute('aria-label'); else button.setAttribute('aria-label', label);
    button.classList.remove('is-confirming');
    button.style.minWidth = width;
    scope?.removeEventListener('mouseleave', reset);
    armed = null;
  }
  function confirm(button) {
    if (armed?.button === button) { reset(); return true; }
    reset();
    const scope = button.closest('.mission-card') || document.getElementById('openTabsSection');
    armed = { button, html: button.innerHTML, label: button.getAttribute('aria-label'), width: button.style.minWidth, scope };
    button.style.minWidth = button.getBoundingClientRect().width + 'px';
    button.textContent = 'Confirm close';
    button.setAttribute('aria-label', 'Confirm ' + (button.dataset.action === 'close-all-open-tabs' ? 'close all tabs' : 'close group'));
    button.classList.add('is-confirming');
    scope?.addEventListener('mouseleave', reset);
    timer = setTimeout(reset, 5000);
    return false;
  }
  document.addEventListener('click', event => { if (armed && !armed.button.contains(event.target)) reset(); }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') reset(); });
  window.addEventListener('blur', reset);
  return { confirm, reset };
})();
