'use strict';

const {
  escapeHtmlAttribute: themeEscapeHtmlAttribute,
  getFallbackLabel: themeGetFallbackLabel,
  getIconSources: themeGetIconSources,
} = globalThis.TabOutIconUtils || {};

const {
  compressImageFileForStorage: themeCompressImageFileForStorage,
} = globalThis.TabOutBackgroundImage || {};

const {
  reorderSubsetByIds: themeReorderSubsetByIds,
} = globalThis.TabOutListOrder || {};

let themeMenuOpen = false;
let shortcutEditorState = {
  open: false,
  mode: 'create',
  shortcutId: '',
  url: '',
  label: '',
  icon: '',
  iconKind: '',
  focusReturnEl: null,
};
let quickShortcutDragState = null;
let quickShortcutDraggedId = '';
let quickShortcutDraggedEl = null;
let quickShortcutGhostEl = null;
let quickShortcutSlotEl = null;
let quickShortcutSuppressClickUntil = 0;
const THEME_PREFERENCES_KEY = 'themePreferences';
const QUICK_SHORTCUTS_KEY = 'quickShortcuts';
const FOCUSABLE_SELECTOR = [
  'button:not([disabled]):not([hidden])',
  '[href]:not([hidden])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const THEMES = {
  "sage": {
    "name": "Default",
    "vars": {
      "--ink": "#172018",
      "--paper": "#eef2eb",
      "--warm-gray": "#dbe3d7",
      "--muted": "#7f8c81",
      "--accent-amber": "#8b7146",
      "--accent-sage": "#4d6f57",
      "--accent-slate": "#5e7072",
      "--accent-rose": "#9a6860",
      "--workspace-accent": "#4f7657",
      "--workspace-accent-soft": "#deebe1",
      "--workspace-accent-border": "#9ebda6",
      "--workspace-accent-contrast": "#f6fbf7",
      "--status-active": "#446953",
      "--status-cooling": "#907548",
      "--status-abandoned": "#996760",
      "--card-bg": "#fafcf8"
    }
  }
};

let themePreferences = {
  themeId: 'sage',
  customBackground: '',
  surfaceOpacity: 14,
};

function normalizeThemePreferences(input) {
  const next = input && typeof input === 'object' ? input : {};
  const themeId = String(next.themeId || 'sage');
  const rawOpacity = Number(next.surfaceOpacity);
  const surfaceOpacity = Number.isFinite(rawOpacity)
    ? Math.min(60, Math.max(2, Math.round(rawOpacity)))
    : 14;
  return {
    themeId: themeId === 'custom' ? 'custom' : 'sage',
    colors: AstabPalette.normalize(next.colors, THEMES.sage.vars),
    customBackground: typeof next.customBackground === 'string' ? next.customBackground : '',
    surfaceOpacity,
  };
}

