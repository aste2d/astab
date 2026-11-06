'use strict';

(function attachSessionGroups(globalScope) {
  const EMPTY_STATE = {
    groups: [],
    assignments: {},
  };

  function normalizeSessionGroups(input) {
    const groups = Array.isArray(input?.groups)
      ? input.groups
        .filter(group => group && group.id && group.name)
        .map(group => ({
          id: String(group.id),
          name: String(group.name).trim(),
          createdAt: group.createdAt || new Date().toISOString(),
        }))
      : [];

    const assignments = {};
    if (input?.assignments && typeof input.assignments === 'object') {
      for (const [tabId, groupId] of Object.entries(input.assignments)) {
        if (!groupId) continue;
        assignments[String(tabId)] = String(groupId);
      }
    }

    return {
      groups,
      assignments,
    };
  }

  function addSessionGroup(state, name) {
    const normalizedState = normalizeSessionGroups(state);
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('Group name is required');

    const exists = normalizedState.groups.some(group => group.name.toLowerCase() === cleanName.toLowerCase());
    if (exists) throw new Error('A group with that name already exists');

    const group = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: cleanName,
      createdAt: new Date().toISOString(),
    };

    return {
      state: {
        ...normalizedState,
        groups: [...normalizedState.groups, group],
      },
      group,
    };
  }

  function assignTabToSessionGroup(state, tabId, groupId) {
    const normalizedState = normalizeSessionGroups(state);
    const exists = normalizedState.groups.some(group => group.id === String(groupId));
    if (!exists) throw new Error('Group not found');

    return {
      ...normalizedState,
      assignments: {
        ...normalizedState.assignments,
        [String(tabId)]: String(groupId),
      },
    };
  }

  function clearTabSessionGroup(state, tabId) {
    const normalizedState = normalizeSessionGroups(state);
    const assignments = { ...normalizedState.assignments };
    delete assignments[String(tabId)];

    return {
      ...normalizedState,
      assignments,
    };
  }

  function pruneSessionGroups(state, openTabIds) {
    const normalizedState = normalizeSessionGroups(state);
    const openIds = new Set((openTabIds || []).map(tabId => String(tabId)));
    const assignments = {};

    for (const [tabId, groupId] of Object.entries(normalizedState.assignments)) {
      if (openIds.has(tabId)) assignments[tabId] = groupId;
    }

    const activeGroupIds = new Set(Object.values(assignments));
    const groups = normalizedState.groups.filter(group => activeGroupIds.has(group.id));

    return {
      groups,
      assignments,
    };
  }

  const api = {
    addSessionGroup,
    assignTabToSessionGroup,
    clearTabSessionGroup,
    normalizeSessionGroups,
    pruneSessionGroups,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalScope.TabOutSessionGroups = api;
  globalScope.TabOutEmptySessionGroups = EMPTY_STATE;
})(typeof globalThis !== 'undefined' ? globalThis : window);
