/** Service worker: tab-count badge, automatic new-tab cleanup and persistent Pomodoro alarms. */

importScripts('desk-core.js');
importScripts('timer-core.js');

// Serialize cleanup so simultaneously opened new tabs keep a single survivor.
let stateQueue = Promise.resolve();
function enqueue(task) {
  const result = stateQueue.then(task);
  stateQueue = result.catch(error => console.warn('Astab background task:', error));
  return result;
}

async function updateTimer(action = 'get') {
  const stored = await chrome.storage.local.get('focusTimer');
  const state = AstabTimerCore.transition(stored.focusTimer, action);
  await chrome.storage.local.set({ focusTimer: state });
  await chrome.alarms.clear('astab-pomodoro');
  if (state.running) await chrome.alarms.create('astab-pomodoro', { when: state.endsAt });
  return state;
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || message?.type !== 'astab-timer') return;
  if (!['get', 'toggle', 'reset', 'focus', 'short', 'long'].includes(message.action)) return;
  enqueue(() => updateTimer(message.action)).then(state => reply({ state }), error => reply({ error: error.message }));
  return true;
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'astab-pomodoro') enqueue(() => updateTimer());
});
chrome.runtime.onStartup.addListener(() => enqueue(() => updateTimer()));
enqueue(() => updateTimer());

const recentlyCreated = new Map();
let newestNewTab = null;
let creationSequence = 0;
function queueNewTabCleanup(tab) {
  const ownURL = chrome.runtime.getURL('index.html');
  if (!AstabCore.isNewTab(tab, ownURL)) return;
  const created = recentlyCreated.get(tab.id);
  const newest = newestNewTab;
  if (!created || (newest && newest.sequence > created.sequence)) return;
  newestNewTab = { id: tab.id, sequence: created.sequence };
  enqueue(async () => {
    const { deskPreferences = {} } = await chrome.storage.local.get('deskPreferences');
    if (deskPreferences.autoCloseExtras === false) return;
    const tabs = await chrome.tabs.query({});
    const keep = tabs.find(item => item.id === newestNewTab?.id);
    const ids = AstabCore.closableNewTabs(tabs, keep, ownURL);
    for (const id of ids) {
      // Recheck immediately before closing: the user may have navigated to a real page.
      try {
        const candidate = await chrome.tabs.get(id);
        if (AstabCore.isNewTab(candidate, ownURL)) await chrome.tabs.remove(id);
      } catch { /* The tab was already closed. */ }
    }
  });
}

chrome.tabs.onCreated.addListener(tab => {
  const now = Date.now();
  for (const [id, time] of recentlyCreated) if (now - time.time > 30000) recentlyCreated.delete(id);
  recentlyCreated.set(tab.id, { time: now, sequence: ++creationSequence });
  queueNewTabCleanup(tab);
});
chrome.tabs.onUpdated.addListener((id, change, tab) => {
  if (change.url && Date.now() - (recentlyCreated.get(id)?.time || 0) < 30000) queueNewTabCleanup(tab);
});
chrome.tabs.onRemoved.addListener(id => recentlyCreated.delete(id));


// ─── Badge updater ────────────────────────────────────────────────────────────

/**
 * updateBadge()
 *
 * Counts open real-web tabs and updates the extension's toolbar badge.
 * "Real" tabs = not chrome://, not extension pages, not about:blank.
 */
async function updateBadge() {
  try {
    const tabs = await chrome.tabs.query({});

    // Only count actual web pages — skip browser internals and extension pages
    const count = tabs.filter(t => {
      const url = t.url || '';
      return (
        !url.startsWith('chrome://') &&
        !url.startsWith('chrome-extension://') &&
        !url.startsWith('about:') &&
        !url.startsWith('edge://') &&
        !url.startsWith('brave://')
      );
    }).length;

    // Don't show "0" — an empty badge is cleaner
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });

    if (count === 0) return;

    // Pick badge color based on workload level
    let color;
    if (count <= 10) {
      color = '#3d7a4a'; // Green — you're in control
    } else if (count <= 20) {
      color = '#b8892e'; // Amber — things are piling up
    } else {
      color = '#b35a5a'; // Red — time to focus and close some tabs
    }

    await chrome.action.setBadgeBackgroundColor({ color });

  } catch {
    // If something goes wrong, clear the badge rather than show stale data
    chrome.action.setBadgeText({ text: '' });
  }
}

// ─── Event listeners ──────────────────────────────────────────────────────────

// Update badge when the extension is first installed
chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
});

// Update badge when Chrome starts up
chrome.runtime.onStartup.addListener(() => {
  updateBadge();
});

// Update badge whenever a tab is opened
chrome.tabs.onCreated.addListener(() => {
  updateBadge();
});

// Update badge whenever a tab is closed
chrome.tabs.onRemoved.addListener(() => {
  updateBadge();
});

// Update badge when a tab's URL changes (e.g. navigating to/from chrome://)
chrome.tabs.onUpdated.addListener(() => {
  updateBadge();
});

// ─── Initial run ─────────────────────────────────────────────────────────────

// Run once immediately when the service worker first loads
updateBadge();
