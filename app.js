'use strict';

const {
  mountDashboardRuntime: appMountDashboardRuntime,
} = globalThis.TabHarborDashboardRuntime || {};

async function initializeApp() {
  if (!appMountDashboardRuntime) {
    throw new Error('Astab dashboard runtime is unavailable');
  }

  await appMountDashboardRuntime();
  await AstabEnhancements.mount();
}

initializeApp();
