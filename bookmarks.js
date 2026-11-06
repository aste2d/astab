'use strict';

globalThis.AstabBookmarks = (() => {
  let tree = [];
  let folderId = null;
  let generation = 0;
  let mounted = false;
  let searchOpen = false;
  const byId = new Map();
  let allFolderId = null;
  let defaultExpanded = false;
  let renderedTree = null;
  let renderedAllFolder = null;

  function index(nodes, parent = null) {
    for (const node of nodes) {
      byId.set(node.id, { ...node, parent });
      index(node.children || [], node.id);
    }
  }

  function openFolder(id) {
    folderId = id;
    document.getElementById('bookmarkSearch').value = '';
    render();
    document.getElementById(id ? 'bookmarkBreadcrumbsBack' : 'bookmarkSearchToggle')?.focus();
  }

  function button(text, callback, className = '') {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = text;
    element.className = className;
    element.addEventListener('click', callback);
    return element;
  }

  function isWithinRoots(id, rootIds) {
    let node = byId.get(id);
    while (node) {
      if (rootIds.has(node.id)) return true;
      node = byId.get(node.parent);
    }
    return false;
  }

  function renderPath(container, id, rootIds, homeLabel, navigate) {
    container.replaceChildren();
    container.hidden = !id;
    if (!id) return;
    const chain = [];
    let node = byId.get(id);
    while (node && !rootIds.has(node.id)) {
      chain.unshift(node);
      node = byId.get(node.parent);
    }
    const parent = byId.get(id)?.parent;
    const back = button('‹', () => navigate(rootIds.has(parent) ? null : parent));
    back.id = container.id + 'Back';
    back.className = 'bookmark-back';
    back.setAttribute('aria-label', 'Back to parent folder');
    container.append(back, button(homeLabel, () => navigate(null)));
    for (const folder of chain) {
      const separator = document.createElement('span');
      separator.textContent = '/'; separator.setAttribute('aria-hidden', 'true');
      const item = folder.id === id ? document.createElement('span') : button(folder.title || 'Untitled folder', () => navigate(folder.id));
      if (folder.id === id) { item.textContent = folder.title || 'Untitled folder'; item.setAttribute('aria-current', 'page'); }
      container.append(separator, item);
    }
  }

  function createBookmarkCard(node, onFolder, query = '') {
      const card = document.createElement('div');
      card.className = 'quick-shortcut-card';
      const link = document.createElement(node.url ? 'a' : 'button');
      link.className = 'quick-shortcut-open';
      link.title = query && node.path ? `${node.title}\n${node.path}` : node.title;
      if (node.url) link.href = node.url;
      else {
        link.type = 'button';
        link.classList.add('bookmark-folder');
        link.addEventListener('click', () => onFolder(node.id));
        link.setAttribute('aria-label', `Open folder ${node.title || 'Untitled folder'}`);
      }
      const iconWrap = document.createElement('span');
      iconWrap.className = 'quick-shortcut-icon-wrap';
      if (node.url) {
        const icon = document.createElement('img');
        const url = new URL(chrome.runtime.getURL('/_favicon/'));
        url.searchParams.set('pageUrl', node.url);
        url.searchParams.set('size', '32');
        icon.src = url.href;
        icon.alt = '';
        icon.loading = 'lazy';
        icon.className = 'quick-shortcut-icon';
        icon.addEventListener('error', () => { icon.remove(); iconWrap.textContent = (node.title || '?').slice(0, 1); }, { once: true });
        iconWrap.append(icon);
      } else {
        iconWrap.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z"/></svg>';
      }
      const label = document.createElement('span');
      label.className = 'quick-shortcut-label';
      label.textContent = node.title || (node.url || 'Untitled folder');
      link.append(iconWrap, label);
      card.append(link);
    return card;
  }

  function renderAllBookmarks(sources, roots, query) {
    const barIds = new Set(AstabCore.bookmarkBars(roots).map(node => node.id));
    const otherRoots = roots.filter(node => !barIds.has(node.id));
    const rootIds = new Set(otherRoots.map(node => node.id));
    const homeItems = otherRoots.flatMap(node => node.children || []);
    sources.hidden = Boolean(query) || homeItems.length === 0;
    let disclosure = document.getElementById('allBookmarks');
    if (!disclosure) {
      disclosure = document.createElement('details');
      disclosure.id = 'allBookmarks'; disclosure.className = 'all-bookmarks';
      disclosure.open = defaultExpanded;
      const summary = document.createElement('summary'); summary.id = 'allBookmarksToggle'; summary.textContent = 'all bookmarks';
      const content = document.createElement('div'); content.className = 'all-bookmarks-content';
      const crumbs = document.createElement('nav'); crumbs.id = 'allBookmarkBreadcrumbs'; crumbs.className = 'bookmark-path'; crumbs.setAttribute('aria-label', 'All bookmarks folder');
      const grid = document.createElement('div'); grid.id = 'allBookmarksGrid'; grid.className = 'quick-tabs-grid';
      const empty = document.createElement('p'); empty.id = 'allBookmarksEmpty'; empty.className = 'deferred-empty';
      content.append(crumbs, grid, empty);disclosure.append(summary,content);sources.replaceChildren(disclosure);
    }
    if (allFolderId && !isWithinRoots(allFolderId, rootIds)) allFolderId = null;
    if (renderedTree === tree && renderedAllFolder === allFolderId) return;
    renderedTree = tree; renderedAllFolder = allFolderId;
    const navigate = id => {
      allFolderId = id;
      renderAllBookmarks(sources, tree[0]?.children || [], '');
      document.getElementById(id ? 'allBookmarkBreadcrumbsBack' : 'allBookmarksToggle')?.focus();
    };
    renderPath(document.getElementById('allBookmarkBreadcrumbs'), allFolderId, rootIds, 'all bookmarks', navigate);
    const children = allFolderId ? byId.get(allFolderId).children || [] : homeItems;
    document.getElementById('allBookmarksGrid').replaceChildren(...children.map(node=>createBookmarkCard(node,navigate)));
    const empty = document.getElementById('allBookmarksEmpty');
    empty.hidden = children.length > 0;
    empty.textContent = 'This folder is empty.';
  }
  function setAlwaysShow(enabled) {
    if (defaultExpanded === Boolean(enabled)) return;
    defaultExpanded = Boolean(enabled);
    const disclosure = document.getElementById('allBookmarks');
    if (disclosure) disclosure.open = defaultExpanded;
  }

  function render() {
    const container = document.getElementById('quickTabsList');
    if (!container) return;
    const roots = tree[0]?.children || [];
    const bars = AstabCore.bookmarkBars(roots);
    const barIds = new Set(bars.map(bar => bar.id));
    if (folderId && !isWithinRoots(folderId, barIds)) folderId = null;
    const query = document.getElementById('bookmarkSearch').value.trim().toLocaleLowerCase();
    const children = query ? AstabCore.flattenBookmarks(roots).filter(node =>
      `${node.title} ${node.url} ${node.path}`.toLocaleLowerCase().includes(query)) :
      folderId ? byId.get(folderId).children || [] : bars.flatMap(bar => bar.children || []);
    document.getElementById('bookmarkToolbar').hidden = !folderId && !searchOpen;
    document.getElementById('bookmarkSearch').hidden = !searchOpen;
    const crumbs = document.getElementById('bookmarkBreadcrumbs');
    renderPath(crumbs, folderId, barIds, 'Bookmarks bar', openFolder);
    if (query) {
      crumbs.hidden = false;
      const label = document.createElement('span');
      label.textContent = 'Search results';
      const clear = button('‹', () => { document.getElementById('bookmarkSearch').value = ''; render(); });
      clear.setAttribute('aria-label', 'Clear bookmark search');
      crumbs.replaceChildren(clear, label);
    }
    const fragment = document.createDocumentFragment();
    for (const node of children) {
      fragment.append(createBookmarkCard(node, openFolder, query));
    }
    container.replaceChildren(fragment);
    document.getElementById('bookmarkCount').textContent = `${children.length} ${query ? 'results' : 'items'}`;
    const empty = document.getElementById('bookmarkEmpty');
    empty.hidden = children.length > 0;
    empty.textContent = query ? 'No matching bookmarks. Try another word.' : 'This folder is empty. Add bookmarks in Chrome and they will appear here.';
    const sources = document.getElementById('bookmarkRoots');
    renderAllBookmarks(sources, roots, query);
    document.getElementById('bookmarkStatus').textContent = '';
  }

  async function refresh() {
    const request = ++generation;
    try {
      const result = await chrome.bookmarks.getTree();
      if (request !== generation) return;
      tree = result;
      byId.clear();
      index(tree);
      render();
    } catch (error) {
      document.getElementById('bookmarkStatus').textContent = 'Bookmarks could not be loaded. Check the extension’s bookmark permission, then retry.';
      console.warn('Could not load bookmarks:', error);
    }
  }

  function mount() {
    if (mounted) return;
    mounted = true;
    document.getElementById('bookmarkSearch').addEventListener('input', render);
    document.getElementById('bookmarkSearchToggle').addEventListener('click', () => {
      searchOpen = !searchOpen;
      document.getElementById('bookmarkSearchToggle').setAttribute('aria-expanded', String(searchOpen));
      if (!searchOpen) document.getElementById('bookmarkSearch').value = '';
      render();
      if (searchOpen) document.getElementById('bookmarkSearch').focus();
    });
    document.getElementById('bookmarkRetry').addEventListener('click', refresh);
    let pending;
    for (const event of ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportEnded']) {
      chrome.bookmarks[event]?.addListener(() => {
        clearTimeout(pending);
        pending = setTimeout(refresh, 100);
      });
    }
  }

  return { refresh, mount, setAlwaysShow };
})();
