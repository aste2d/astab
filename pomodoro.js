'use strict';

globalThis.AstabPomodoro = (() => {
  let timer = AstabTimerCore.normalize();
  let busy = false;
  let isOpen = false;
  let nextSettleAt = 0;
  const $ = id => document.getElementById(id);

  function position() {
    if (!isOpen) return;
    const trigger = $('timerTrigger').getBoundingClientRect();
    const panel = $('timerPopover');
    panel.style.top = `${Math.max(12, Math.min(trigger.top, window.innerHeight - panel.offsetHeight - 12))}px`;
    panel.style.right = `${Math.max(12, window.innerWidth - trigger.left + 10)}px`;
    if (window.innerWidth < 500) panel.style.right = '64px';
  }

  function togglePanel(nextOpen, restoreFocus = false) {
    isOpen = Boolean(nextOpen);
    $('timerPopover').hidden = !isOpen;
    $('timerTrigger').setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      if (deferredPanelOpen) setDeferredPanelOpen(false);
      setThemeMenuOpen(false);
      position();
      $('timerToggle').focus({ preventScroll: true });
    } else if (restoreFocus) $('timerTrigger').focus({ preventScroll: true });
  }

  function paint() {
    const state = AstabTimerCore.normalize(timer);
    const time = `${String(Math.floor(state.remaining / 60)).padStart(2, '0')}:${String(state.remaining % 60).padStart(2, '0')}`;
    $('timerClock').textContent = time;
    $('timerToggle').textContent = state.running ? 'Pause' : state.remaining < AstabTimerCore.DURATIONS[state.mode] && state.remaining > 0 ? 'Resume' : 'Start';
    $('timerToggle').disabled = busy;
    $('timerStatus').textContent = state.finished ? 'Complete' : { focus: 'Focus', short: 'Short break', long: 'Long break' }[state.mode];
    $('timerTrigger').classList.toggle('is-running', state.running);
    $('timerTrigger').classList.toggle('is-finished', state.finished);
    $('timerTrigger').title = state.finished ? 'Pomodoro complete' : state.running ? `Pomodoro · ${time}` : 'Pomodoro';
    $('timerMini').hidden = !state.running;
    $('timerMini').textContent = time;
    document.querySelectorAll('[data-timer-mode]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.timerMode === state.mode));
      button.disabled = busy;
    });
    if (state.running && state.remaining === 0 && !busy && Date.now() >= nextSettleAt) {
      nextSettleAt = Date.now() + 5000;
      action('get');
    }
  }

  async function action(command) {
    if (busy) return;
    busy = true;
    paint();
    try {
      const response = await chrome.runtime.sendMessage({ type: 'astab-timer', action: command });
      if (response?.error || !response?.state) throw new Error(response?.error || 'Timer unavailable. Reload the extension.');
      timer = response.state;
    } catch (error) { showToast(error.message); }
    finally { busy = false; paint(); }
  }

  async function mount() {
    const stored = await chrome.storage.local.get('focusTimer');
    timer = AstabTimerCore.normalize(stored.focusTimer);
    paint();
    $('timerTrigger').addEventListener('click', () => {
      if (Date.now() < deferredTriggerSuppressClickUntil) return;
      togglePanel(!isOpen);
    });
    $('timerClose').addEventListener('click', () => togglePanel(false, true));
    $('timerToggle').addEventListener('click', () => action('toggle'));
    $('timerReset').addEventListener('click', () => action('reset'));
    document.querySelectorAll('[data-timer-mode]').forEach(button => button.addEventListener('click', () => action(button.dataset.timerMode)));
    document.addEventListener('click', event => {
      if (isOpen && !event.target.closest('#timerPopover, #timerTrigger')) togglePanel(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && isOpen) { event.stopPropagation(); togglePanel(false, true); }
    });
    document.addEventListener('pointermove', () => { if (deferredTriggerDragState?.moved) position(); });
    window.addEventListener('resize', position);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.focusTimer) { timer = changes.focusTimer.newValue; paint(); }
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) action('get'); });
    setInterval(() => { if (!document.hidden) paint(); }, 1000);
    await action('get');
  }
  return { mount };
})();
