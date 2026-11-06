'use strict';

(function (scope) {

  function isNewTab(tab, ownURL) {
    const url = tab.pendingUrl || tab.url || '';
    return [ownURL, 'chrome://newtab/', 'chrome://newtab', 'chrome://new-tab-page/'].includes(url);
  }

  function closableNewTabs(tabs, keep, ownURL) {
    if (!keep || !isNewTab(keep, ownURL)) return [];
    return tabs.filter(tab => tab.id !== keep.id && isNewTab(tab, ownURL)).map(tab => tab.id);
  }

  function bookmarkBars(nodes) {
    return nodes.filter(node => node.folderType === 'bookmarks-bar' ||
      (node.folderType === undefined && node.id === '1'));
  }

  function flattenBookmarks(nodes, path = []) {
    return nodes.flatMap(node => node.url ? [{ ...node, path: path.join(' / ') }] :
      flattenBookmarks(node.children || [], [...path, node.title].filter(Boolean)));
  }


  function localDay(now = Date.now()) {
    const date = new Date(now);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  const api = { isNewTab, closableNewTabs, bookmarkBars, flattenBookmarks, localDay };
  if (typeof module !== 'undefined') module.exports = api;
  scope.AstabCore = api;
})(globalThis);
