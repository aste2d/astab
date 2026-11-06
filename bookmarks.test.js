'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

async function page(extraRoots = []) {
  const ids = new Map();
  function element(tag = 'div') {
    const node = { tag, children: [], value: '', hidden: false, open: false, listeners: {}, className: '', style: {},
      addEventListener(name, fn) { this.listeners[name] = fn; },
      setAttribute(name, value) { this[name] = value; },
      append(...items) { this.children.push(...items.flatMap(item => item.tag === 'fragment' ? item.children : [item])); },
      replaceChildren(...items) { this.children = []; this.append(...items); }, remove() {}, focus() {},
    };
    Object.defineProperty(node, 'id', { get() { return this._id; }, set(value) { this._id = value; ids.set(value, this); } });
    node.classList = { add(name) { node.className += ' ' + name; } };
    return node;
  }
  for (const id of ['quickTabsList', 'bookmarkSearch', 'bookmarkToolbar', 'bookmarkBreadcrumbs', 'bookmarkCount', 'bookmarkEmpty', 'bookmarkRoots', 'bookmarkStatus', 'bookmarkSearchToggle', 'bookmarkRetry']) {
    const node = element(); node.id = id;
  }
  const tree = [{ id: '0', children: [
    { id: '1', folderType: 'bookmarks-bar', title: 'Bar', children: [
      { id: '3', title: 'One', url: 'https://example.com' },
      { id: '6', title: 'Work', children: [{ id: '7', title: 'Nested', children: [{ id: '8', title: 'Work link', url: 'https://work.example' }] }] },
    ] },
    { id: '2', title: 'Other', children: [
      { id: '4', title: 'Folder', children: [
        { id: '5', title: 'Two', url: 'https://example.org' },
        { id: '9', title: 'Deeper', children: [{ id: '10', title: 'Three', url: 'https://three.example' }] },
      ] },
      { id: '11', title: 'Loose', url: 'https://loose.example' },
      { id: '12', title: 'Empty', children: [] },
    ] }, ...extraRoots,
  ] }];
  const context = vm.createContext({ console, URL, setTimeout, clearTimeout, AstabCore: require('./desk-core.js'),
    chrome: { runtime: { getURL: part => 'chrome-extension://test/' + part }, bookmarks: { getTree: async () => structuredClone(tree) } },
    document: { getElementById: id => ids.get(id) || null, createElement: element, createDocumentFragment: () => element('fragment') },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'bookmarks.js'), 'utf8'), context);
  await context.AstabBookmarks.refresh();
  context.AstabBookmarks.mount();
  return { ids, tree, api: context.AstabBookmarks };
}

const links = grid => grid.children.map(card => card.children[0]);
const click = node => node.listeners.click();

test('all bookmarks starts at the other roots contents without redundant system folders', async () => {
  const { ids } = await page();
  assert.equal(ids.get('allBookmarks').open, false);
  const main = links(ids.get('quickTabsList'));
  const extra = links(ids.get('allBookmarksGrid'));
  assert.equal(extra.length, 3);
  assert.equal(extra[0]['aria-label'], 'Open folder Folder');
  assert.equal(extra[1].href, 'https://loose.example');
  assert.equal(extra[2]['aria-label'], 'Open folder Empty');
  assert.equal(extra[0].className, main[1].className);
  assert.ok(extra.every(link => link.href !== main[0].href));
});

