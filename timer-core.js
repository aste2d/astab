'use strict';
(function (scope) {
  const DURATIONS = { focus: 1500, short: 300, long: 900 };
  function normalize(value = {}, now = Date.now()) {
    const mode = Object.hasOwn(DURATIONS, value.mode) ? value.mode : 'focus';
    const running = value.running === true && Number.isFinite(value.endsAt);
    const remaining = running ? Math.max(0, Math.ceil((value.endsAt - now) / 1000)) :
      Math.max(0, Math.min(DURATIONS[mode], Number.isFinite(value.remaining) ? value.remaining : DURATIONS[mode]));
    return { mode, running, remaining, endsAt: running ? value.endsAt : null, finished: value.finished === true };
  }
  function transition(value, action, now = Date.now()) {
    const state = normalize(value, now);
    if (state.running && state.remaining === 0) {
      state.running = false;
      state.endsAt = null;
      state.finished = true;
    }
    if (action === 'toggle') {
      if (state.running) { state.running = false; state.endsAt = null; }
      else {
        if (state.remaining === 0) state.remaining = DURATIONS[state.mode];
        state.running = true;
        state.finished = false;
        state.endsAt = now + state.remaining * 1000;
      }
    } else if (action === 'reset' || Object.hasOwn(DURATIONS, action)) {
      state.mode = Object.hasOwn(DURATIONS, action) ? action : state.mode;
      state.remaining = DURATIONS[state.mode];
      state.running = false; state.finished = false; state.endsAt = null;
    }
    return state;
  }
  const api = { DURATIONS, normalize, transition };
  if (typeof module !== 'undefined') module.exports = api;
  scope.AstabTimerCore = api;
})(globalThis);
