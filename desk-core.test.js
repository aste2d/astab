'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./desk-core');
const own = 'chrome-extension://test/index.html';

test('Auto close extras includes every other new tab, across windows, and protects real pages', () => {
  const keep = { id: 9, url: own, windowId: 1 };
  const tabs = [keep, { id: 1, url: 'chrome://newtab/', windowId: 1 },
    { id: 2, url: own, windowId: 2 }, { id: 3, url: own, pinned: true, windowId: 1 },
    { id: 4, url: 'https://example.com', windowId: 1 },
    { id: 5, url: own, pendingUrl: 'https://example.com', windowId: 1 },
    { id: 6, url: 'chrome-extension://other/index.html', windowId: 1 }];
  assert.deepEqual(core.closableNewTabs(tabs, keep, own), [1, 2, 3]);
  assert.deepEqual(core.closableNewTabs(tabs, { ...keep, url: 'https://example.com' }, own), []);
  assert.deepEqual(core.closableNewTabs(tabs, undefined, own), []);
});

test('bookmark bars support account roots, legacy roots and preserve Chrome order', () => {
  const roots = [{ id: '9', folderType: 'bookmarks-bar' }, { id: '1' }, { id: '6', folderType: 'other' }];
  assert.deepEqual(core.bookmarkBars(roots), roots.slice(0, 2));
  assert.deepEqual(core.bookmarkBars([{ id: '1', folderType: 'other' }]), []);
});

test('nested search includes folders as paths, without changing bookmarks', () => {
  const tree = [{ id: '8', title: 'Work', children: [{ id: '9', title: 'Docs', children: [{ id: '10', title: 'Guide', url: 'https://example.com' }] }] }];
  const before = JSON.stringify(tree);
  assert.equal(core.flattenBookmarks(tree)[0].path, 'Work / Docs');
  assert.equal(JSON.stringify(tree), before);
});

