'use strict';

(function attachDeferredTriggerPosition(globalScope) {
  function normalizeTriggerPosition(input) {
    const top = Number(input?.top);
    return {
      top: Number.isFinite(top) ? top : null,
    };
  }

  function clampTriggerTop(top, viewportHeight, triggerHeight, margin = 24) {
    const numericTop = Number(top);
    if (!Number.isFinite(numericTop)) return null;

    const minTop = margin;
    const maxTop = Math.max(minTop, Number(viewportHeight) - Number(triggerHeight) - margin);
    return Math.min(Math.max(numericTop, minTop), maxTop);
  }

  const api = {
    clampTriggerTop,
    normalizeTriggerPosition,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalScope.TabOutDeferredTriggerPosition = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
