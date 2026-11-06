'use strict';

(function attachIconUtils(globalScope) {
  function getHostname(url) {
    if (!url) return '';
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  function getGoogleFaviconUrl(hostname, size = 16) {
    // Kept as a compatibility alias; site URLs never go to an external icon service.
    return getLocalFaviconUrl(hostname ? `https://${hostname}` : '', size);
  }

  function getLocalFaviconUrl(pageUrl, size = 16) {
    if (!pageUrl || !globalScope.chrome?.runtime?.getURL) return '';
    const url = new URL(globalScope.chrome.runtime.getURL('/_favicon/'));
    url.searchParams.set('pageUrl', pageUrl);
    url.searchParams.set('size', String(size));
    return url.href;
  }

  function escapeHtmlAttribute(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function getFallbackLabel(label, hostname = '') {
    const cleanLabel = (label || '').trim();
    if (cleanLabel) {
      const tokens = cleanLabel
        .split(/[\s./:_-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(token => token[0]?.toUpperCase() || '');
      const joined = tokens.join('');
      if (joined) return joined;
    }

    const cleanHost = hostname.replace(/^www\./, '');
    return (cleanHost.slice(0, 2) || '?').toUpperCase();
  }

  function getIconSources({ favIconUrl = '', url = '' } = {}, size = 16) {
    const hostname = getHostname(url);
    const sources = [];

    const cached = getLocalFaviconUrl(url, size);
    if (cached) sources.push(cached);
    if (/^data:image\//.test(favIconUrl)) sources.push(favIconUrl);

    return {
      hostname,
      sources,
    };
  }

  function getGroupIcon(group, label, size = 32) {
    const tabs = group?.tabs || [];
    const preferredTab = tabs.find(tab => tab?.favIconUrl) || tabs[0] || {};
    const { hostname, sources } = getIconSources(preferredTab, size);

    return {
      hostname,
      src: sources[0] || '',
      fallbackSrc: sources[1] || '',
      fallbackLabel: getFallbackLabel(label, hostname),
    };
  }

  const api = {
    escapeHtmlAttribute,
    getFallbackLabel,
    getGoogleFaviconUrl,
    getLocalFaviconUrl,
    getGroupIcon,
    getHostname,
    getIconSources,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalScope.TabOutIconUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
