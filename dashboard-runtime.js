/* ================================================================
   Tab Harbor — Dashboard App (Pure Extension Edition)

   This file is the brain of the dashboard. Now that the dashboard
   IS the extension page (not inside an iframe), it can call
   chrome.tabs and chrome.storage directly — no postMessage bridge needed.

   What this file does:
   1. Reads open browser tabs directly via chrome.tabs.query()
   2. Groups tabs by domain with a landing pages category
   3. Renders domain cards, banners, and stats
   4. Handles all user actions (close tabs, save for later, focus tab)
   5. Stores "Saved for Later" tabs in chrome.storage.local (no server)
   ================================================================ */

'use strict';

const {
  escapeHtmlAttribute: runtimeEscapeHtmlAttribute,
  getFallbackLabel: runtimeGetFallbackLabel,
  getGroupIcon: runtimeGetGroupIcon,
  getIconSources: runtimeGetIconSources,
} = globalThis.TabOutIconUtils || {};

const {
  addSessionGroup,
  assignTabToSessionGroup,
  clearTabSessionGroup,
  normalizeSessionGroups,
  pruneSessionGroups,
} = globalThis.TabOutSessionGroups || {};

const {
  applyGroupOrder,
  normalizeGroupOrderState,
} = globalThis.TabOutGroupOrder || {};

const {
  clampTriggerTop: runtimeClampTriggerTop,
} = globalThis.TabOutDeferredTriggerPosition || {};

const {
  reorderSubsetByIds,
} = globalThis.TabOutListOrder || {};

const {
  compressImageFileForStorage,
} = globalThis.TabOutBackgroundImage || {};

/* ----------------------------------------------------------------
   CHROME TABS — Direct API Access

   Since this page IS the extension's new tab page, it has full
   access to chrome.tabs and chrome.storage. No middleman needed.
   ---------------------------------------------------------------- */

// All open tabs — populated by fetchOpenTabs()
let openTabs = [];
let sessionGroupsState = normalizeSessionGroups ? normalizeSessionGroups() : { groups: [], assignments: {} };
const SESSION_GROUPS_KEY = 'sessionGroups';
let groupOrderState = normalizeGroupOrderState ? normalizeGroupOrderState() : { sessionOrder: [], pinnedOrder: [], pinEnabled: false };
const GROUP_ORDER_KEY = 'groupOrder';
let groupTabOrderState = {};
const GROUP_TAB_ORDER_KEY = 'groupTabOrder';
let draggedDrawerItemId = '';
let draggedDrawerItemEl = null;
let drawerItemDragState = null;
let drawerItemPlaceholderEl = null;
let draggedPageChipId = '';
let draggedPageChipEl = null;
let pageChipDragState = null;
let pageChipPlaceholderEl = null;

function reorderVisibleItemsByIds(items, orderIds, includeItem) {
  if (reorderSubsetByIds) {
    return reorderSubsetByIds(items, orderIds, includeItem);
  }

  if (!Array.isArray(items)) return [];
  const list = items.slice();
  const shouldInclude = typeof includeItem === 'function' ? includeItem : () => true;
  const subset = list.filter(shouldInclude);
  const normalizedOrder = Array.isArray(orderIds) ? orderIds.map(id => String(id)).filter(Boolean) : [];
  if (!subset.length || subset.length !== normalizedOrder.length) return list;

  const subsetMap = new Map(subset.map(item => [String(item.id), item]));
  if (normalizedOrder.some(id => !subsetMap.has(id))) return list;

  let nextIndex = 0;
  return list.map(item => {
    if (!shouldInclude(item)) return item;
    const nextItem = subsetMap.get(normalizedOrder[nextIndex]);
    nextIndex += 1;
    return nextItem || item;
  });
}

function normalizeGroupTabOrderState(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  return Object.fromEntries(
    Object.entries(input)
      .map(([groupKey, orderIds]) => [
        String(groupKey),
        Array.isArray(orderIds)
          ? [...new Set(orderIds.map(id => String(id)).filter(Boolean))]
          : [],
      ])
      .filter(([, orderIds]) => orderIds.length > 0)
  );
}

function pruneGroupTabOrderState(state, groups = []) {
  const normalized = normalizeGroupTabOrderState(state);
  const groupMap = new Map(
    groups.map(group => [
      String(group.domain),
      new Set(
        (group.tabs || [])
          .map(tab => String(tab?.url || ''))
          .filter(Boolean)
      ),
    ])
  );

  return Object.fromEntries(
    Object.entries(normalized)
      .map(([groupKey, orderIds]) => {
        const validUrls = groupMap.get(String(groupKey));
        if (!validUrls) return null;
        const filtered = orderIds.filter(url => validUrls.has(url));
        return filtered.length > 0 ? [String(groupKey), filtered] : null;
      })
      .filter(Boolean)
  );
}

async function loadGroupTabOrder(groups = []) {
  const stored = await chrome.storage.local.get(GROUP_TAB_ORDER_KEY);
  const nextState = normalizeGroupTabOrderState(stored[GROUP_TAB_ORDER_KEY]);
  const prunedState = pruneGroupTabOrderState(nextState, groups);
  groupTabOrderState = prunedState;
  await chrome.storage.local.set({ [GROUP_TAB_ORDER_KEY]: prunedState });
  return prunedState;
}

async function saveGroupTabOrder(nextState) {
  groupTabOrderState = normalizeGroupTabOrderState(nextState);
  await chrome.storage.local.set({ [GROUP_TAB_ORDER_KEY]: groupTabOrderState });
  return groupTabOrderState;
}

function reorderGroupTabsByStoredUrls(tabs, groupKey) {
  const orderIds = groupTabOrderState[String(groupKey)] || [];
  if (!Array.isArray(tabs) || !tabs.length || !orderIds.length) return Array.isArray(tabs) ? tabs.slice() : [];

  const wrappedTabs = tabs.map(tab => ({
    id: String(tab?.url || ''),
    tab,
  }));
  const subsetUrls = new Set(orderIds);
  const reordered = reorderVisibleItemsByIds(
    wrappedTabs,
    orderIds,
    item => subsetUrls.has(item.id)
  );
  return reordered.map(item => item.tab);
}

function getOrderedUniqueTabsForGroup(group) {
  const tabs = Array.isArray(group?.tabs) ? group.tabs : [];
  const seen = new Set();
  const uniqueTabs = [];
  for (const tab of tabs) {
    const url = String(tab?.url || '');
    if (!url || seen.has(url)) continue;
    seen.add(url);
    uniqueTabs.push(tab);
  }
  return reorderGroupTabsByStoredUrls(uniqueTabs, group?.domain);
}

/**
 * fetchOpenTabs()
 */
async function fetchOpenTabs() {
  try {
    const extensionId = chrome.runtime.id;
    const newtabUrl = `chrome-extension://${extensionId}/index.html`;

    const tabs = await chrome.tabs.query({});
    openTabs = tabs.map(t => ({
      id:       t.id,
      url:      t.url,
      title:    t.title,
      windowId: t.windowId,
      active:   t.active,
      pinned:   t.pinned,
      favIconUrl: t.favIconUrl || '',
      isTabOut: t.url === newtabUrl || t.url === 'chrome://newtab/',
    }));
  } catch {
    openTabs = [];
  }
}

async function loadSessionGroups(openTabIds = []) {
  const stored = await chrome.storage.local.get(SESSION_GROUPS_KEY);
  const nextState = normalizeSessionGroups(stored[SESSION_GROUPS_KEY]);
  const prunedState = pruneSessionGroups(nextState, openTabIds);
  sessionGroupsState = prunedState;
  await chrome.storage.local.set({ [SESSION_GROUPS_KEY]: prunedState });
  return prunedState;
}

