'use strict';

// Existing tab layout and grouping, extracted unchanged from the dashboard orchestrator.
async function renderOpenTabsPanel() {
  if (globalThis.AstabCardDrag?.deferRender()) return;
  // --- Fetch tabs ---
  await fetchOpenTabs();
  const realTabs = getRealTabs();
  await loadSessionGroups(realTabs.map(tab => tab.id));
  await loadGroupOrder();

  // --- Group tabs by domain ---
  const LANDING_PAGE_PATTERNS = [
    { hostname: 'mail.google.com', test: (p, h) =>
        !h.includes('#inbox/') && !h.includes('#sent/') && !h.includes('#search/') },
    { hostname: 'x.com',               pathExact: ['/home'] },
    { hostname: 'www.linkedin.com',    pathExact: ['/'] },
    { hostname: 'github.com',          pathExact: ['/'] },
    { hostname: 'www.youtube.com',     pathExact: ['/'] },
    ...(typeof LOCAL_LANDING_PAGE_PATTERNS !== 'undefined' ? LOCAL_LANDING_PAGE_PATTERNS : []),
  ];

  function isLandingPage(url) {
    try {
      const parsed = new URL(url);
      return LANDING_PAGE_PATTERNS.some(p => {
        const hostnameMatch = p.hostname
          ? parsed.hostname === p.hostname
          : p.hostnameEndsWith
            ? parsed.hostname.endsWith(p.hostnameEndsWith)
            : false;
        if (!hostnameMatch) return false;
        if (p.test)       return p.test(parsed.pathname, url);
        if (p.pathPrefix) return parsed.pathname.startsWith(p.pathPrefix);
        if (p.pathExact)  return p.pathExact.includes(parsed.pathname);
        return parsed.pathname === '/';
      });
    } catch { return false; }
  }

  domainGroups = [];
  const manualGroupMap = Object.fromEntries(
    sessionGroupsState.groups.map(group => [
      group.id,
      {
        domain: `__session_group__:${group.id}`,
        label: group.name,
        tabs: [],
        isManual: true,
        manualGroupId: group.id,
        createdAt: group.createdAt,
      },
    ])
  );
  const groupMap    = {};
  const landingTabs = [];

  const customGroups = typeof LOCAL_CUSTOM_GROUPS !== 'undefined' ? LOCAL_CUSTOM_GROUPS : [];

  function matchCustomGroup(url) {
    try {
      const parsed = new URL(url);
      return customGroups.find(r => {
        const hostMatch = r.hostname
          ? parsed.hostname === r.hostname
          : r.hostnameEndsWith
            ? parsed.hostname.endsWith(r.hostnameEndsWith)
            : false;
        if (!hostMatch) return false;
        if (r.pathPrefix) return parsed.pathname.startsWith(r.pathPrefix);
        return true; 
      }) || null;
    } catch { return null; }
  }

  for (const tab of realTabs) {
    try {
      const assignedGroupId = sessionGroupsState.assignments[String(tab.id)];
      if (assignedGroupId && manualGroupMap[assignedGroupId]) {
        manualGroupMap[assignedGroupId].tabs.push({
          ...tab,
          manualGroupId: assignedGroupId,
        });
        continue;
      }

      if (isLandingPage(tab.url)) {
        landingTabs.push(tab);
        continue;
      }

      const customRule = matchCustomGroup(tab.url);
      if (customRule) {
        const key = customRule.groupKey;
        if (!groupMap[key]) groupMap[key] = { domain: key, label: customRule.groupLabel, tabs: [] };
        groupMap[key].tabs.push(tab);
        continue;
      }

      let hostname;
      if (tab.url && tab.url.startsWith('file://')) {
        hostname = 'local-files';
      } else {
        hostname = new URL(tab.url).hostname;
      }
      if (!hostname) continue;

      if (!groupMap[hostname]) groupMap[hostname] = { domain: hostname, tabs: [] };
      groupMap[hostname].tabs.push(tab);
    } catch {
      // Skip malformed URLs
    }
  }

  if (landingTabs.length > 0) {
    groupMap['__landing-pages__'] = { domain: '__landing-pages__', tabs: landingTabs };
  }

  const landingHostnames = new Set(LANDING_PAGE_PATTERNS.map(p => p.hostname).filter(Boolean));
  const landingSuffixes = LANDING_PAGE_PATTERNS.map(p => p.hostnameEndsWith).filter(Boolean);
  function isLandingDomain(domain) {
    if (landingHostnames.has(domain)) return true;
    return landingSuffixes.some(s => domain.endsWith(s));
  }
  const manualGroups = Object.values(manualGroupMap)
    .filter(group => group.tabs.length > 0)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  const automaticGroups = Object.values(groupMap).sort((a, b) => {
    const aIsLanding = a.domain === '__landing-pages__';
    const bIsLanding = b.domain === '__landing-pages__';
    if (aIsLanding !== bIsLanding) return aIsLanding ? -1 : 1;

    const aIsPriority = isLandingDomain(a.domain);
    const bIsPriority = isLandingDomain(b.domain);
    if (aIsPriority !== bIsPriority) return aIsPriority ? -1 : 1;

    return b.tabs.length - a.tabs.length;
  });
  domainGroups = applyGroupOrder([...manualGroups, ...automaticGroups], groupOrderState);
  await loadGroupTabOrder(domainGroups);

  if (globalThis.AstabCardDrag?.deferRender()) return;
  // --- Render domain cards ---
  const openTabsSection      = document.getElementById('openTabsSection');
  const openTabsMissionsEl   = document.getElementById('openTabsMissions');
  const openTabsSectionCount = document.getElementById('openTabsSectionCount');
  const openTabsSectionTitle = document.getElementById('openTabsSectionTitle');

  if (domainGroups.length > 0 && openTabsSection) {
    if (openTabsSectionTitle) openTabsSectionTitle.textContent = 'Open tabs';
    openTabsSectionCount.innerHTML = `<span class="section-summary">${realTabs.length} tab${realTabs.length !== 1 ? 's' : ''} across ${domainGroups.length} group${domainGroups.length !== 1 ? 's' : ''}</span><button class="action-btn close-tabs section-action" type="button" data-action="close-all-open-tabs">${ICONS.close} Close all tabs</button>`;
    openTabsMissionsEl.innerHTML = domainGroups.map((g, index) => renderDomainCard(g, index)).join('');
    openTabsSection.style.display = 'block';
  } else if (openTabsSection) {
    openTabsSection.style.display = 'block';
    openTabsSectionCount.textContent = '';
    openTabsMissionsEl.innerHTML = '<div class="desk-empty">A clear desk. Open a page and it will appear here.</div>';
  }

}

globalThis.AstabTabs = { render: renderOpenTabsPanel };
