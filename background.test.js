'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const own = 'chrome-extension://test/index.html';

function event() {
  const listeners = [];
  return { addListener: listener => listeners.push(listener), emit: (...args) => listeners.forEach(listener => listener(...args)) };
}
async function worker({ tabs = [], enabled = true, storage = {} } = {}) {
  const data = { deskPreferences: { autoCloseExtras: enabled }, ...storage };
  const removed = [];
  const alarms = new Map();
  const chrome = {
    runtime: { id: 'test', getURL: () => own, onMessage: event(), onStartup: event(), onInstalled: event() },
    windows: { onRemoved: event() },
    storage: { local: { get: async key => ({ [key]: data[key] }), set: async patch => Object.assign(data, patch) } },
    tabs: { onCreated: event(), onUpdated: event(), onRemoved: event(),
      query: async query => tabs.filter(tab => !removed.includes(tab.id) && (!query.windowId || tab.windowId === query.windowId)),
      get: async id => { const tab = tabs.find(tab => tab.id === id && !removed.includes(id)); if (!tab) throw Error('closed'); return tab; },
      remove: async id => removed.push(id) },
    alarms: { onAlarm: event(), clear: async name => alarms.delete(name), create: async (name, value) => alarms.set(name, value) },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
  };
  const context = vm.createContext({ chrome, console, Date });
  context.importScripts = file => vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8'), context);
  const flush = () => vm.runInContext('stateQueue', context);
  await flush();
  return { chrome, data, removed, alarms, flush };
}

test('simultaneous new tabs keep the newest across all windows and protect real webpages', async () => {
  const tabs = [{ id: 1, windowId: 1, url: own, pinned: true }, { id: 2, windowId: 2, url: own },
    { id: 3, windowId: 1, url: 'https://example.com' }, { id: 4, windowId: 1, url: own }, { id: 5, windowId: 1, url: own }];
  const w = await worker({ tabs });
  w.chrome.tabs.onCreated.emit(tabs[3]);
  w.chrome.tabs.onCreated.emit(tabs[4]);
  await w.flush();
  assert.deepEqual(w.removed, [1, 2, 4]);
});

test('late URL notification from an older new tab cannot close its newer sibling', async () => {
  const older = { id: 4, windowId: 1, url: '' }, newer = { id: 5, windowId: 1, url: own };
  const w = await worker({ tabs: [older, newer] });
  w.chrome.tabs.onCreated.emit(older);
  w.chrome.tabs.onCreated.emit(newer);
  older.url = own;
  w.chrome.tabs.onUpdated.emit(older.id, { url: own }, older);
  await w.flush();
  assert.deepEqual(w.removed, [4]);
});

test('Close Other off never closes tabs', async () => {
  const tabs = [{ id: 1, windowId: 1, url: own }, { id: 2, windowId: 1, url: own }];
  const w = await worker({ tabs, enabled: false });
  w.chrome.tabs.onCreated.emit(tabs[1]);
  await w.flush();
  assert.deepEqual(w.removed, []);
});

test('shared timer requests are serialized and completion is persisted', async () => {
  const w = await worker();
  const request = action => new Promise(resolve => w.chrome.runtime.onMessage.emit({ type: 'astab-timer', action }, { id: 'test' }, resolve));
  const [started, paused] = await Promise.all([request('toggle'), request('toggle')]);
  assert.equal(started.state.running, true);
  assert.equal(paused.state.running, false);
  assert.equal(w.alarms.size, 0);
  w.data.focusTimer = { mode: 'focus', running: true, endsAt: Date.now() - 1000 };
  w.chrome.alarms.onAlarm.emit({ name: 'astab-pomodoro' });
  await w.flush();
  assert.equal(w.data.focusTimer.finished, true);
  assert.equal(w.data.focusTimer.remaining, 0);
});