async function saveSessionGroups(nextState) {
  sessionGroupsState = normalizeSessionGroups(nextState);
  await chrome.storage.local.set({ [SESSION_GROUPS_KEY]: sessionGroupsState });
  return sessionGroupsState;
}

async function loadGroupOrder() {
  const stored = await chrome.storage.local.get(GROUP_ORDER_KEY);
  groupOrderState = normalizeGroupOrderState(stored[GROUP_ORDER_KEY]);
  return groupOrderState;
}

async function saveGroupOrder(nextState) {
  groupOrderState = normalizeGroupOrderState(nextState);
  await chrome.storage.local.set({ [GROUP_ORDER_KEY]: groupOrderState });
  return groupOrderState;
}

function animatePageChipItems(listEl, previousRects) {
  listEl?.querySelectorAll('[data-chip-sort-id]').forEach(item => {
    if (item.classList.contains('is-dragging')) return;

    const key = item.dataset.chipSortId || '';
    const previousRect = previousRects.get(key);
    if (!previousRect) return;

    const nextRect = item.getBoundingClientRect();
    const deltaX = previousRect.left - nextRect.left;
    const deltaY = previousRect.top - nextRect.top;
    if (!deltaX && !deltaY) return;

    item.style.transition = 'none';
    item.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    requestAnimationFrame(() => {
      item.style.transition = 'transform 0.16s ease';
      item.style.transform = '';
    });
  });
}

function getStableGroupId(groupKey) {
  return 'domain-' + String(groupKey).replace(/[^a-z0-9]/g, '-');
}

function animateDrawerListItems(listEl, previousRects) {
  listEl?.querySelectorAll('[data-drawer-sort-id]').forEach(item => {
    if (item.classList.contains('is-dragging')) return;

    const key = item.dataset.drawerSortId || '';
    const previousRect = previousRects.get(key);
    if (!previousRect) return;

    const nextRect = item.getBoundingClientRect();
    const deltaX = previousRect.left - nextRect.left;
    const deltaY = previousRect.top - nextRect.top;
    if (!deltaX && !deltaY) return;

    item.style.transition = 'none';
    item.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    requestAnimationFrame(() => {
      item.style.transition = 'transform 0.16s ease';
      item.style.transform = '';
    });
  });
}

function ensureDrawerItemPlaceholder() {
  if (drawerItemPlaceholderEl || !draggedDrawerItemEl) return drawerItemPlaceholderEl;

  drawerItemPlaceholderEl = document.createElement('div');
  drawerItemPlaceholderEl.className = 'drawer-reorder-placeholder';
  drawerItemPlaceholderEl.style.height = `${draggedDrawerItemEl.getBoundingClientRect().height}px`;
  draggedDrawerItemEl.insertAdjacentElement('afterend', drawerItemPlaceholderEl);
  return drawerItemPlaceholderEl;
}

function clearDrawerItemDragState() {
  draggedDrawerItemId = '';
  drawerItemDragState = null;
  drawerItemPlaceholderEl?.remove();
  drawerItemPlaceholderEl = null;
  document.body.classList.remove('drawer-list-dragging');

  if (draggedDrawerItemEl) {
    draggedDrawerItemEl.classList.remove('is-dragging');
    draggedDrawerItemEl.style.removeProperty('--drag-left');
    draggedDrawerItemEl.style.removeProperty('--drag-top');
    draggedDrawerItemEl.style.removeProperty('--drag-width');
  }

  draggedDrawerItemEl = null;
}

function ensurePageChipPlaceholder() {
  if (pageChipPlaceholderEl || !draggedPageChipEl) return pageChipPlaceholderEl;

  pageChipPlaceholderEl = document.createElement('div');
  pageChipPlaceholderEl.className = 'chip-reorder-placeholder';
  pageChipPlaceholderEl.style.height = `${draggedPageChipEl.getBoundingClientRect().height}px`;
  draggedPageChipEl.insertAdjacentElement('afterend', pageChipPlaceholderEl);
  return pageChipPlaceholderEl;
}

function clearPageChipDragState() {
  draggedPageChipId = '';
  pageChipDragState = null;
  pageChipPlaceholderEl?.remove();
  pageChipPlaceholderEl = null;
  document.body.classList.remove('page-chip-list-dragging');

  if (draggedPageChipEl) {
    draggedPageChipEl.classList.remove('is-dragging');
    draggedPageChipEl.style.removeProperty('--drag-left');
    draggedPageChipEl.style.removeProperty('--drag-top');
    draggedPageChipEl.style.removeProperty('--drag-width');
  }

  draggedPageChipEl = null;
}

function updateDraggedPageChipPosition(clientX, clientY) {
  if (!draggedPageChipEl || !pageChipDragState) return;

  draggedPageChipEl.style.setProperty('--drag-left', `${clientX - pageChipDragState.offsetX}px`);
  draggedPageChipEl.style.setProperty('--drag-top', `${clientY - pageChipDragState.offsetY}px`);
}

function previewPageChipOrder(clientY) {
  const listEl = pageChipDragState?.listEl;
  if (!listEl || !draggedPageChipId) return;

  const placeholder = ensurePageChipPlaceholder();
  const previousRects = new Map();
  const items = [...listEl.querySelectorAll('[data-chip-sort-id]:not(.is-dragging)')];

  items.forEach(item => {
    previousRects.set(item.dataset.chipSortId || '', item.getBoundingClientRect());
  });

  let insertBeforeItem = null;
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      insertBeforeItem = item;
      break;
    }
  }

  if (insertBeforeItem) {
    listEl.insertBefore(placeholder, insertBeforeItem);
  } else {
    listEl.appendChild(placeholder);
  }

  animatePageChipItems(listEl, previousRects);
}

async function saveGroupTabRowOrder(groupKey, orderUrls) {
  if (!groupKey || !Array.isArray(orderUrls) || !orderUrls.length) return;

  await saveGroupTabOrder({
    ...groupTabOrderState,
    [String(groupKey)]: orderUrls.map(url => String(url)).filter(Boolean),
  });
}

function updateDraggedDrawerItemPosition(clientX, clientY) {
  if (!draggedDrawerItemEl || !drawerItemDragState) return;

  draggedDrawerItemEl.style.setProperty('--drag-left', `${clientX - drawerItemDragState.offsetX}px`);
  draggedDrawerItemEl.style.setProperty('--drag-top', `${clientY - drawerItemDragState.offsetY}px`);
}

function previewDrawerItemOrder(clientY) {
  const listEl = drawerItemDragState?.listEl;
  if (!listEl || !draggedDrawerItemId) return;

  const placeholder = ensureDrawerItemPlaceholder();
  const previousRects = new Map();
  const items = [...listEl.querySelectorAll('[data-drawer-sort-id]:not(.is-dragging)')];

  items.forEach(item => {
    previousRects.set(item.dataset.drawerSortId || '', item.getBoundingClientRect());
  });

  let insertBeforeItem = null;
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      insertBeforeItem = item;
      break;
    }
  }

  if (insertBeforeItem) {
    listEl.insertBefore(placeholder, insertBeforeItem);
  } else {
    listEl.appendChild(placeholder);
  }

  animateDrawerListItems(listEl, previousRects);
}

async function reorderSavedTabs(orderIds) {
  const { deferred = [] } = await chrome.storage.local.get('deferred');
  const nextDeferred = reorderVisibleItemsByIds(
    deferred,
    orderIds,
    item => item && item.id && !item.completed && !item.dismissed
  );
  await chrome.storage.local.set({ deferred: nextDeferred });
  return nextDeferred;
}

async function reorderTodoItems(orderIds) {
  const todos = await getTodos();
  const nextTodos = reorderVisibleItemsByIds(
    todos,
    orderIds,
    todo => todo && todo.id && !todo.completed && !todo.dismissed
  );
  return saveTodos(nextTodos);
}