function normalizeQuickShortcuts(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter(item => item && item.url)
    .map(item => {
      const normalizedIcon = normalizeShortcutIcon(item.icon || item.customIcon || '');
      return {
        id: String(item.id || `shortcut-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
        url: String(item.url).trim(),
        label: String(item.label || '').trim(),
        icon: normalizedIcon.value,
        iconKind: normalizedIcon.kind,
      };
    })
    .filter(item => item.url);
}

function isSvgMarkup(value) {
  const text = String(value || '').trim();
  return /^<svg[\s>]/i.test(text) || /^<\?xml[\s\S]*<svg[\s>]/i.test(text);
}

function svgToDataUrl(svgText) {
  const normalized = String(svgText || '').trim();
  if (!normalized) return '';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(normalized)}`;
}

function extractIconFromClipboardHtml(html) {
  const raw = String(html || '').trim();
  if (!raw) return { value: '', kind: '' };

  if (isSvgMarkup(raw)) {
    return { value: raw, kind: 'svg' };
  }

  const imageMatch = raw.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imageMatch?.[1]) {
    const src = imageMatch[1].trim();
    if (/^data:image\//i.test(src)) {
      return { value: src, kind: 'image' };
    }
  }

  const svgMatch = raw.match(/<svg[\s\S]*<\/svg>/i);
  if (svgMatch?.[0]) {
    return { value: svgMatch[0], kind: 'svg' };
  }

  return { value: '', kind: '' };
}

function isTransientClipboardReference(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return (
    /^file:\/\//i.test(text) ||
    /^blob:/i.test(text) ||
    /^\/(private|var|tmp|Users)\//.test(text) ||
    /^[A-Za-z]:\\/.test(text)
  );
}

function getThemeDefinition(themeId) {
  return themeId === 'custom'
    ? { name: 'Custom', vars: AstabPalette.build(themePreferences.colors, THEMES.sage.vars) }
    : THEMES.sage;
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function focusFirstElement(container) {
  if (!container) return null;
  const target = container.querySelector(FOCUSABLE_SELECTOR);
  target?.focus?.({ preventScroll: true });
  return target || null;
}

function setThemeMenuOpen(nextOpen, { restoreFocus = false } = {}) {
  themeMenuOpen = Boolean(nextOpen);
  renderThemeMenu();

  if (themeMenuOpen) {
    const panel = document.getElementById('themeMenuPanel');
    requestAnimationFrame(() => {
      focusFirstElement(panel);
    });
    return;
  }

  if (restoreFocus) {
    document.getElementById('themeMenuTrigger')?.focus?.({ preventScroll: true });
  }
}

function hexToRgbChannels(hex) {
  const value = String(hex || '').replace('#', '');
  if (value.length !== 6) return '248 245 240';

  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

function applyThemePreferences() {
  const root = document.documentElement;
  const body = document.body;
  const theme = getThemeDefinition(themePreferences.themeId);
  const surfaceOpacity = themePreferences.surfaceOpacity;
  const borderOpacity = Math.max(8, surfaceOpacity);
  const badgeOpacity = Math.max(3, Math.round(surfaceOpacity * 0.28));
  const fallbackOpacity = Math.max(4, Math.round(surfaceOpacity * 0.36));

  Object.entries(theme.vars).forEach(([name, value]) => {
    root.style.setProperty(name, value, themePreferences.themeId === 'custom' ? 'important' : '');
  });
  root.style.setProperty('--custom-surface-opacity', `${surfaceOpacity}%`);
  root.style.setProperty('--custom-border-opacity', `${borderOpacity}%`);
  root.style.setProperty('--custom-badge-opacity', `${badgeOpacity}%`);
  root.style.setProperty('--custom-fallback-opacity', `${fallbackOpacity}%`);

  if (globalThis.AstabWallpaper?.prepared) AstabWallpaper.apply();

}

function renderThemeMenu() {
  const trigger = document.getElementById('themeMenuTrigger');
  const panel = document.getElementById('themeMenuPanel');
  const options = document.getElementById('themeOptions');
  const transparencyRange = document.getElementById('themeTransparencyRange');
  const transparencyValue = document.getElementById('themeTransparencyValue');
  if (!trigger || !panel || !options || !transparencyRange || !transparencyValue) return;

  trigger.setAttribute('aria-expanded', String(themeMenuOpen));
  panel.hidden = !themeMenuOpen;
  transparencyRange.value = String(themePreferences.surfaceOpacity);
  transparencyValue.textContent = `${themePreferences.surfaceOpacity}%`;

  if (!options.querySelector('.palette-colors')) {
    options.innerHTML = '<div class="palette-colors">' + Object.keys(AstabPalette.fields).map(key =>
      '<label class="palette-color" title="' + key + '"><input type="color" data-palette-color="' + key + '" aria-label="Palette ' + key + '"></label>').join('') +
      '</div><div class="palette-actions"><button class="theme-menu-action is-secondary" type="button" data-action="select-theme" data-theme-id="sage" id="paletteDefault">Default</button><button class="theme-menu-action is-secondary" type="button" id="paletteRandom">Random</button></div>';
    options.addEventListener('input', event => {
      const key = event.target.dataset.paletteColor;
      if (!key) return;
      const colors = Object.fromEntries([...options.querySelectorAll('[data-palette-color]')].map(input => [input.dataset.paletteColor,input.value]));
      themePreferences = normalizeThemePreferences({ ...themePreferences, themeId: 'custom', colors });
      applyThemePreferences();
    });
    options.addEventListener('change', async event => {
      if (!event.target.dataset.paletteColor) return;
      const colors = Object.fromEntries([...options.querySelectorAll('[data-palette-color]')].map(input => [input.dataset.paletteColor,input.value]));
      await saveThemePreferences({ themeId: 'custom', colors });
    });
    document.getElementById('paletteRandom').addEventListener('click', async () => {
      await saveThemePreferences({ themeId: 'custom', colors: AstabPalette.random(matchMedia('(prefers-color-scheme: dark)').matches) });
    });
  }
  const computed = getComputedStyle(document.documentElement);
  for (const input of options.querySelectorAll('[data-palette-color]')) {
    const key = input.dataset.paletteColor;
    input.value = themePreferences.themeId === 'custom' ? themePreferences.colors[key] : computed.getPropertyValue(AstabPalette.fields[key]).trim() || THEMES.sage.vars[AstabPalette.fields[key]];
  }
  document.getElementById('paletteDefault').setAttribute('aria-pressed', String(themePreferences.themeId === 'sage'));

}

async function getQuickShortcuts() {
  const stored = await chrome.storage.local.get(QUICK_SHORTCUTS_KEY);
  return normalizeQuickShortcuts(stored[QUICK_SHORTCUTS_KEY]);
}

async function saveQuickShortcuts(shortcuts) {
  const normalized = normalizeQuickShortcuts(shortcuts);
  await chrome.storage.local.set({ [QUICK_SHORTCUTS_KEY]: normalized });
  return normalized;
}

async function saveQuickShortcutOrder(orderIds) {
  const shortcuts = await getQuickShortcuts();
  if (!Array.isArray(orderIds) || !orderIds.length || !themeReorderSubsetByIds) {
    return shortcuts;
  }
  return await saveQuickShortcuts(themeReorderSubsetByIds(shortcuts, orderIds));
}

function normalizeShortcutUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';

  const withProtocol = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withProtocol).toString();
  } catch {
    return '';
  }
}

function normalizeShortcutIcon(input) {
  const raw = String(input || '').trim();
  if (!raw) return { value: '', kind: '' };

  if (isSvgMarkup(raw)) {
    return { value: raw, kind: 'svg' };
  }

  if (/^data:image\//i.test(raw)) {
    return { value: raw, kind: 'image' };
  }

  if (/^[a-z]+:\/\//i.test(raw) || raw.includes('.') || raw.startsWith('/')) {
    const normalizedUrl = normalizeShortcutUrl(raw);
    if (normalizedUrl) {
      return { value: normalizedUrl, kind: 'image' };
    }
  }

  const glyph = [...raw].slice(0, 2).join('');
  return { value: glyph, kind: glyph ? 'glyph' : '' };
}

function createShortcutEditorState(input = {}) {
  return {
    open: Boolean(input.open),
    mode: input.mode === 'edit' ? 'edit' : 'create',
    shortcutId: String(input.shortcutId || ''),
    url: String(input.url || ''),
    label: String(input.label || ''),
    icon: String(input.icon || ''),
    iconKind: String(input.iconKind || 'site'),
    focusReturnEl: input.focusReturnEl instanceof HTMLElement ? input.focusReturnEl : null,
  };
}

function getShortcutEditorElements() {
  return {
    backdrop: document.getElementById('shortcutEditorBackdrop'),
    panel: document.getElementById('shortcutEditor'),
    form: document.getElementById('shortcutEditorForm'),
    title: document.getElementById('shortcutEditorTitle'),
    url: document.getElementById('shortcutEditorUrl'),
    label: document.getElementById('shortcutEditorLabel'),
    source: document.getElementById('shortcutEditorSource'),
    sourceButtons: [...document.querySelectorAll('[data-action="select-shortcut-source"]')],
    emoji: document.getElementById('shortcutEditorEmoji'),
    svgCode: document.getElementById('shortcutEditorSvgCode'),
    siteGroup: document.getElementById('shortcutEditorSiteGroup'),
    emojiGroup: document.getElementById('shortcutEditorEmojiGroup'),
    imageGroup: document.getElementById('shortcutEditorImageGroup'),
    svgGroup: document.getElementById('shortcutEditorSvgGroup'),
    preview: document.getElementById('shortcutEditorPreview'),
    previewFallback: document.getElementById('shortcutEditorPreviewFallback'),
    previewTitle: document.getElementById('shortcutEditorPreviewTitle'),
    previewMeta: document.getElementById('shortcutEditorPreviewMeta'),
    fileInput: document.getElementById('shortcutIconFileInput'),
  };
}

function resetShortcutEditorPosition(panel) {
  if (!panel) return;
  panel.style.removeProperty('left');
  panel.style.removeProperty('top');
  panel.style.removeProperty('right');
  panel.style.removeProperty('bottom');
  panel.style.removeProperty('inset');
}

function positionShortcutEditor(triggerEl = null) {
  const panel = document.getElementById('shortcutEditor');
  if (!panel) return;

  if (!(triggerEl instanceof HTMLElement)) {
    resetShortcutEditorPosition(panel);
    return;
  }

  const viewportPadding = 16;
  const offset = 14;
  const triggerRect = triggerEl.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const panelWidth = panelRect.width || 360;
  const panelHeight = panelRect.height || 420;

  const fitsBelow = triggerRect.bottom + offset + panelHeight <= window.innerHeight - viewportPadding;
  const top = fitsBelow
    ? triggerRect.bottom + offset
    : Math.max(viewportPadding, triggerRect.top - panelHeight - offset);
  const left = Math.min(
    Math.max(triggerRect.left - 8, viewportPadding),
    window.innerWidth - panelWidth - viewportPadding
  );

  panel.style.inset = 'auto';
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
}

function syncShortcutEditor() {
  const elements = getShortcutEditorElements();
  if (!elements.panel || !elements.backdrop) return;

  elements.panel.hidden = !shortcutEditorState.open;
  elements.backdrop.hidden = !shortcutEditorState.open;
  elements.title.textContent = shortcutEditorState.mode === 'edit' ? 'Edit shortcut' : 'Add shortcut';
  elements.url.value = shortcutEditorState.url;
  elements.label.value = shortcutEditorState.label;
  elements.sourceButtons.forEach(button => {
    const isSelected = button.dataset.source === shortcutEditorState.iconKind;
    button.setAttribute('aria-pressed', String(isSelected));
  });
  elements.emoji.value = shortcutEditorState.iconKind === 'glyph' ? shortcutEditorState.icon : '';
  if (elements.svgCode) {
    elements.svgCode.value = shortcutEditorState.iconKind === 'svg' ? shortcutEditorState.icon : '';
  }
  if (elements.siteGroup) elements.siteGroup.hidden = shortcutEditorState.iconKind !== 'site';
  if (elements.emojiGroup) elements.emojiGroup.hidden = shortcutEditorState.iconKind !== 'glyph';
  if (elements.imageGroup) elements.imageGroup.hidden = shortcutEditorState.iconKind !== 'image';
  if (elements.svgGroup) elements.svgGroup.hidden = shortcutEditorState.iconKind !== 'svg';

  const label = shortcutEditorState.label.trim() || shortcutEditorState.url.trim() || 'Shortcut';
  const previewTitle = shortcutEditorState.iconKind === 'image'
    ? 'Custom image icon'
    : shortcutEditorState.iconKind === 'svg'
      ? 'SVG icon'
    : shortcutEditorState.iconKind === 'glyph'
      ? 'Emoji icon'
      : 'Website icon';
  const previewMeta = shortcutEditorState.iconKind
    ? 'Custom icon will replace the site favicon.'
    : 'Upload or paste an image, or type an emoji.';

  if (elements.previewTitle) elements.previewTitle.textContent = previewTitle;
  if (elements.previewMeta) elements.previewMeta.textContent = previewMeta;
  if (elements.preview) {
    elements.preview.setAttribute('aria-label', `${previewTitle}. ${previewMeta}`);
  }

  if (elements.preview) {
    elements.preview.innerHTML = '';
    if ((shortcutEditorState.iconKind === 'image' || shortcutEditorState.iconKind === 'svg') && shortcutEditorState.icon) {
      const img = document.createElement('img');
      img.src = shortcutEditorState.iconKind === 'svg' ? svgToDataUrl(shortcutEditorState.icon) : shortcutEditorState.icon;
      img.alt = '';
      img.addEventListener('error', () => {
        img.remove();
        if (elements.previewFallback) {
          elements.previewFallback.textContent = themeGetFallbackLabel(label, '');
          elements.preview.appendChild(elements.previewFallback);
        }
      });
      elements.preview.appendChild(img);
    } else if (shortcutEditorState.iconKind === 'glyph' && shortcutEditorState.icon) {
      const glyph = document.createElement('span');
      glyph.className = 'shortcut-editor-preview-glyph';
      glyph.setAttribute('aria-hidden', 'true');
      glyph.textContent = shortcutEditorState.icon;
      elements.preview.appendChild(glyph);
    } else if (elements.previewFallback) {
      elements.previewFallback.textContent = themeGetFallbackLabel(label, '');
      elements.preview.appendChild(elements.previewFallback);
    }
  }
}

function openShortcutEditor(shortcut = null, triggerEl = null) {
  const normalized = shortcut ? normalizeQuickShortcuts([shortcut])[0] : null;
  shortcutEditorState = createShortcutEditorState({
    open: true,
    mode: normalized ? 'edit' : 'create',
    shortcutId: normalized?.id || '',
    url: normalized?.url || '',
    label: normalized?.label || '',
    icon: normalized?.icon || '',
    iconKind: normalized?.iconKind || 'site',
    focusReturnEl: triggerEl instanceof HTMLElement ? triggerEl : document.activeElement,
  });
  syncShortcutEditor();
  requestAnimationFrame(() => {
    positionShortcutEditor(triggerEl);
    getShortcutEditorElements().url?.focus?.({ preventScroll: true });
  });
}

function closeShortcutEditor({ restoreFocus = true } = {}) {
  const focusTarget = shortcutEditorState.focusReturnEl;
  resetShortcutEditorPosition(getShortcutEditorElements().panel);
  shortcutEditorState = createShortcutEditorState();
  syncShortcutEditor();
  if (restoreFocus) {
    focusTarget?.focus?.({ preventScroll: true });
  }
}

function setShortcutEditorField(field, value) {
  shortcutEditorState = createShortcutEditorState({
    ...shortcutEditorState,
    [field]: value,
  });
  syncShortcutEditor();
}

function setShortcutEditorIcon(input) {
  const normalized = normalizeShortcutIcon(input);
  shortcutEditorState = createShortcutEditorState({
    ...shortcutEditorState,
    icon: normalized.value,
    iconKind: normalized.kind || 'site',
  });
  syncShortcutEditor();
}

function setShortcutEditorSource(source) {
  const nextSource = ['site', 'glyph', 'image', 'svg'].includes(source) ? source : 'site';
  shortcutEditorState = createShortcutEditorState({
    ...shortcutEditorState,
    iconKind: nextSource,
    icon: nextSource === shortcutEditorState.iconKind ? shortcutEditorState.icon : '',
  });
  syncShortcutEditor();
}

async function applyShortcutEditorImageFile(file) {
  if (!themeCompressImageFileForStorage) {
    throw new Error('Image compression is unavailable');
  }
  const dataUrl = await themeCompressImageFileForStorage(file, {
    maxBytes: 96 * 1024,
    maxEdge: 160,
  });
  setShortcutEditorIcon(dataUrl);
}

async function saveShortcutEditorShortcut() {
  const url = normalizeShortcutUrl(shortcutEditorState.url);
  if (!url) {
    throw new Error('Please enter a valid URL');
  }

  const shortcuts = await getQuickShortcuts();
  const nextShortcut = {
    id: shortcutEditorState.shortcutId || `shortcut-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    label: shortcutEditorState.label.trim(),
    icon: shortcutEditorState.icon,
    iconKind: shortcutEditorState.iconKind,
  };

  const nextShortcuts = shortcutEditorState.mode === 'edit'
    ? shortcuts.map(item => item.id === nextShortcut.id ? nextShortcut : item)
    : [...shortcuts, nextShortcut];

  await saveQuickShortcuts(nextShortcuts);
  await renderQuickShortcuts();
  closeShortcutEditor();
}

function getShortcutLabel(shortcut) {
  if (shortcut.label) return shortcut.label;

  try {
    return friendlyDomain(new URL(shortcut.url).hostname);
  } catch {
    return shortcut.url;
  }
}

function animateQuickShortcutNode(item, previousRect) {
  if (!item || !previousRect) return;

  const nextRect = item.getBoundingClientRect();
  const deltaX = previousRect.left - nextRect.left;
  const deltaY = previousRect.top - nextRect.top;
  if (!deltaX && !deltaY) return;

  const travel = Math.hypot(deltaX, deltaY);
  const duration = prefersReducedMotion()
    ? 0
    : Math.min(380, Math.max(240, Math.round(228 + travel * 0.4)));

  item.style.transition = 'none';
  item.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
  requestAnimationFrame(() => {
    item.style.transition = duration
      ? `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`
      : 'none';
    item.style.transform = '';
  });
}

function animateQuickShortcutItems(listEl, previousRects, affectedIds = null) {
  const affected = affectedIds instanceof Set ? affectedIds : null;
  listEl?.querySelectorAll('[data-shortcut-id]:not(.is-drag-slot)').forEach(item => {
    const key = item.dataset.shortcutId || '';
    if (affected && !affected.has(key)) return;
    animateQuickShortcutNode(item, previousRects.get(key));
  });
}

function settleQuickShortcutItems(listEl, affectedIds = null) {
  const affected = affectedIds instanceof Set ? affectedIds : null;
  listEl?.querySelectorAll('[data-shortcut-id]:not(.is-drag-slot)').forEach(item => {
    const key = item.dataset.shortcutId || '';
    if (affected && !affected.has(key)) return;
    item.style.transition = 'none';
    item.style.transform = '';
  });
}

function ensureQuickShortcutSlot() {
  if (quickShortcutSlotEl || !quickShortcutDraggedEl) return quickShortcutSlotEl;

  quickShortcutSlotEl = document.createElement('div');
  quickShortcutSlotEl.className = 'quick-shortcut-slot is-drag-slot';
  quickShortcutSlotEl.dataset.shortcutId = quickShortcutDraggedId;
  quickShortcutSlotEl.style.width = `${quickShortcutDragState?.width || quickShortcutDraggedEl.getBoundingClientRect().width}px`;
  quickShortcutSlotEl.style.height = `${quickShortcutDragState?.height || quickShortcutDraggedEl.getBoundingClientRect().height}px`;
  quickShortcutDraggedEl.replaceWith(quickShortcutSlotEl);
  return quickShortcutSlotEl;
}

function ensureQuickShortcutGhost() {
  if (quickShortcutGhostEl || !quickShortcutDraggedEl) return quickShortcutGhostEl;

  quickShortcutGhostEl = quickShortcutDraggedEl.cloneNode(true);
  quickShortcutGhostEl.classList.remove('is-drag-origin');
  quickShortcutGhostEl.classList.add('is-drag-ghost');
  quickShortcutGhostEl.style.setProperty('--drag-width', `${quickShortcutDragState?.width || quickShortcutDraggedEl.getBoundingClientRect().width}px`);
  quickShortcutGhostEl.style.setProperty('--drag-height', `${quickShortcutDragState?.height || quickShortcutDraggedEl.getBoundingClientRect().height}px`);
  document.body.appendChild(quickShortcutGhostEl);
  return quickShortcutGhostEl;
}

function clearQuickShortcutDragState() {
  quickShortcutDragState = null;
  quickShortcutDraggedId = '';
  document.body.classList.remove('quick-shortcut-list-dragging');

  quickShortcutDraggedEl = null;
  quickShortcutGhostEl?.remove();
  quickShortcutGhostEl = null;
  quickShortcutSlotEl?.remove();
  quickShortcutSlotEl = null;
}

function clampQuickShortcutDragPoint(clientX, clientY) {
  const listEl = quickShortcutDragState?.listEl;
  if (!listEl || !quickShortcutDragState) {
    return { clientX, clientY };
  }

  const listRect = listEl.getBoundingClientRect();
  const width = Number(quickShortcutDragState.width) || 0;
  const height = Number(quickShortcutDragState.height) || 0;
  const minClientX = listRect.left + quickShortcutDragState.offsetX - width / 2;
  const maxClientX = listRect.right + quickShortcutDragState.offsetX - width / 2;
  const minClientY = listRect.top + quickShortcutDragState.offsetY - height / 2;
  const maxClientY = listRect.bottom + quickShortcutDragState.offsetY - height / 2;

  return {
    clientX: Math.min(Math.max(clientX, minClientX), maxClientX),
    clientY: Math.min(Math.max(clientY, minClientY), maxClientY),
  };
}

function updateDraggedQuickShortcutPosition(clientX, clientY) {
  if (!quickShortcutGhostEl || !quickShortcutDragState) return;

  quickShortcutGhostEl.style.setProperty('--drag-left', `${clientX - quickShortcutDragState.offsetX}px`);
  quickShortcutGhostEl.style.setProperty('--drag-top', `${clientY - quickShortcutDragState.offsetY}px`);
}

function buildQuickShortcutSlotTargets(listEl) {
  if (!(listEl instanceof HTMLElement)) return [];

  return [...listEl.querySelectorAll('[data-shortcut-id]')].map(item => {
    const rect = item.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
    };
  });
}

function findQuickShortcutSlotIndex(slotTargets, draggedCenterX, draggedCenterY) {
  if (!Array.isArray(slotTargets) || !slotTargets.length) return -1;

  let targetIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  slotTargets.forEach((slot, index) => {
    const dx = draggedCenterX - slot.centerX;
    const dy = draggedCenterY - slot.centerY;
    const distance = (dx * dx) + (dy * dy);
    if (distance < closestDistance) {
      closestDistance = distance;
      targetIndex = index;
    }
  });

  return targetIndex;
}

function previewQuickShortcutOrder(clientX, clientY) {
  const listEl = quickShortcutDragState?.listEl;
  if (!listEl || !quickShortcutDraggedId || !quickShortcutSlotEl) return;

  const clampedPoint = clampQuickShortcutDragPoint(clientX, clientY);
  const draggedCenterX = clampedPoint.clientX - quickShortcutDragState.offsetX + quickShortcutDragState.width / 2;
  const draggedCenterY = clampedPoint.clientY - quickShortcutDragState.offsetY + quickShortcutDragState.height / 2;

  const items = [...listEl.querySelectorAll('[data-shortcut-id]:not(.is-drag-slot)')];
  if (!items.length) return;

  const targetIndex = findQuickShortcutSlotIndex(
    quickShortcutDragState.slotTargets,
    draggedCenterX,
    draggedCenterY
  );
  if (targetIndex === -1) return;

  const insertBeforeItem = items[targetIndex] || null;
  const addCard = listEl.querySelector('.quick-shortcut-card.is-add');
  const targetBeforeNode = insertBeforeItem || addCard || null;
  const currentBeforeNode = quickShortcutSlotEl.nextElementSibling || null;
  if (targetBeforeNode === currentBeforeNode) return;

  const previousOrderIds = [...listEl.querySelectorAll('[data-shortcut-id]')]
    .map(item => item.dataset.shortcutId || '')
    .filter(Boolean);
  const previousSlotIndex = previousOrderIds.indexOf(quickShortcutDraggedId);
  const previousRects = new Map();
  listEl.querySelectorAll('[data-shortcut-id]:not(.is-drag-slot)').forEach(item => {
    previousRects.set(item.dataset.shortcutId || '', item.getBoundingClientRect());
  });
  const previousSlotRect = quickShortcutSlotEl.getBoundingClientRect();

  if (insertBeforeItem) {
    listEl.insertBefore(quickShortcutSlotEl, insertBeforeItem);
  } else {
    if (addCard) {
      listEl.insertBefore(quickShortcutSlotEl, addCard);
    } else {
      listEl.appendChild(quickShortcutSlotEl);
    }
  }

  const nextOrderIds = [...listEl.querySelectorAll('[data-shortcut-id]')]
    .map(item => item.dataset.shortcutId || '')
    .filter(Boolean);
  const nextSlotIndex = nextOrderIds.indexOf(quickShortcutDraggedId);
  const affectedIds = new Set(
    nextOrderIds.filter(id => previousOrderIds.indexOf(id) !== nextOrderIds.indexOf(id))
  );

  const rangeStart = Math.min(previousSlotIndex, nextSlotIndex);
  const rangeEnd = Math.max(previousSlotIndex, nextSlotIndex);
  nextOrderIds.forEach((id, index) => {
    if (index >= rangeStart && index <= rangeEnd) {
      affectedIds.add(id);
    }
  });

  settleQuickShortcutItems(listEl, affectedIds);
  animateQuickShortcutItems(listEl, previousRects, affectedIds);
  animateQuickShortcutNode(quickShortcutSlotEl, previousSlotRect);
}

function renderQuickShortcutCard(shortcut) {
  const label = getShortcutLabel(shortcut);
  const iconData = themeGetIconSources({ url: shortcut.url, title: label }, 32);
  const faviconUrl = iconData.sources[0] || '';
  const fallbackUrl = iconData.sources[1] || '';
  const fallbackLabel = themeGetFallbackLabel(label, iconData.hostname);
  const safeId = themeEscapeHtmlAttribute ? themeEscapeHtmlAttribute(shortcut.id) : shortcut.id.replace(/"/g, '&quot;');
  const safeUrl = themeEscapeHtmlAttribute ? themeEscapeHtmlAttribute(shortcut.url) : shortcut.url.replace(/"/g, '&quot;');
  const customIcon = normalizeShortcutIcon(shortcut.icon);
  const primaryIconUrl = customIcon.kind === 'image'
    ? customIcon.value
    : customIcon.kind === 'svg'
      ? svgToDataUrl(customIcon.value)
    : customIcon.kind === 'glyph'
      ? ''
      : faviconUrl;
  const iconErrorFallback = (customIcon.kind === 'image' || customIcon.kind === 'svg') ? (faviconUrl || fallbackUrl) : fallbackUrl;
  const glyphIcon = customIcon.kind === 'glyph' ? customIcon.value : '';

  return `
    <div class="quick-shortcut-card" data-shortcut-id="${safeId}">
      <button class="quick-shortcut-open" type="button" data-action="open-quick-shortcut" data-shortcut-url="${safeUrl}" aria-label="${label}" draggable="false">
        <span class="quick-shortcut-icon-wrap">
          ${primaryIconUrl ? `<img class="quick-shortcut-icon${customIcon.kind === 'image' ? ' quick-shortcut-icon-custom' : ''}" src="${primaryIconUrl}" alt="" draggable="false" data-fallback-src="${iconErrorFallback}">` : ''}
          ${glyphIcon ? `<span class="quick-shortcut-custom-glyph" aria-hidden="true">${glyphIcon}</span>` : ''}
          <span class="quick-shortcut-fallback"${primaryIconUrl || glyphIcon ? ' style="display:none"' : ''}>${fallbackLabel}</span>
        </span>
        <span class="quick-shortcut-label">${label}</span>
      </button>
      <button class="quick-shortcut-edit" type="button" data-action="edit-quick-shortcut" data-shortcut-id="${safeId}" aria-label="Edit quick tab">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a2.25 2.25 0 1 1 3.182 3.182L10.582 17.13a4.5 4.5 0 0 1-1.897 1.13L6 19l.74-2.685a4.5 4.5 0 0 1 1.13-1.897L16.862 4.487ZM19.5 7.125 16.875 4.5" /></svg>
      </button>
      <button class="quick-shortcut-remove" type="button" data-action="remove-quick-shortcut" data-shortcut-id="${safeId}" aria-label="Remove quick tab">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
      </button>
    </div>
  `;
}

function renderQuickShortcutAddCard() {
  return `
    <div class="quick-shortcut-card is-add">
      <button class="quick-shortcut-open" type="button" data-action="add-quick-shortcut" aria-label="Add quick tab">
        <span class="quick-shortcut-icon-wrap">
          <svg class="quick-shortcut-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 5.25v13.5m6.75-6.75H5.25" />
          </svg>
        </span>
        <span class="quick-shortcut-label">Add link</span>
      </button>
    </div>
  `;
}

async function renderQuickShortcuts() {
  const list = document.getElementById('quickTabsList');
  if (!list) return;

  const shortcuts = await getQuickShortcuts();
  list.innerHTML = `${shortcuts.map(renderQuickShortcutCard).join('')}${renderQuickShortcutAddCard()}`;
}

async function openShortcutEditorById(shortcutId, triggerEl = null) {
  const shortcuts = await getQuickShortcuts();
  const shortcut = shortcuts.find(item => item.id === shortcutId);
  if (!shortcut) return;
  openShortcutEditor(shortcut, triggerEl);
}

async function handleShortcutEditorPaste() {
  if (!shortcutEditorState.open) {
    return;
  }

  if (!navigator.clipboard?.read) {
    showToast('Press Cmd/Ctrl+V inside the editor to paste an image or SVG');
    return;
  }

  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find(type => type.startsWith('image/'));
      if (!imageType) continue;
      const blob = await item.getType(imageType);
      const file = new File([blob], 'shortcut-icon.png', { type: imageType });
      await applyShortcutEditorImageFile(file);
      showToast('Shortcut icon pasted');
      return;
    }

    const textItem = items.find(item => item.types.includes('text/plain'));
    const htmlItem = items.find(item => item.types.includes('text/html'));
    if (htmlItem) {
      const htmlBlob = await htmlItem.getType('text/html');
      const html = await htmlBlob.text();
      const normalized = extractIconFromClipboardHtml(html);
      if (normalized.kind) {
        setShortcutEditorIcon(normalized.value);
        showToast(normalized.kind === 'svg' ? 'SVG icon pasted' : 'Shortcut icon pasted');
        return;
      }
      const htmlImageMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (htmlImageMatch?.[1] && isTransientClipboardReference(htmlImageMatch[1])) {
        showToast('This clipboard image is a temporary file reference. Use Cmd/Ctrl+V instead.');
        return;
      }
    }

    if (textItem) {
      const textBlob = await textItem.getType('text/plain');
      const text = await textBlob.text();
      const normalized = normalizeShortcutIcon(text);
      if (normalized.kind === 'svg' || /^data:image\//i.test(String(normalized.value || ''))) {
        setShortcutEditorIcon(normalized.value);
        showToast(normalized.kind === 'svg' ? 'SVG icon pasted' : 'Shortcut icon pasted');
        return;
      }
      if (isTransientClipboardReference(text)) {
        showToast('This clipboard image is a temporary file reference. Use Cmd/Ctrl+V instead.');
        return;
      }
    }

    showToast('Clipboard does not contain an image or SVG');
  } catch (err) {
    showToast('Use Cmd/Ctrl+V inside the editor if direct clipboard access is unavailable');
  }
}

async function tryShortcutEditorPasteViaExecCommand() {
  return new Promise(resolve => {
    const target = document.createElement('textarea');
    target.setAttribute('aria-hidden', 'true');
    target.style.position = 'fixed';
    target.style.opacity = '0';
    target.style.pointerEvents = 'none';
    target.style.inset = '0 auto auto -9999px';
    document.body.appendChild(target);

    let finished = false;
    const cleanup = (result) => {
      if (finished) return;
      finished = true;
      target.removeEventListener('paste', onPaste);
      target.remove();
      resolve(result);
    };

    const onPaste = async (e) => {
      const imageItem = [...(e.clipboardData?.items || [])].find(item => item.type.startsWith('image/'));
      if (imageItem) {
        const file = imageItem.getAsFile();
        if (file) {
          e.preventDefault();
          try {
            await applyShortcutEditorImageFile(file);
            showToast('Shortcut icon pasted');
            cleanup(true);
            return;
          } catch {
            cleanup(false);
            return;
          }
        }
      }

      const pastedHtml = e.clipboardData?.getData('text/html') || '';
      const normalizedFromHtml = extractIconFromClipboardHtml(pastedHtml);
      if (normalizedFromHtml.kind) {
        e.preventDefault();
        setShortcutEditorIcon(normalizedFromHtml.value);
        showToast(normalizedFromHtml.kind === 'svg' ? 'SVG icon pasted' : 'Shortcut icon pasted');
        cleanup(true);
        return;
      }

      cleanup(false);
    };

    target.addEventListener('paste', onPaste, { once: true });
    target.focus({ preventScroll: true });

    let commandWorked = false;
    try {
      commandWorked = document.execCommand('paste');
    } catch {}

    setTimeout(() => cleanup(commandWorked), 120);
  });
}

document.addEventListener('click', async (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;

  const action = actionEl.dataset.action;

  if (action === 'add-quick-shortcut') {
    e.preventDefault();
    e.stopImmediatePropagation();
    openShortcutEditor(null, actionEl);
    return;
  }

  if (action === 'edit-quick-shortcut') {
    e.preventDefault();
    e.stopImmediatePropagation();
    const shortcutId = actionEl.dataset.shortcutId || '';
    await openShortcutEditorById(shortcutId, actionEl);
    return;
  }

  if (action === 'remove-quick-shortcut') {
    e.stopImmediatePropagation();
    const shortcutId = actionEl.dataset.shortcutId;
    if (!shortcutId) return;
    const shortcuts = await getQuickShortcuts();
    await saveQuickShortcuts(shortcuts.filter(item => item.id !== shortcutId));
    await renderQuickShortcuts();
    showToast('Quick tab removed');
    return;
  }

  if (action === 'open-quick-shortcut') {
    e.stopImmediatePropagation();
    if (Date.now() < quickShortcutSuppressClickUntil) return;
    const url = actionEl.dataset.shortcutUrl;
    if (!url) return;
    await openOrFocusUrl(url);
    return;
  }

  if (action === 'close-shortcut-editor') {
    e.preventDefault();
    closeShortcutEditor();
    return;
  }

  if (action === 'select-shortcut-source') {
    e.preventDefault();
    setShortcutEditorSource(actionEl.dataset.source || 'site');
    if (actionEl.dataset.source === 'glyph') {
      getShortcutEditorElements().emoji?.focus?.({ preventScroll: true });
    }
    return;
  }

  if (action === 'upload-shortcut-icon') {
    e.preventDefault();
    getShortcutEditorElements().fileInput?.click();
    return;
  }

  if (action === 'paste-shortcut-icon') {
    e.preventDefault();
    const pasted = await tryShortcutEditorPasteViaExecCommand();
    if (!pasted) {
      await handleShortcutEditorPaste();
    }
    return;
  }

  if (action === 'clear-shortcut-icon') {
    e.preventDefault();
    setShortcutEditorIcon('');
    return;
  }
});

document.addEventListener('pointerdown', (e) => {
  const shortcutButton = e.target.closest('.quick-shortcut-open');
  if (!shortcutButton || e.button !== 0) return;
  if (shortcutButton.dataset.action !== 'open-quick-shortcut') return;

  const item = shortcutButton.closest('[data-shortcut-id]');
  const listEl = item?.parentElement;
  if (!item || !listEl) return;

  quickShortcutDraggedId = item.dataset.shortcutId || '';
  quickShortcutDraggedEl = item;

  const rect = item.getBoundingClientRect();
  quickShortcutDragState = {
    listEl,
    x: e.clientX,
    y: e.clientY,
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
    slotTargets: buildQuickShortcutSlotTargets(listEl),
    width: rect.width,
    height: rect.height,
    moved: false,
  };
  });

document.addEventListener('pointermove', (e) => {
  if (!quickShortcutDraggedId || !quickShortcutDragState) return;

  const distance = Math.hypot(e.clientX - quickShortcutDragState.x, e.clientY - quickShortcutDragState.y);
  if (!quickShortcutDragState.moved && distance < 4) return;

  if (!quickShortcutDragState.moved) {
    quickShortcutDragState.moved = true;
    document.body.classList.add('quick-shortcut-list-dragging');
    ensureQuickShortcutSlot();
    ensureQuickShortcutGhost();
  }

  updateDraggedQuickShortcutPosition(e.clientX, e.clientY);
  previewQuickShortcutOrder(e.clientX, e.clientY);
});

document.addEventListener('pointerup', async () => {
  if (!quickShortcutDraggedId || !quickShortcutDragState) return;

  const moved = quickShortcutDragState.moved;
  const nextOrderIds = moved
    ? [...quickShortcutDragState.listEl.children]
        .map(node => {
          if (node === quickShortcutSlotEl) return quickShortcutDraggedId;
          return node.dataset?.shortcutId || '';
        })
        .filter(Boolean)
    : [];
  clearQuickShortcutDragState();

  if (!moved) return;

  quickShortcutSuppressClickUntil = Date.now() + 250;
  await saveQuickShortcutOrder(nextOrderIds);
  await renderQuickShortcuts();
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'shortcutEditorUrl') {
    setShortcutEditorField('url', e.target.value);
    return;
  }

  if (e.target.id === 'shortcutEditorLabel') {
    setShortcutEditorField('label', e.target.value);
    return;
  }

  if (e.target.id === 'shortcutEditorEmoji') {
    const normalized = normalizeShortcutIcon(e.target.value);
    shortcutEditorState = createShortcutEditorState({
      ...shortcutEditorState,
      icon: normalized.value,
      iconKind: normalized.kind || 'glyph',
    });
    syncShortcutEditor();
    return;
  }

  if (e.target.id === 'shortcutEditorSvgCode') {
    const normalized = normalizeShortcutIcon(e.target.value);
    shortcutEditorState = createShortcutEditorState({
      ...shortcutEditorState,
      icon: normalized.value,
      iconKind: normalized.kind || 'svg',
    });
    syncShortcutEditor();
  }
});

document.addEventListener('change', async (e) => {
  if (e.target.id !== 'shortcutIconFileInput') return;

  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;

  try {
    await applyShortcutEditorImageFile(file);
    showToast('Shortcut icon updated');
  } catch (err) {
    showToast(err?.message || 'Could not use shortcut image');
  }
});

document.addEventListener('paste', async (e) => {
  if (!shortcutEditorState.open) return;
  const imageItem = [...(e.clipboardData?.items || [])].find(item => item.type.startsWith('image/'));
  if (imageItem) {
    const file = imageItem.getAsFile();
    if (!file) return;

    e.preventDefault();
    try {
      await applyShortcutEditorImageFile(file);
      showToast('Shortcut icon pasted');
    } catch (err) {
      showToast(err?.message || 'Could not paste shortcut image');
    }
    return;
  }

  const pastedHtml = e.clipboardData?.getData('text/html') || '';
  const normalizedFromHtml = extractIconFromClipboardHtml(pastedHtml);
  if (normalizedFromHtml.kind) {
    e.preventDefault();
    setShortcutEditorIcon(normalizedFromHtml.value);
    showToast(normalizedFromHtml.kind === 'svg' ? 'SVG icon pasted' : 'Shortcut icon pasted');
    return;
  }

  const pastedText = e.clipboardData?.getData('text/plain') || '';
  const normalized = normalizeShortcutIcon(pastedText);
  if (normalized.kind === 'svg') {
    e.preventDefault();
    setShortcutEditorIcon(normalized.value);
    showToast('SVG icon pasted');
  }
});

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'shortcutEditorForm') return;

  e.preventDefault();
  try {
    const mode = shortcutEditorState.mode;
    await saveShortcutEditorShortcut();
    showToast(mode === 'edit' ? 'Quick tab updated' : 'Quick tab added');
  } catch (err) {
    showToast(err?.message || 'Could not save shortcut');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && shortcutEditorState.open) {
    closeShortcutEditor();
  }
});

document.addEventListener('click', (e) => {
  if (!shortcutEditorState.open) return;
  if (e.target.id === 'shortcutEditorBackdrop') {
    closeShortcutEditor();
  }
});

async function loadThemePreferences() {
  const stored = await chrome.storage.local.get(THEME_PREFERENCES_KEY);
  themePreferences = normalizeThemePreferences(stored[THEME_PREFERENCES_KEY]);
  applyThemePreferences();
  renderThemeMenu();
  return themePreferences;
}

async function saveThemePreferences(nextPreferences) {
  themePreferences = normalizeThemePreferences({
    ...themePreferences,
    ...nextPreferences,
  });
  await chrome.storage.local.set({ [THEME_PREFERENCES_KEY]: themePreferences });
  applyThemePreferences();
  renderThemeMenu();
  return themePreferences;
}