test('folders navigate within their own group with working parent and root returns', async () => {
  const { ids } = await page();
  const initialMain = links(ids.get('quickTabsList'));
  click(links(ids.get('allBookmarksGrid'))[0]);
  assert.equal(links(ids.get('allBookmarksGrid'))[0].href, 'https://example.org');
  click(links(ids.get('allBookmarksGrid'))[1]);
  assert.equal(links(ids.get('allBookmarksGrid'))[0].href, 'https://three.example');
  assert.deepEqual(links(ids.get('quickTabsList')), initialMain);
  const pathText = ids.get('allBookmarkBreadcrumbs').children.map(n => n.textContent).join(' ');
  assert.match(pathText, /all bookmarks \/ Folder \/ Deeper/);
  assert.doesNotMatch(pathText, /Bookmarks bar|Other/);
  click(ids.get('allBookmarkBreadcrumbsBack'));
  assert.equal(links(ids.get('allBookmarksGrid'))[0].href, 'https://example.org');
  click(ids.get('allBookmarkBreadcrumbs').children[1]);
  assert.equal(links(ids.get('allBookmarksGrid'))[0]['aria-label'], 'Open folder Folder');
  assert.equal(ids.get('allBookmarkBreadcrumbs').hidden, true);

  click(links(ids.get('quickTabsList'))[1]);
  click(links(ids.get('quickTabsList'))[0]);
  assert.equal(links(ids.get('quickTabsList'))[0].href, 'https://work.example');
  click(ids.get('bookmarkBreadcrumbsBack'));
  assert.equal(links(ids.get('quickTabsList'))[0]['aria-label'], 'Open folder Nested');
  click(ids.get('bookmarkBreadcrumbsBack'));
  assert.equal(links(ids.get('quickTabsList'))[0].href, 'https://example.com');
});

test('search spans both groups once and restores the expanded folder afterwards', async () => {
  const { ids } = await page();
  click(links(ids.get('allBookmarksGrid'))[0]);
  click(ids.get('bookmarkSearchToggle'));
  ids.get('bookmarkSearch').value = 'example';
  ids.get('bookmarkSearch').listeners.input();
  assert.equal(links(ids.get('quickTabsList')).length, 5);
  assert.equal(ids.get('bookmarkRoots').hidden, true);
  click(ids.get('bookmarkSearchToggle'));
  assert.equal(ids.get('bookmarkRoots').hidden, false);
  assert.equal(links(ids.get('allBookmarksGrid'))[0].href, 'https://example.org');
  assert.equal(links(ids.get('quickTabsList'))[0].href, 'https://example.com');
});

test('empty and deleted folders remain navigable and recover on bookmark refresh', async () => {
  const { ids, tree, api } = await page();
  click(links(ids.get('allBookmarksGrid'))[2]);
  assert.equal(ids.get('allBookmarksEmpty').hidden, false);
  click(ids.get('allBookmarkBreadcrumbsBack'));
  click(links(ids.get('allBookmarksGrid'))[0]);
  tree[0].children[1].children.shift();
  await api.refresh();
  assert.equal(links(ids.get('allBookmarksGrid'))[0].href, 'https://loose.example');
  assert.equal(ids.get('allBookmarkBreadcrumbs').hidden, true);
});

test('local and account roots retain Chrome order while every bookmarks bar is excluded below', async () => {
  const { ids } = await page([
    { id: '41', title: 'Synced bar', folderType: 'bookmarks-bar', syncing: true, children: [{ id: '42', title: 'Account', url: 'https://account.example' }] },
    { id: '43', title: 'Synced other', folderType: 'other', syncing: true, children: [{ id: '44', title: 'Account other', url: 'https://account-other.example' }] },
    { id: '45', title: 'Mobile', folderType: 'mobile', children: [{ id: '46', title: 'Mobile link', url: 'https://mobile.example' }] },
  ]);
  const main = links(ids.get('quickTabsList'));
  const extra = links(ids.get('allBookmarksGrid'));
  assert.equal(main.at(-1).href, 'https://account.example');
  assert.equal(extra.at(-2).href, 'https://account-other.example');
  assert.equal(extra.at(-1).href, 'https://mobile.example');
  assert.ok(extra.every(link => link.href !== 'https://account.example'));
});

test('show setting has an off default and unrelated updates preserve manual expansion', async () => {
  const { ids, api } = await page();
  assert.equal(ids.get('allBookmarks').open, false);
  ids.get('allBookmarks').open = true;
  api.setAlwaysShow(false);
  assert.equal(ids.get('allBookmarks').open, true);
  api.setAlwaysShow(true);
  api.setAlwaysShow(false);
  assert.equal(ids.get('allBookmarks').open, false);
});