async function saveDrawerItemOrder(kind, orderIds) {
  if (!Array.isArray(orderIds) || !orderIds.length) return;

  if (kind === 'saved') {
    await reorderSavedTabs(orderIds);
    return;
  }

  if (kind === 'todo') {
    await reorderTodoItems(orderIds);
  }
}

async function removeTabAssignments(tabIds = []) {
  if (!tabIds.length) return sessionGroupsState;

  let nextState = sessionGroupsState;
  for (const tabId of tabIds) {
    nextState = clearTabSessionGroup(nextState, tabId);
  }

  nextState = pruneSessionGroups(nextState, openTabs.map(tab => tab.id));
  return saveSessionGroups(nextState);
}

function buildMoveMenu(tab) {
  const currentGroupId = tab.manualGroupId || '';
  const otherGroups = sessionGroupsState.groups.filter(group => group.id !== currentGroupId);
  const groupButtons = otherGroups.map(group => `
    <button
      class="move-menu-btn"
      type="button"
      data-action="move-tab-to-group"
      data-tab-id="${tab.id}"
      data-group-id="${group.id}"
    >
      ${group.name}
    </button>`).join('');

  return `
    <div class="chip-move-wrap">
      <button
        class="chip-action chip-move-trigger"
        type="button"
        data-action="toggle-move-menu"
        data-tab-id="${tab.id}"
        aria-label="Move to group"
        aria-expanded="false"
        title="Move to group"
      >
        ${ICONS.move}
      </button>
      <div class="chip-move-menu" hidden>
        ${groupButtons || '<div class="move-menu-empty">No groups yet</div>'}
        <button class="move-menu-btn move-menu-btn-primary" type="button" data-action="move-tab-to-new-group" data-tab-id="${tab.id}">
          + New group
        </button>
        ${currentGroupId ? `<button class="move-menu-btn" type="button" data-action="move-tab-to-original" data-tab-id="${tab.id}">Back to original group</button>` : ''}
      </div>
    </div>`;
}

function closeMoveMenus() {
  document.querySelectorAll('.chip-move-menu').forEach(menu => {
    menu.hidden = true;
  });
  document.querySelectorAll('.chip-move-trigger.is-open').forEach(trigger => {
    trigger.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
  });
}

async function closeTabsByUrls(urls) {
  if (!urls || urls.length === 0) return;

  const targetHostnames = [];
  const exactUrls = new Set();

  for (const u of urls) {
    if (u.startsWith('file://')) {
      exactUrls.add(u);
    } else {
      try { targetHostnames.push(new URL(u).hostname); }
      catch { /* skip unparseable */ }
    }
  }

  const allTabs = await chrome.tabs.query({});
  const toClose = allTabs
    .filter(tab => {
      const tabUrl = tab.url || '';
      if (tabUrl.startsWith('file://') && exactUrls.has(tabUrl)) return true;
      try {
        const tabHostname = new URL(tabUrl).hostname;
        return tabHostname && targetHostnames.includes(tabHostname);
      } catch { return false; }
    })
    .map(tab => tab.id);

  if (toClose.length > 0) await chrome.tabs.remove(toClose);
  await fetchOpenTabs();
  await loadSessionGroups(openTabs.map(tab => tab.id));
}

async function closeTabsExact(urls) {
  if (!urls || urls.length === 0) return;
  const urlSet = new Set(urls);
  const allTabs = await chrome.tabs.query({});
  const toClose = allTabs.filter(t => urlSet.has(t.url)).map(t => t.id);
  if (toClose.length > 0) await chrome.tabs.remove(toClose);
  await fetchOpenTabs();
  await loadSessionGroups(openTabs.map(tab => tab.id));
}

async function focusTab(url) {
  if (!url) return;
  const allTabs = await chrome.tabs.query({});
  const currentWindow = await chrome.windows.getCurrent();

  let matches = allTabs.filter(t => t.url === url);

  if (matches.length === 0) {
    try {
      const targetHost = new URL(url).hostname;
      matches = allTabs.filter(t => {
        try { return new URL(t.url).hostname === targetHost; }
        catch { return false; }
      });
    } catch {}
  }

  if (matches.length === 0) return false;

  const match = matches.find(t => t.windowId !== currentWindow.id) || matches[0];
  await chrome.tabs.update(match.id, { active: true });
  await chrome.windows.update(match.windowId, { focused: true });
  return true;
}

async function openOrFocusUrl(url) {
  const focused = await focusTab(url);
  if (focused) return true;
  await chrome.tabs.create({ url });
  return false;
}

async function runDefaultSearch(query) {
  const text = String(query || '').trim();
  if (!text) return;

  if (chrome.search?.query) {
    await chrome.search.query({
      text,
      disposition: 'CURRENT_TAB',
    });
    return;
  }

  const fallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
  await chrome.tabs.create({ url: fallbackUrl });
}

async function closeDuplicateTabs(urls, keepOne = true) {
  const allTabs = await chrome.tabs.query({});
  const toClose = [];

  for (const url of urls) {
    const matching = allTabs.filter(t => t.url === url);
    if (keepOne) {
      const keep = matching.find(t => t.active) || matching[0];
      for (const tab of matching) {
        if (tab.id !== keep.id) toClose.push(tab.id);
      }
    } else {
      for (const tab of matching) toClose.push(tab.id);
    }
  }

  if (toClose.length > 0) await chrome.tabs.remove(toClose);
  await fetchOpenTabs();
  await loadSessionGroups(openTabs.map(tab => tab.id));
}

async function closeTabOutDupes() {
  const current = await chrome.tabs.getCurrent();
  if (!current) return;
  const tabs = await chrome.tabs.query({});
  const ids = AstabCore.closableNewTabs(tabs, current, chrome.runtime.getURL('index.html'));
  if (ids.length) await chrome.tabs.remove(ids);
  await fetchOpenTabs();
}

let domainGroups = [];

function getRealTabs() {
  return openTabs.filter(t => {
    const url = t.url || '';
    return (
      !url.startsWith('chrome://') &&
      !url.startsWith('chrome-extension://') &&
      !url.startsWith('about:') &&
      !url.startsWith('edge://') &&
      !url.startsWith('brave://')
    );
  });
}

async function checkTabOutDupes() {
  const tabOutTabs = openTabs.filter(t => t.isTabOut);
  const banner  = document.getElementById('tabOutDupeBanner');
  const countEl = document.getElementById('tabOutDupeCount');
  if (!banner) return;

  if (tabOutTabs.length > 1) {
    if (countEl) countEl.textContent = tabOutTabs.length;
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

function renderCopyTitleButton(tab) {
  const title = runtimeEscapeHtmlAttribute(tab.title || tab.url || '');
  return `<button class="chip-action chip-copy" type="button" data-action="copy-tab-title" data-copy-title="${title}" aria-label="Copy title" title="Copy title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg></button>`;
}

function buildOverflowChips(hiddenTabs, urlCounts = {}) {
  const hiddenChips = hiddenTabs.map(tab => {
    const label    = cleanTitle(smartTitle(stripTitleNoise(tab.title || ''), tab.url), '');
    const count    = urlCounts[tab.url] || 1;
    const dupeTag  = count > 1 ? ` <span class="chip-dupe-badge">(${count}x)</span>` : '';
    const chipClass = count > 1 ? ' chip-has-dupes' : '';
    const safeUrl   = (tab.url || '').replace(/"/g, '&quot;');
    const safeTitle = label.replace(/"/g, '&quot;');
    const iconData = runtimeGetIconSources(tab, 16);
    const faviconUrl = iconData.sources[0] || '';
    const fallbackUrl = iconData.sources[1] || '';
    const fallbackLabel = runtimeGetFallbackLabel(label, iconData.hostname);
    return `<div class="page-chip clickable${chipClass}" data-action="focus-tab" data-tab-url="${safeUrl}" aria-label="${safeTitle}">
      ${faviconUrl ? `<img class="chip-favicon" src="${faviconUrl}" alt="" data-fallback-src="${fallbackUrl}">` : ''}
      <span class="chip-favicon chip-favicon-fallback"${faviconUrl ? ' style="display:none"' : ''}>${fallbackLabel}</span>
      <span class="chip-text">${label}</span>${dupeTag}
      <div class="chip-actions">
        ${buildMoveMenu(tab)}
        ${renderCopyTitleButton(tab)}
        <button class="chip-action chip-save" type="button" data-action="defer-single-tab" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" aria-label="Save for later" title="Save for later">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
        </button>
        <button class="chip-action chip-close" type="button" data-action="close-single-tab" data-tab-url="${safeUrl}" aria-label="Close this tab" title="Close this tab">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>`;
  }).join('');

  return `
    <div class="page-chips-overflow" style="display:none">${hiddenChips}</div>
    <div class="page-chip page-chip-overflow clickable" data-action="expand-chips">
      <span class="chip-text">+${hiddenTabs.length} more</span>
    </div>`;
}

function renderDomainCard(group, index = 0) {
  const tabs      = group.tabs || [];
  const tabCount  = tabs.length;
  const isLanding = group.domain === '__landing-pages__';
  const stableId  = getStableGroupId(group.domain);

  const urlCounts = {};
  for (const tab of tabs) urlCounts[tab.url] = (urlCounts[tab.url] || 0) + 1;
  const dupeUrls   = Object.entries(urlCounts).filter(([, c]) => c > 1);
  const hasDupes   = dupeUrls.length > 0;
  const totalExtras = dupeUrls.reduce((s, [, c]) => s + c - 1, 0);

  const tabBadge = `<span class="open-tabs-badge">
    ${ICONS.tabs}
    ${tabCount} tab${tabCount !== 1 ? 's' : ''} open
  </span>`;

  const dupeBadge = hasDupes
    ? `<span class="open-tabs-badge is-duplicate">
        ${totalExtras} duplicate${totalExtras !== 1 ? 's' : ''}
      </span>`
    : '';

  const seen = new Set();
  const uniqueTabs = [];
  for (const tab of tabs) {
    if (!seen.has(tab.url)) { seen.add(tab.url); uniqueTabs.push(tab); }
  }

  const orderedTabs = getOrderedUniqueTabsForGroup(group);
  const visibleTabs = orderedTabs.slice(0, 8);
  const extraCount  = orderedTabs.length - visibleTabs.length;

  const pageChips = visibleTabs.map(tab => {
    let label = cleanTitle(smartTitle(stripTitleNoise(tab.title || ''), tab.url), group.domain);
    try {
      const parsed = new URL(tab.url);
      if (parsed.hostname === 'localhost' && parsed.port) label = `${parsed.port} ${label}`;
    } catch {}
    const count    = urlCounts[tab.url];
    const dupeTag  = count > 1 ? ` <span class="chip-dupe-badge">(${count}x)</span>` : '';
    const chipClass = count > 1 ? ' chip-has-dupes' : '';
    const safeUrl   = (tab.url || '').replace(/"/g, '&quot;');
    const safeTitle = label.replace(/"/g, '&quot;');
    const safeSortId = (runtimeEscapeHtmlAttribute ? runtimeEscapeHtmlAttribute(tab.url) : tab.url.replace(/"/g, '&quot;'));
    const safeGroupId = (runtimeEscapeHtmlAttribute ? runtimeEscapeHtmlAttribute(group.domain) : String(group.domain).replace(/"/g, '&quot;'));
    const iconData = runtimeGetIconSources(tab, 16);
    const faviconUrl = iconData.sources[0] || '';
    const fallbackUrl = iconData.sources[1] || '';
    const fallbackLabel = runtimeGetFallbackLabel(label, iconData.hostname);
    return `<div class="page-chip clickable${chipClass}" data-action="focus-tab" data-tab-url="${safeUrl}" data-chip-sort-id="${safeSortId}" data-chip-group-id="${safeGroupId}" aria-label="${safeTitle}">
      <button class="drawer-reorder-handle chip-reorder-handle" type="button" data-chip-drag-handle="tab" aria-label="Drag to reorder tab">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01" /></svg>
      </button>
      ${faviconUrl ? `<img class="chip-favicon" src="${faviconUrl}" alt="" data-fallback-src="${fallbackUrl}">` : ''}
      <span class="chip-favicon chip-favicon-fallback"${faviconUrl ? ' style="display:none"' : ''}>${fallbackLabel}</span>
      <span class="chip-text">${label}</span>${dupeTag}
      <div class="chip-actions">
        ${buildMoveMenu(tab)}
        ${renderCopyTitleButton(tab)}
        <button class="chip-action chip-save" data-action="defer-single-tab" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" title="Save for later">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
        </button>
        <button class="chip-action chip-close" data-action="close-single-tab" data-tab-url="${safeUrl}" title="Close this tab">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>`;
  }).join('') + (extraCount > 0 ? buildOverflowChips(orderedTabs.slice(8), urlCounts) : '');

  const closeAllButton = `
      <button class="action-btn close-tabs" type="button" data-action="close-domain-tabs" data-domain-id="${stableId}">
        ${ICONS.close}
        Close group
      </button>`;

  let actionsHtml = '';
  if (hasDupes) {
    const dupeUrlsEncoded = dupeUrls.map(([url]) => encodeURIComponent(url)).join(',');
    actionsHtml += `
      <button class="action-btn" type="button" data-action="dedup-keep-one" data-dupe-urls="${dupeUrlsEncoded}">
        Close ${totalExtras} duplicate${totalExtras !== 1 ? 's' : ''}
      </button>`;
  }

  return `
    <div class="mission-card domain-card ${hasDupes ? 'has-amber-bar' : 'has-neutral-bar'}" data-domain-id="${stableId}" data-group-id="${group.domain}" style="--card-enter-index: ${index}">
      <div class="status-bar"></div>
      <div class="mission-content">
        <div class="mission-top">
          <div class="mission-heading" tabindex="0" role="button" aria-roledescription="sortable card" aria-label="Reorder ${runtimeEscapeHtmlAttribute(isLanding ? 'Homepages' : (group.label || friendlyDomain(group.domain)))}" aria-keyshortcuts="Space ArrowUp ArrowDown Enter Escape">
            <span class="mission-name">${isLanding ? 'Homepages' : (group.label || friendlyDomain(group.domain))}</span>
            ${tabBadge}
            ${dupeBadge}
          </div>
          ${closeAllButton}
        </div>
        <div class="mission-pages">${pageChips}</div>
        ${actionsHtml ? `<div class="actions">${actionsHtml}</div>` : ''}
      </div>
      <div class="mission-meta">
        <div class="mission-page-count">${tabCount}</div>
        <div class="mission-page-label">tabs</div>
      </div>
    </div>`;
}

function renderDeskTools() {
  return `
      <button class="header-theme-trigger" id="themeMenuTrigger" type="button" data-action="toggle-theme-menu" data-tooltip="Desk settings" aria-label="Desk settings" aria-expanded="false" aria-controls="themeMenuPanel">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 7.5h15m-12 4.5h9m-6 4.5h3" />
          <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="16.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="10.5" cy="16.5" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <div class="theme-menu" id="themeMenuPanel" hidden role="dialog" aria-label="Desk settings panel">
        <div class="theme-menu-section">
          <div class="theme-menu-label">Desk palette</div>
          <div class="theme-options" id="themeOptions"></div>
        </div>
        <div class="theme-menu-section">
          <div class="theme-menu-label">Desk backdrop</div>
          <div class="theme-menu-actions">
            <button class="theme-menu-action" type="button" data-action="open-background-picker">Upload image</button>
            <button class="theme-menu-action is-secondary" type="button" data-action="clear-custom-background">Clear</button>
          </div>
        </div>
        <div class="theme-menu-section">
          <div class="theme-menu-row">
            <div class="theme-menu-label">Surface depth</div>
            <div class="theme-range-value" id="themeTransparencyValue">14%</div>
          </div>
          <input class="theme-range" id="themeTransparencyRange" type="range" aria-label="Surface depth" min="2" max="60" step="1" value="14">

          <div class="theme-menu-row" style="margin-top: 14px;">
            <div class="theme-menu-label">Bg Blur (模糊)</div>
            <div class="theme-range-value" id="themeBlurValue">0px</div>
          </div>
          <input class="theme-range" id="themeBlurRange" type="range" min="0" max="60" step="1" value="0">

          <div class="theme-menu-row" style="margin-top: 14px;">
            <div class="theme-menu-label">Bg Overlay (遮罩)</div>
            <div class="theme-range-value" id="themeOverlayValue">20%</div>
          </div>
          <input class="theme-range" id="themeOverlayRange" type="range" min="0" max="100" step="1" value="20">
        </div>
        <input type="file" id="themeBackgroundInput" accept="image/*" hidden>
      </div>`;
}

/* ----------------------------------------------------------------
   BOOKMARK SYNC ENGINE
   ---------------------------------------------------------------- */
let bookmarksInitialized = false;
async function renderBookmarkShortcuts() {
  if (bookmarksInitialized) return;
  bookmarksInitialized = true;
  await AstabBookmarks.refresh();
}

// 强制覆盖全局函数，防止其他老代码 (ui-helpers.js) 把它改回去
globalThis.renderQuickShortcuts = renderBookmarkShortcuts;

/* ----------------------------------------------------------------
   MAIN DASHBOARD RENDERER
   ---------------------------------------------------------------- */

async function renderStaticDashboard() {
  const tools = document.getElementById('deskTools');
  if (tools && !tools.children.length) tools.innerHTML = renderDeskTools();
  // --- Header ---
  const greetingEl = document.getElementById('greeting');
  const dateEl     = document.getElementById('dateDisplay');
  if (greetingEl) greetingEl.textContent = getGreeting();
  if (dateEl)     dateEl.textContent     = getDateDisplay();
  renderThemeMenu();
  
  // 这里不再调用旧的 renderQuickShortcuts()，而是直接调用书签渲染
  await renderBookmarkShortcuts();

  await AstabTabs.render();

  // --- Footer stats ---
  const statTabs = document.getElementById('statTabs');
  if (statTabs) statTabs.textContent = openTabs.length;

  checkTabOutDupes();

  // --- Render "Saved for Later" column ---
  await renderDeferredColumn();
}

async function renderDashboard() {
  await renderStaticDashboard();
}

function handleIconError(imgEl, fallbackUrl) {
  if (!imgEl) return;

  if (fallbackUrl && imgEl.dataset.fallbackApplied !== 'true') {
    imgEl.dataset.fallbackApplied = 'true';
    imgEl.src = fallbackUrl;
    return;
  }

  imgEl.style.display = 'none';
  const sibling = imgEl.nextElementSibling;
  if (sibling && (
    sibling.classList.contains('group-nav-fallback') ||
    sibling.classList.contains('chip-favicon-fallback') ||
    sibling.classList.contains('inline-favicon-fallback') ||
    sibling.classList.contains('quick-shortcut-fallback')
  )) {
    sibling.style.display = sibling.classList.contains('inline-favicon-fallback') ? 'inline-flex' : 'flex';
  }
}

function updateBackToTopVisibility() {
  const button = document.getElementById('backToTopBtn');
  if (!button) return;
  const shouldShow = window.scrollY > 320;
  button.classList.toggle('visible', shouldShow);
}


/* ----------------------------------------------------------------
   EVENT HANDLERS
   ---------------------------------------------------------------- */

document.addEventListener('click', async (e) => {
  if (e.target.closest('.chip-reorder-handle')) return;
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;

  const action = actionEl.dataset.action;

  if (action === 'toggle-theme-menu') {
    setThemeMenuOpen(!themeMenuOpen);
    return;
  }

  if (action === 'select-theme') {
    const themeId = actionEl.dataset.themeId || 'sage';
    await saveThemePreferences({ themeId });
    showToast('Theme updated');
    return;
  }

  if (action === 'open-background-picker') {
    document.getElementById('themeBackgroundInput')?.click();
    return;
  }

  if (action === 'clear-custom-background') {
    await saveThemePreferences({ customBackground: '' });
    await AstabWallpaper.useCustom();
    setThemeMenuOpen(false, { restoreFocus: true });
    showToast('Background cleared');
    return;
  }

  if (action === 'close-tabout-dupes') {
    await closeTabOutDupes();
    playCloseSound();
    const banner = document.getElementById('tabOutDupeBanner');
    if (banner) {
      banner.style.transition = 'opacity 0.4s';
      banner.style.opacity = '0';
      setTimeout(() => { banner.style.display = 'none'; banner.style.opacity = '1'; }, 400);
    }
    showToast('Closed extra new tabs');
    return;
  }

  const card = actionEl.closest('.mission-card');

  if (action === 'toggle-move-menu') {
    e.stopPropagation();
    const menu = actionEl.closest('.chip-move-wrap')?.querySelector('.chip-move-menu');
    const shouldOpen = Boolean(menu?.hidden);
    closeMoveMenus();
    if (menu && shouldOpen) {
      menu.hidden = false;
      actionEl.classList.add('is-open');
      actionEl.setAttribute('aria-expanded', 'true');
    }
    return;
  }

  if (action === 'move-tab-to-group') {
    e.stopPropagation();
    const tabId = Number(actionEl.dataset.tabId);
    const groupId = actionEl.dataset.groupId;
    const group = sessionGroupsState.groups.find(item => item.id === groupId);
    if (!tabId || !groupId || !group) return;

    const nextState = assignTabToSessionGroup(sessionGroupsState, tabId, groupId);
    await saveSessionGroups(nextState);
    closeMoveMenus();
    await renderDashboard();
    showToast(`Moved to ${group.name}`);
    return;
  }

  if (action === 'move-tab-to-new-group') {
    e.stopPropagation();
    const tabId = Number(actionEl.dataset.tabId);
    if (!tabId) return;

    const nextName = window.prompt('New group name');
    if (!nextName || !nextName.trim()) {
      closeMoveMenus();
      return;
    }

    try {
      const created = addSessionGroup(sessionGroupsState, nextName);
      const nextState = assignTabToSessionGroup(created.state, tabId, created.group.id);
      await saveSessionGroups(nextState);
      closeMoveMenus();
      await renderDashboard();
      showToast(`Created ${created.group.name}`);
    } catch (err) {
      showToast(err.message || 'Could not create group');
    }
    return;
  }

  if (action === 'move-tab-to-original') {
    e.stopPropagation();
    const tabId = Number(actionEl.dataset.tabId);
    if (!tabId) return;

    const nextState = pruneSessionGroups(
      clearTabSessionGroup(sessionGroupsState, tabId),
      openTabs.map(tab => tab.id)
    );
    await saveSessionGroups(nextState);
    closeMoveMenus();
    await renderDashboard();
    showToast('Moved back to original group');
    return;
  }

  if (action === 'expand-chips') {
    const overflowContainer = actionEl.parentElement.querySelector('.page-chips-overflow');
    if (overflowContainer) {
      overflowContainer.style.display = 'contents';
      actionEl.remove();
    }
    return;
  }

  if (action === 'copy-tab-title') {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(actionEl.dataset.copyTitle || ''); showToast('Title copied'); }
    catch { showToast('Could not copy title'); }
    return;
  }

  if (action === 'focus-tab') {
    const tabUrl = actionEl.dataset.tabUrl;
    if (tabUrl) await focusTab(tabUrl);
    return;
  }

  if (action === 'close-single-tab') {
    e.stopPropagation(); 
    const tabUrl = actionEl.dataset.tabUrl;
    if (!tabUrl) return;

    const allTabs = await chrome.tabs.query({});
    const match   = allTabs.find(t => t.url === tabUrl);
    if (match) await chrome.tabs.remove(match.id);
    await fetchOpenTabs();
    await loadSessionGroups(openTabs.map(tab => tab.id));

    playCloseSound();

    const chip = actionEl.closest('.page-chip');
    if (chip) {
      const rect = chip.getBoundingClientRect();
      shootConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);
      chip.style.transition = 'opacity 0.2s, transform 0.2s';
      chip.style.opacity    = '0';
      chip.style.transform  = 'scale(0.8)';
      setTimeout(() => {
        chip.remove();
        const parentCard = document.querySelector('.mission-card:has(.mission-pages:empty)');
        if (parentCard) animateCardOut(parentCard);
        document.querySelectorAll('.mission-card').forEach(c => {
          if (c.querySelectorAll('.page-chip[data-action="focus-tab"]').length === 0) {
            animateCardOut(c);
          }
        });
      }, 200);
    }

    const statTabs = document.getElementById('statTabs');
    if (statTabs) statTabs.textContent = openTabs.length;

    showToast('Tab closed');
    return;
  }

  if (action === 'defer-single-tab') {
    e.stopPropagation();
    const tabUrl   = actionEl.dataset.tabUrl;
    const tabTitle = actionEl.dataset.tabTitle || tabUrl;
    if (!tabUrl) return;

    try {
      await saveTabForLater({ url: tabUrl, title: tabTitle });
    } catch (err) {
      console.error('[tab-harbor] Failed to save tab:', err);
      showToast('Failed to save tab');
      return;
    }

    const allTabs = await chrome.tabs.query({});
    const match   = allTabs.find(t => t.url === tabUrl);
    if (match) await chrome.tabs.remove(match.id);
    await fetchOpenTabs();
    await loadSessionGroups(openTabs.map(tab => tab.id));

    const chip = actionEl.closest('.page-chip');
    if (chip) {
      chip.style.transition = 'opacity 0.2s, transform 0.2s';
      chip.style.opacity    = '0';
      chip.style.transform  = 'scale(0.8)';
      setTimeout(() => chip.remove(), 200);
    }

    showToast('Saved for later');
    await renderDeferredColumn();
    return;
  }

  if (action === 'check-deferred') {
    const id = actionEl.dataset.deferredId;
    if (!id) return;

    await checkOffSavedTab(id);

    const item = actionEl.closest('.deferred-item');
    if (item) {
      item.classList.add('checked');
      setTimeout(() => {
        item.classList.add('removing');
        setTimeout(() => {
          item.remove();
          renderDeferredColumn(); 
        }, 300);
      }, 800);
    }
    return;
  }

  if (action === 'dismiss-deferred') {
    const id = actionEl.dataset.deferredId;
    if (!id) return;

    await dismissSavedTab(id);

    const item = actionEl.closest('.deferred-item');
    if (item) {
      item.classList.add('removing');
      setTimeout(() => {
        item.remove();
        renderDeferredColumn();
      }, 300);
    }
    return;
  }

  if (action === 'restore-deferred') {
    const id = actionEl.dataset.deferredId;
    if (!id) return;

    const restored = await restoreSavedTab(id);
    if (!restored?.url) return;

    await reopenSavedTab(restored.url);
    await renderDashboard();

    const item = actionEl.closest('.deferred-item');
    if (item) {
      item.classList.add('removing');
      setTimeout(() => {
        item.remove();
      }, 300);
    }

    showToast('Restored to open tabs');
    return;
  }

  if (action === 'delete-archive-item') {
    const id = actionEl.dataset.archiveId;
    if (!id) return;

    await deleteArchivedTab(id);
    await renderDeferredColumn();
    showToast('Removed from archive');
    return;
  }

  if (action === 'clear-archive') {
    await clearArchivedTabs();
    await renderDeferredColumn();
    showToast('Archive cleared');
    return;
  }

  if (action === 'close-domain-tabs') {
    if (!AstabCloseConfirm.confirm(actionEl)) return;
    const domainId = actionEl.dataset.domainId;
    const group    = domainGroups.find(g => {
      return 'domain-' + g.domain.replace(/[^a-z0-9]/g, '-') === domainId;
    });
    if (!group) return;

    const urls      = group.tabs.map(t => t.url);
    const useExact  = group.domain === '__landing-pages__' || !!group.label;

    if (useExact) {
      await closeTabsExact(urls);
    } else {
      await closeTabsByUrls(urls);
    }

    if (card) {
      playCloseSound();
      animateCardOut(card);
    }

    const idx = domainGroups.indexOf(group);
    if (idx !== -1) domainGroups.splice(idx, 1);

    const groupLabel = group.domain === '__landing-pages__' ? 'Homepages' : (group.label || friendlyDomain(group.domain));
    showToast(`Closed ${urls.length} tab${urls.length !== 1 ? 's' : ''} from ${groupLabel}`);

    const statTabs = document.getElementById('statTabs');
    if (statTabs) statTabs.textContent = openTabs.length;
    return;
  }

  if (action === 'dedup-keep-one') {
    const urlsEncoded = actionEl.dataset.dupeUrls || '';
    const urls = urlsEncoded.split(',').map(u => decodeURIComponent(u)).filter(Boolean);
    if (urls.length === 0) return;

    await closeDuplicateTabs(urls, true);
    playCloseSound();

    actionEl.style.transition = 'opacity 0.2s';
    actionEl.style.opacity    = '0';
    setTimeout(() => actionEl.remove(), 200);

    if (card) {
      card.querySelectorAll('.chip-dupe-badge').forEach(b => {
        b.style.transition = 'opacity 0.2s';
        b.style.opacity    = '0';
        setTimeout(() => b.remove(), 200);
      });
      card.querySelectorAll('.open-tabs-badge').forEach(badge => {
        if (badge.textContent.includes('duplicate')) {
          badge.style.transition = 'opacity 0.2s';
          badge.style.opacity    = '0';
          setTimeout(() => badge.remove(), 200);
        }
      });
      card.classList.remove('has-amber-bar');
      card.classList.add('has-neutral-bar');
    }

    showToast('Closed duplicates, kept one copy each');
    return;
  }

  if (action === 'close-all-open-tabs') {
    if (!AstabCloseConfirm.confirm(actionEl)) return;
    const allUrls = openTabs
      .filter(t => t.url && !t.url.startsWith('chrome') && !t.url.startsWith('about:'))
      .map(t => t.url);
    await closeTabsByUrls(allUrls);
    playCloseSound();

    document.querySelectorAll('#openTabsMissions .mission-card').forEach(c => {
      shootConfetti(
        c.getBoundingClientRect().left + c.offsetWidth / 2,
        c.getBoundingClientRect().top  + c.offsetHeight / 2
      );
      animateCardOut(c);
    });

    showToast('All tabs closed. Fresh start.');
    return;
  }
});

document.addEventListener('click', (e) => {
  const themeTrigger = document.getElementById('themeMenuTrigger');
  const themePanel = document.getElementById('themeMenuPanel');
  if (
    themeMenuOpen &&
    themePanel &&
    !themePanel.contains(e.target) &&
    !themeTrigger?.contains(e.target)
  ) {
    setThemeMenuOpen(false);
  }

  if (e.target.closest('.chip-move-wrap')) return;
  closeMoveMenus();
});

document.addEventListener('click', (e) => {
  const trigger = e.target.closest('#deferredTrigger');
  if (trigger) {
    if (Date.now() < deferredTriggerSuppressClickUntil) return;
    const nextOpen = !(deferredPanelOpen && drawerView === 'saved');
    drawerView = 'saved';
    setDeferredPanelOpen(nextOpen);
    return;
  }

  const todoTrigger = e.target.closest('#todoTrigger');
  if (todoTrigger) {
    if (Date.now() < deferredTriggerSuppressClickUntil) return;
    const nextOpen = !(deferredPanelOpen && drawerView === 'todos');
    drawerView = 'todos';
    setDeferredPanelOpen(nextOpen);
    return;
  }

  if (e.target.closest('#deferredCloseBtn') || e.target.closest('#deferredOverlay')) {
    setDeferredPanelOpen(false);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && themeMenuOpen) {
    setThemeMenuOpen(false, { restoreFocus: true });
    return;
  }

  if (e.key === 'Escape' && deferredPanelOpen) {
    setDeferredPanelOpen(false);
  }
});

document.addEventListener('pointerdown', (e) => {
  const trigger = e.target.closest('.deferred-trigger');
  const triggerStack = document.getElementById('drawerTriggerStack');
  if (!trigger || !triggerStack || isMobileDeferredLayout() || e.button !== 0) return;

  const rect = triggerStack.getBoundingClientRect();
  deferredTriggerDragState = {
    startY: e.clientY,
    offsetY: e.clientY - rect.top,
    moved: false,
  };
});

document.addEventListener('pointermove', (e) => {
  if (!deferredTriggerDragState || isMobileDeferredLayout()) return;

  const triggerStack = document.getElementById('drawerTriggerStack');
  if (!triggerStack) return;

  const distance = Math.abs(e.clientY - deferredTriggerDragState.startY);
  if (!deferredTriggerDragState.moved && distance < 6) return;

  deferredTriggerDragState.moved = true;
  const nextTop = runtimeClampTriggerTop(
    e.clientY - deferredTriggerDragState.offsetY,
    window.innerHeight,
    triggerStack.offsetHeight || 96,
    24
  );
  if (nextTop == null) return;

  deferredTriggerPosition = { top: nextTop };
  triggerStack.style.top = `${nextTop}px`;
});

document.addEventListener('pointerup', async () => {
  if (!deferredTriggerDragState) return;

  if (deferredTriggerDragState.moved) {
    await saveDeferredTriggerPosition(deferredTriggerPosition);
    deferredTriggerSuppressClickUntil = Date.now() + 250;
  }

  deferredTriggerDragState = null;
});

document.addEventListener('click', (e) => {
  const backToTopBtn = e.target.closest('#backToTopBtn');
  if (!backToTopBtn) return;

  window.scrollTo({
    top: 0,
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  });
});

document.addEventListener('click', async (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;

  const action = actionEl.dataset.action;

  if (action === 'switch-drawer-view') {
    drawerView = actionEl.dataset.view || 'saved';
    todoDetailId = '';
    await renderDeferredColumn();
    return;
  }

  if (action === 'toggle-saved-search') {
    savedSearchOpen = !savedSearchOpen;
    if (!savedSearchOpen) savedSearchQuery = '';
    await renderDeferredColumn();
    return;
  }

  if (action === 'toggle-todo-search') {
    todoSearchOpen = !todoSearchOpen;
    if (!todoSearchOpen) todoSearchQuery = '';
    await renderDeferredColumn();
    return;
  }

  if (action === 'create-todo') {
    const title = window.prompt('Todo title');
    if (!title || !title.trim()) return;
    const description = window.prompt('Todo details (optional)') || '';
    await createTodoItem({ title, description });
    drawerView = 'todos';
    todoDetailId = '';
    await renderDeferredColumn();
    return;
  }

  if (action === 'open-todo-detail') {
    todoDetailId = actionEl.dataset.todoId || '';
    await renderDeferredColumn();
    return;
  }

  if (action === 'close-todo-detail') {
    todoDetailId = '';
    await renderDeferredColumn();
    return;
  }

  if (action === 'complete-todo') {
    const id = actionEl.dataset.todoId;
    if (!id) return;
    await completeTodoItem(id);
    if (todoDetailId === id) todoDetailId = '';
    await renderDeferredColumn();
    return;
  }

  if (action === 'delete-todo-archive') {
    const id = actionEl.dataset.todoId;
    if (!id) return;
    await deleteTodoItem(id);
    await renderDeferredColumn();
    return;
  }

  if (action === 'clear-todo-archive') {
    await clearTodoArchiveItems();
    await renderDeferredColumn();
    return;
  }

  if (action === 'close-drawer') {
    setDeferredPanelOpen(false);
    return;
  }
});

document.addEventListener('pointerdown', (e) => {
  const chipHandle = e.target.closest('[data-chip-drag-handle="tab"]');
  if (chipHandle && e.button === 0) {
    const item = chipHandle.closest('[data-chip-sort-id]');
    const listEl = item?.parentElement;
    const groupKey = item?.dataset.chipGroupId || '';
    if (!item || !listEl || !groupKey) return;

    e.preventDefault();
    draggedPageChipId = item.dataset.chipSortId || '';
    draggedPageChipEl = item;

    const rect = item.getBoundingClientRect();
    pageChipDragState = {
      groupKey,
      listEl,
      x: e.clientX,
      y: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      moved: false,
    };
    return;
  }

  const drawerHandle = e.target.closest('.drawer-reorder-handle');
  if (!drawerHandle || e.button !== 0) return;

  const item = drawerHandle.closest('[data-drawer-sort-id]');
  const listEl = item?.parentElement;
  const kind = item?.dataset.drawerSortKind || '';
  if (!item || !listEl || !kind) return;

  e.preventDefault();
  draggedDrawerItemId = item.dataset.drawerSortId || '';
  draggedDrawerItemEl = item;

  const rect = item.getBoundingClientRect();
  drawerItemDragState = {
    kind,
    listEl,
    x: e.clientX,
    y: e.clientY,
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
    moved: false,
  };
});

document.addEventListener('pointermove', (e) => {
  if (draggedPageChipId && pageChipDragState) {
    const distance = Math.hypot(e.clientX - pageChipDragState.x, e.clientY - pageChipDragState.y);
    if (!pageChipDragState.moved && distance >= 4) {
      pageChipDragState.moved = true;
      document.body.classList.add('page-chip-list-dragging');
      draggedPageChipEl?.classList.add('is-dragging');
      draggedPageChipEl?.style.setProperty('--drag-width', `${draggedPageChipEl.getBoundingClientRect().width}px`);
      ensurePageChipPlaceholder();
    }

    if (pageChipDragState.moved) {
      updateDraggedPageChipPosition(e.clientX, e.clientY);
      previewPageChipOrder(e.clientY);
    }
    return;
  }

  if (!draggedDrawerItemId || !drawerItemDragState) return;

  const distance = Math.hypot(e.clientX - drawerItemDragState.x, e.clientY - drawerItemDragState.y);
  if (!drawerItemDragState.moved && distance < 4) return;

  if (!drawerItemDragState.moved) {
    drawerItemDragState.moved = true;
    document.body.classList.add('drawer-list-dragging');
    draggedDrawerItemEl?.classList.add('is-dragging');
    draggedDrawerItemEl?.style.setProperty('--drag-width', `${draggedDrawerItemEl.getBoundingClientRect().width}px`);
    ensureDrawerItemPlaceholder();
  }

  updateDraggedDrawerItemPosition(e.clientX, e.clientY);
  previewDrawerItemOrder(e.clientY);
});

document.addEventListener('pointerup', async () => {
  if (draggedPageChipId && pageChipDragState) {
    const moved = pageChipDragState.moved;
    if (moved) {
      const orderUrls = [...pageChipDragState.listEl.children]
        .map(node => {
          if (node === pageChipPlaceholderEl) return draggedPageChipId;
          if (node === draggedPageChipEl) return '';
          return node.dataset?.chipSortId || '';
        })
        .filter(Boolean);

      await saveGroupTabRowOrder(pageChipDragState.groupKey, orderUrls);
      if (draggedPageChipEl && pageChipPlaceholderEl) {
        pageChipDragState.listEl.insertBefore(draggedPageChipEl, pageChipPlaceholderEl);
      }
    }

    clearPageChipDragState();

    if (moved) {
    }
    return;
  }

  if (!draggedDrawerItemId || !drawerItemDragState) return;

  const moved = drawerItemDragState.moved;
  if (moved) {
    const orderIds = [...drawerItemDragState.listEl.children]
      .map(node => {
        if (node === drawerItemPlaceholderEl) return draggedDrawerItemId;
        return node.dataset?.drawerSortId || '';
      })
      .filter(Boolean);

    await saveDrawerItemOrder(drawerItemDragState.kind, orderIds);
  }

  const draggedKind = drawerItemDragState.kind;
  clearDrawerItemDragState();

  if (moved) {
    if (draggedKind === 'saved') {
      await renderDeferredColumn();
    } else if (draggedKind === 'todo') {
      await renderTodoPanel();
    }
  }
});

document.addEventListener('click', (e) => {
  const toggle = e.target.closest('#archiveToggle');
  if (!toggle) return;

  const nextOpen = !toggle.classList.contains('open');
  toggle.classList.toggle('open', nextOpen);
  toggle.setAttribute('aria-expanded', String(nextOpen));
  const body = document.getElementById('archiveBody');
  if (body) {
    body.hidden = !nextOpen;
    body.style.display = nextOpen ? 'block' : 'none';
  }
});

document.addEventListener('click', (e) => {
  const toggle = e.target.closest('#todoArchiveToggle');
  if (!toggle) return;

  const nextOpen = !toggle.classList.contains('open');
  toggle.classList.toggle('open', nextOpen);
  toggle.setAttribute('aria-expanded', String(nextOpen));
  const body = document.getElementById('todoArchiveBody');
  if (body) {
    body.hidden = !nextOpen;
    body.style.display = nextOpen ? 'block' : 'none';
  }
});

document.addEventListener('input', async (e) => {
  if (e.target.id === 'themeTransparencyRange') {
    themePreferences = normalizeThemePreferences({
      ...themePreferences,
      surfaceOpacity: Number(e.target.value),
    });
    applyThemePreferences();
    const valueEl = document.getElementById('themeTransparencyValue');
    if (valueEl) valueEl.textContent = `${themePreferences.surfaceOpacity}%`;
    await chrome.storage.local.set({ [THEME_PREFERENCES_KEY]: themePreferences });
    return;
  }
// --- 新增：处理模糊度滑动 ---
  if (e.target.id === 'themeBlurRange') {
    const val = e.target.value;
    document.documentElement.style.setProperty('--bg-blur', `${val}px`);
    const valEl = document.getElementById('themeBlurValue');
    if (valEl) valEl.textContent = `${val}px`;
    await chrome.storage.local.set({ customBgBlur: val });
    return;
  }

  // --- 新增：处理遮罩浓度滑动 ---
  if (e.target.id === 'themeOverlayRange') {
    const val = e.target.value;
    document.documentElement.style.setProperty('--bg-overlay-opacity', val / 100);
    const valEl = document.getElementById('themeOverlayValue');
    if (valEl) valEl.textContent = `${val}%`;
    await chrome.storage.local.set({ customBgOverlay: val });
    return;
  }

  if (e.target.id !== 'savedSearchInput') return;
  savedSearchQuery = e.target.value.trim();
  await renderDeferredColumn();
});

document.addEventListener('input', async (e) => {
  if (e.target.id !== 'todoSearchInput') return;
  todoSearchQuery = e.target.value.trim();
  await renderDeferredColumn();
});

// --- 新增：纯净无损图片处理引擎，彻底替代原版可能加了白膜的压缩函数 ---
function processCleanBackgroundImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        let width = img.width;
        let height = img.height;
        const maxSize = 2560; // 限制最大分辨率防卡顿
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round(height * (maxSize / width));
            width = maxSize;
          } else {
            width = Math.round(width * (maxSize / height));
            height = maxSize;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        // 原汁原味绘制，绝不在 Canvas 里画半透明白膜
        ctx.drawImage(img, 0, 0, width, height);
        
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

document.addEventListener('change', async (e) => {
  if (e.target.id !== 'themeBackgroundInput') return;

  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;

  try {
    // 抛弃原版的压缩函数，用我们的纯净引擎处理
    const customBackground = await TabOutBackgroundImage.compressImageFileForStorage(file);
    await saveThemePreferences({ customBackground });
    await AstabWallpaper.useCustom();
    
    
    setThemeMenuOpen(false, { restoreFocus: true });
    showToast('Background updated');
  } catch (err) {
    showToast(err?.message || 'Could not load background');
  }
});

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'headerSearchForm') return;

  e.preventDefault();
  const input = document.getElementById('headerSearchInput');
  const query = input?.value || '';
  await runDefaultSearch(query);
});


/* ----------------------------------------------------------------
   INITIALIZE
   ---------------------------------------------------------------- */
async function initializeDashboardRuntime() {
  await loadThemePreferences();
  // 读取我们自己的高斯模糊度和遮罩浓度
  const data = await chrome.storage.local.get(['customBgBlur', 'customBgOverlay']);
  const blur = data.customBgBlur !== undefined ? data.customBgBlur : 0;
  const overlay = data.customBgOverlay !== undefined ? data.customBgOverlay : 20;

  document.documentElement.style.setProperty('--bg-blur', `${blur}px`);
  document.documentElement.style.setProperty('--bg-overlay-opacity', overlay / 100);

  await AstabWallpaper.prepare();
  await renderDashboard();
  updateBackToTopVisibility();

  if (document.getElementById('themeBlurRange')) {
    document.getElementById('themeBlurRange').value = blur;
    document.getElementById('themeBlurValue').textContent = `${blur}px`;
  }
  if (document.getElementById('themeOverlayRange')) {
    document.getElementById('themeOverlayRange').value = overlay;
    document.getElementById('themeOverlayValue').textContent = `${overlay}%`;
  }

  setTimeout(() => {
    document.body.classList.add('app-ready');
  }, 1100);
}

// --- 新增：防抖定时器，防止瞬间多次重绘 ---
let renderDebounceTimer = null;
function queueRenderDashboard() {
  if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
  renderDebounceTimer = setTimeout(() => {
    renderDashboard();
  }, 150); // 合并 150 毫秒内的所有重绘请求
}

function mountDashboardRuntime() {
  if (!window.__tabHarborRuntimeMounted) {
    window.addEventListener('scroll', updateBackToTopVisibility, { passive: true });
    
    // 使用防抖后的函数代替原本直接调用的 renderDashboard()
    chrome.tabs.onCreated.addListener(() => queueRenderDashboard());
    chrome.tabs.onRemoved.addListener(() => queueRenderDashboard());
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === 'complete' || changeInfo.url) {
        queueRenderDashboard();
      }
    });

    window.__tabHarborRuntimeMounted = true;
  }
  return initializeDashboardRuntime();
}

globalThis.TabHarborDashboardRuntime = {
  initializeDashboardRuntime,
  mountDashboardRuntime,
};

globalThis.TabHarborDashboardRuntime = {
  initializeDashboardRuntime,
  mountDashboardRuntime,
};

// MV3 disallows inline event handlers. Capture image errors centrally.
document.addEventListener('error', event => {
  if (event.target instanceof HTMLImageElement && event.target.hasAttribute('data-fallback-src')) handleIconError(event.target, event.target.dataset.fallbackSrc);
}, true);
