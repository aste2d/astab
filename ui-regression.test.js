'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const appEntryJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const runtimeJs = fs.readFileSync(path.join(__dirname, 'dashboard-runtime.js'), 'utf8');
const themeJs = fs.readFileSync(path.join(__dirname, 'theme-controls.js'), 'utf8');
const drawerJs = fs.readFileSync(path.join(__dirname, 'drawer-manager.js'), 'utf8');
const helperJs = fs.readFileSync(path.join(__dirname, 'ui-helpers.js'), 'utf8');
const appJs = [appEntryJs, runtimeJs, themeJs, drawerJs, helperJs, ...['tabs-panel.js', 'notes-panel.js'].map(file => fs.readFileSync(path.join(__dirname, file), 'utf8'))].join('\n');

test('move menu keeps hidden state until explicitly opened', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

  assert.match(
    css,
    /\.chip-move-menu\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/
  );
});

test('mission card allows move menu to overflow outside the card', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

  assert.match(
    css,
    /\.mission-card\s*\{[\s\S]*overflow:\s*visible;/
  );
});

test('mission card is raised above sibling cards while move menu is open', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

  assert.match(
    css,
    /\.mission-card:has\(\.chip-move-trigger\.is-open\)\s*\{[\s\S]*z-index:\s*40;/
  );
});




test('index includes a back-to-top floating button', () => {
  assert.match(html, /id="backToTopBtn"/);
});

test('index includes deferred drawer trigger and overlay', () => {
  assert.match(html, /id="deferredTrigger"/);
  assert.match(html, /id="todoTrigger"/);
  assert.match(html, /id="deferredOverlay"/);
  assert.match(html, /id="headerSearchForm"/);
  assert.match(html, /id="headerSearchInput"/);
  assert.match(html, /class="header-title-row"/);
  assert.match(html, /id="quickTabsSection"/);
  assert.match(html, /id="quickTabsList"/);
  assert.doesNotMatch(html, /Quick tabs/);
  assert.doesNotMatch(html, /No custom background/);
  assert.doesNotMatch(html, /deferredTriggerIconPath/);
  assert.doesNotMatch(html, /id="deferredTriggerCount"/);
  assert.doesNotMatch(html, /deferred-trigger-label/);
});

test('manifest keeps only permissions required by the shipped runtime', () => {
  const manifest = fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8');

  assert.match(manifest, /"tabs"/);
  assert.match(manifest, /"storage"/);
  assert.match(manifest, /"search"/);
  assert.doesNotMatch(manifest, /"clipboardRead"/);
  assert.doesNotMatch(manifest, /"activeTab"/);
});

test('homepage has no branding; attribution is in About', () => {
  const about = fs.readFileSync(path.join(__dirname, 'about.html'), 'utf8');
  assert.doesNotMatch(html, /footer-credit|icons\/mark|Stilltab|A little space/);
  assert.match(about, /github\.com\/aste2d/);
  assert.match(about, /Han Zheng/);
});




test('back-to-top button styles and behavior are wired up', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

  assert.match(css, /\.back-to-top\s*\{/);
  assert.match(css, /\.back-to-top\.visible\s*\{/);
  assert.match(css, /\.back-to-top\s*\{[\s\S]*border-radius:\s*999px;/);
  assert.match(css, /\.back-to-top\s*\{[\s\S]*var\(--floating-surface-opacity\)/);
  assert.match(css, /\.back-to-top\s*\{[\s\S]*backdrop-filter:\s*blur\(10px\)/);
  assert.match(appJs, /window\.scrollTo\(\{\s*top:\s*0,\s*behavior:\s*prefersReducedMotion\(\) \? 'auto' : 'smooth'/);
  assert.match(appJs, /document\.getElementById\('backToTopBtn'\)/);
});

test('deferred drawer styles and behavior are wired up', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

  assert.match(css, /\.drawer-header-actions\s*\{/);
  assert.match(css, /\.drawer-icon-btn\s*\{/);
  assert.match(css, /\.drawer-panel\.is-active\s*\{/);
  assert.match(css, /\.deferred-trigger\s*\{/);
  assert.match(css, /\.deferred-overlay\.visible\s*\{/);
  assert.match(css, /\.deferred-column\.open\s*\{/);
  assert.match(appJs, /const nextOpen = !\(deferredPanelOpen && drawerView === 'saved'\)/);
  assert.match(appJs, /const nextOpen = !\(deferredPanelOpen && drawerView === 'todos'\)/);
  assert.match(appJs, /toggle-saved-search/);
  assert.match(appJs, /toggle-todo-search/);
  assert.match(appJs, /toggle-theme-menu/);
  assert.match(appJs, /select-theme/);
  assert.match(appJs, /themeBackgroundInput/);
  assert.match(appJs, /loadThemePreferences/);
  assert.match(appJs, /e\.key === 'Escape' && deferredPanelOpen/);
  assert.match(appJs, /saveDrawerItemOrder/);
  assert.match(appJs, /previewDrawerItemOrder/);
  assert.match(html, /id="clearTodoArchiveBtn"/);
  assert.match(html, /id="savedSearchToggle"/);
  assert.match(html, /id="todoNewBtn"/);
  assert.match(css, /\.deferred-header\s*\{[\s\S]*animation:\s*none/);
  assert.match(css, /\.drawer-title-btn\s*\{[\s\S]*text-decoration:\s*underline/);
});

test('theme menu styles and custom background layer are defined', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

  assert.match(css, /--page-custom-background:/);
  assert.match(css, /--custom-surface-opacity:/);
  assert.match(css, /--floating-surface-opacity:/);
  assert.match(css, /--panel-surface-opacity:/);
  assert.match(css, /--tooltip-surface:/);
  assert.match(css, /--tooltip-border:/);
  assert.match(css, /--tooltip-text:/);
  assert.match(css, /--workspace-accent:/);
  assert.match(css, /--workspace-accent-soft:/);
  assert.match(css, /--workspace-accent-border:/);
  assert.match(css, /--workspace-accent-contrast:/);
  assert.match(css, /--banner-action-bg:/);
  assert.match(css, /--banner-action-bg-hover:/);
  assert.match(css, /--banner-action-text:/);
  assert.match(css, /--workspace-chip-bg:/);
  assert.match(css, /--workspace-chip-bg-strong:/);
  assert.match(css, /--workspace-chip-text:/);
  assert.match(css, /--workspace-chip-border:/);
  assert.match(css, /body\s*\{[\s\S]*background-image:\s*var\(--page-custom-background\)/);
  assert.match(css, /\.header-title-row\s*\{[\s\S]*align-items:\s*center;[\s\S]*gap:\s*18px;[\s\S]*flex-wrap:\s*nowrap;/);
  assert.match(css, /\.header-left h1\s*\{[\s\S]*margin-bottom:\s*0;[\s\S]*white-space:\s*nowrap;/);
  assert.match(css, /\.header-left h1\s*\{[\s\S]*line-height:\s*1;/);
  assert.match(css, /\.header-left \.date\s*\{[\s\S]*font-size:\s*10px;[\s\S]*line-height:\s*1;[\s\S]*transform:\s*translateY\(1px\);/);
  assert.match(css, /\.header-theme-trigger\s*\{/);
  assert.match(css, /\.group-nav-tools\s*\{/);
  assert.match(css, /\.header-theme-trigger::after\s*\{/);
  assert.match(css, /\.header-search-shell\s*\{/);
  assert.match(css, /\.header-search-shell:focus-within\s*\{/);
  assert.match(css, /\.header-search-input\s*\{/);
  assert.match(css, /\.theme-menu\s*\{/);
  assert.match(css, /\.theme-range\s*\{/);
  assert.match(css, /\.theme-option\.is-active\s*\{/);
  assert.match(css, /\.header-theme-trigger\s*\{[\s\S]*background:\s*transparent;/);
  assert.doesNotMatch(themeJs, /body\.style\.backgroundImage/);
  assert.match(themeJs, /AstabWallpaper\.apply\(\)/);
  assert.match(themeJs, /hexToRgbChannels/);
  assert.match(themeJs, /surfaceOpacity/);
  assert.doesNotMatch(themeJs, /headerPinToggle/);
  assert.match(appJs, /const themeTrigger = document\.getElementById\('themeMenuTrigger'\)/);
  assert.match(appJs, /const themePanel = document\.getElementById\('themeMenuPanel'\)/);
  assert.match(appJs, /!themePanel\.contains\(e\.target\)/);
  assert.match(appJs, /id="themeMenuTrigger"/);
  assert.doesNotMatch(appJs, /id="headerPinToggle"/);
  assert.match(appJs, /id="themeMenuPanel"/);
  assert.match(appJs, /id="themeBackgroundInput"/);
  assert.match(appJs, /id="themeTransparencyRange"/);
  assert.match(appJs, /id="themeTransparencyValue"/);
  assert.match(themeJs, /Math\.min\(60, Math\.max\(2, Math\.round\(rawOpacity\)\)\)/);
  assert.match(appJs, /chrome\.search\?\.query/);
  assert.match(appJs, /disposition:\s*'CURRENT_TAB'/);
  assert.match(appJs, /e\.target\.id !== 'headerSearchForm'/);
  assert.match(appJs, /runDefaultSearch\(query\)/);
  assert.match(themeJs, /['"]--workspace-accent['"]:/);
  assert.match(themeJs, /['"]--workspace-accent-soft['"]:/);
  assert.match(themeJs, /['"]--workspace-accent-border['"]:/);
  assert.match(themeJs, /['"]--workspace-accent-contrast['"]:/);
  assert.match(css, /\.section-count\s*\{[\s\S]*color:\s*var\(--workspace-chip-text\);/);
  assert.match(css, /\.group-nav-button\s*\{[\s\S]*width:\s*40px;[\s\S]*height:\s*40px;/);
  assert.match(css, /\.group-nav-button::after,\s*\.group-pin-toggle::after\s*\{[\s\S]*background:\s*var\(--tooltip-surface\);[\s\S]*color:\s*var\(--tooltip-text\);[\s\S]*border:\s*1px solid var\(--tooltip-border\);/);
  assert.match(css, /\.tab-cleanup-banner\s*\{[\s\S]*var\(--theme-accent-soft\)[\s\S]*border:\s*1px solid var\(--theme-accent-muted\);/);
  assert.match(css, /\.tab-cleanup-icon svg\s*\{[\s\S]*color:\s*var\(--theme-accent-strong\);/);
  assert.match(css, /\.tab-cleanup-btn\s*\{[\s\S]*background:\s*var\(--banner-action-bg\);[\s\S]*color:\s*var\(--banner-action-text\);/);
  assert.match(css, /\.tab-cleanup-btn:hover\s*\{[\s\S]*background:\s*var\(--banner-action-bg-hover\);/);
  assert.match(css, /\.open-tabs-badge\s*\{[\s\S]*color:\s*var\(--workspace-chip-text\);[\s\S]*background:\s*var\(--workspace-chip-bg\);[\s\S]*border:\s*1px solid var\(--workspace-chip-border\);/);
  assert.match(css, /\.open-tabs-badge\.is-duplicate\s*\{[\s\S]*background:\s*var\(--workspace-chip-bg-strong\);/);
  assert.match(css, /\.action-btn\.close-tabs\s*\{[\s\S]*border-color:\s*var\(--workspace-chip-border\);[\s\S]*color:\s*var\(--workspace-chip-text\);[\s\S]*background:\s*color-mix\(in srgb, var\(--workspace-chip-bg\) 92%, var\(--card-bg\) 8%\);[\s\S]*border-radius:\s*8px;[\s\S]*min-height:\s*28px;/);
  assert.match(css, /\.action-btn\.close-tabs:hover\s*\{[\s\S]*background:\s*var\(--workspace-chip-bg-strong\);[\s\S]*border-color:\s*var\(--workspace-accent-border\);/);
  assert.match(css, /\.deferred-shell\s*\{[\s\S]*background:\s*color-mix\(in srgb, var\(--card-bg\) var\(--panel-card-opacity\), transparent\);/);
  assert.match(css, /--tooltip-surface:\s*color-mix\(in srgb, var\(--workspace-accent-soft\) 32%, var\(--card-bg\) 68%\);/);
  assert.match(css, /\.drawer-title-btn\.is-active,\s*\.drawer-title-btn\[aria-selected="true"\]\s*\{[\s\S]*text-decoration-color:\s*var\(--drawer-tab-underline-active\);/);
  assert.match(css, /\.archive-clear-btn\s*\{[\s\S]*color:\s*var\(--workspace-chip-text\);/);
  assert.match(css, /\.todo-detail-card\s*\{[\s\S]*background:\s*color-mix\(in srgb, var\(--card-bg\) 96%, var\(--paper\) 4%\);/);
  assert.match(appJs, /compressImageFileForStorage/);
  assert.doesNotMatch(appJs, /readFileAsDataUrl/);
  assert.match(html, /<script src="background-image\.js"><\/script>/);
  assert.match(html, /<script src="theme-controls\.js"><\/script>/);
});

test('bookmark cards retain the original grid and links while supporting folders', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
  const bookmarks = fs.readFileSync(path.join(__dirname, 'bookmarks.js'), 'utf8');
  assert.match(css, /grid-template-columns:\s*repeat\(auto-fill, 76px\)/);
  assert.match(html, /id="quickTabsList"/);
  assert.match(html, /id="bookmarkBreadcrumbs"/);
  assert.match(html, /id="bookmarkSearch"/);
  assert.match(bookmarks, /chrome\.bookmarks\.getTree\(\)/);
  assert.doesNotMatch(bookmarks, /chrome\.bookmarks\.(create|update|remove|move)\(/);
});

test('quick shortcuts support drag reordering with persisted order and drag preview styling', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

  assert.match(themeJs, /const\s*\{[\s\S]*reorderSubsetByIds:\s*themeReorderSubsetByIds,[\s\S]*\}\s*=\s*globalThis\.TabOutListOrder \|\| \{\};/);
  assert.match(themeJs, /class="quick-shortcut-card" data-shortcut-id="\$\{safeId\}"/);
  assert.match(themeJs, /let quickShortcutDragState = null;/);
  assert.match(themeJs, /document\.body\.classList\.add\('quick-shortcut-list-dragging'\)/);
  assert.match(themeJs, /quickShortcutSuppressClickUntil = Date\.now\(\) \+ 250/);
  assert.match(themeJs, /function clampQuickShortcutDragPoint\(clientX, clientY\)/);
  assert.match(themeJs, /const minClientX = listRect\.left \+ quickShortcutDragState\.offsetX - width \/ 2;/);
  assert.match(themeJs, /const maxClientX = listRect\.right \+ quickShortcutDragState\.offsetX - width \/ 2;/);
  assert.match(themeJs, /Math\.min\(Math\.max\(clientX, minClientX\), maxClientX\)/);
  assert.match(themeJs, /function ensureQuickShortcutSlot\(\)/);
  assert.match(themeJs, /quickShortcutSlotEl\.className = 'quick-shortcut-slot is-drag-slot';/);
  assert.match(themeJs, /function ensureQuickShortcutGhost\(\)/);
  assert.match(themeJs, /quickShortcutDraggedEl\.replaceWith\(quickShortcutSlotEl\)/);
  assert.match(themeJs, /quickShortcutGhostEl\.style\.setProperty\('--drag-height'/);
  assert.match(themeJs, /function updateDraggedQuickShortcutPosition\(clientX, clientY\)\s*\{[\s\S]*quickShortcutGhostEl\.style\.setProperty\('--drag-left'/);
  assert.match(themeJs, /await saveQuickShortcuts\(themeReorderSubsetByIds\(/);
  assert.match(themeJs, /function buildQuickShortcutSlotTargets\(listEl\)/);
  assert.match(themeJs, /slotTargets:\s*buildQuickShortcutSlotTargets\(listEl\)/);
  assert.match(themeJs, /function findQuickShortcutSlotIndex\(slotTargets, draggedCenterX, draggedCenterY\)/);
  assert.match(themeJs, /const distance = \(dx \* dx\) \+ \(dy \* dy\);/);
  assert.match(themeJs, /function animateQuickShortcutNode\(item, previousRect\)/);
  assert.match(themeJs, /function settleQuickShortcutItems\(listEl, affectedIds = null\)/);
  assert.match(themeJs, /if \(affected && !affected\.has\(key\)\) return;/);
  assert.match(themeJs, /Math\.hypot\(deltaX, deltaY\)/);
  assert.match(themeJs, /cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  assert.match(themeJs, /const draggedCenterX = clampedPoint\.clientX - quickShortcutDragState\.offsetX \+ quickShortcutDragState\.width \/ 2;/);
  assert.match(themeJs, /const draggedCenterY = clampedPoint\.clientY - quickShortcutDragState\.offsetY \+ quickShortcutDragState\.height \/ 2;/);
  assert.match(themeJs, /const targetIndex = findQuickShortcutSlotIndex\(\s*quickShortcutDragState\.slotTargets,\s*draggedCenterX,\s*draggedCenterY\s*\);/);
  assert.match(themeJs, /const insertBeforeItem = items\[targetIndex\] \|\| null;/);
  assert.match(themeJs, /const targetBeforeNode = insertBeforeItem \|\| addCard \|\| null;/);
  assert.match(themeJs, /const currentBeforeNode = quickShortcutSlotEl\.nextElementSibling \|\| null;/);
  assert.match(themeJs, /if \(targetBeforeNode === currentBeforeNode\) return;/);
  assert.match(themeJs, /const previousOrderIds = \[\.\.\.listEl\.querySelectorAll\('\[data-shortcut-id\]'\)\]/);
  assert.match(themeJs, /const affectedIds = new Set\(/);
  assert.match(themeJs, /settleQuickShortcutItems\(listEl, affectedIds\);/);
  assert.match(themeJs, /animateQuickShortcutNode\(quickShortcutSlotEl, previousSlotRect\);/);
  assert.match(css, /body\.quick-shortcut-list-dragging\s*\{/);
  assert.match(css, /\.quick-shortcut-card\.is-drag-ghost\s*\{[\s\S]*position:\s*fixed;[\s\S]*height:\s*var\(--drag-height, auto\);[\s\S]*pointer-events:\s*none;/);
  assert.match(css, /\.quick-shortcut-card\.is-drag-ghost \.quick-shortcut-open\s*\{[\s\S]*transform:\s*none;[\s\S]*transition:\s*none;/);
  assert.match(css, /\.quick-shortcut-slot\s*\{[\s\S]*width:\s*76px;[\s\S]*min-height:\s*56px;[\s\S]*pointer-events:\s*none;/);
});

test('collapsed drawer triggers use compact neutral frames with theme-ready tokens', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

  assert.match(css, /--drawer-trigger-surface:/);
  assert.match(css, /--drawer-trigger-border:/);
  assert.match(css, /--drawer-trigger-icon:/);
  assert.match(css, /\.deferred-trigger\s*\{[\s\S]*width:\s*42px;[\s\S]*height:\s*42px;[\s\S]*padding:\s*0;/);
  assert.match(css, /\.deferred-trigger-icon\s*\{[\s\S]*width:\s*18px;[\s\S]*height:\s*18px;/);
  assert.doesNotMatch(css, /#deferredTrigger\s*\{/);
  assert.doesNotMatch(css, /#todoTrigger\s*\{/);
});

test('saved and todo lists expose drag handles with drag-state styling', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

  assert.match(drawerJs, /class="drawer-reorder-handle"/);
  assert.match(appJs, /data-chip-drag-handle="tab"/);
  assert.match(appJs, /const GROUP_TAB_ORDER_KEY = 'groupTabOrder'/);
  assert.match(appJs, /saveGroupTabRowOrder/);
  assert.match(appJs, /const orderedTabs = getOrderedUniqueTabsForGroup\(group\)/);
  assert.match(appJs, /if \(node === draggedPageChipEl\) return '';/);
  assert.match(drawerJs, /data-drag-handle="saved"/);
  assert.match(appJs, /data-drag-handle="todo"/);
  assert.doesNotMatch(drawerJs, /title="Drag to reorder"/);
  assert.match(css, /\.drawer-reorder-handle\s*\{/);
  assert.match(css, /\.page-chip > \.chip-reorder-handle\s*\{/);
  assert.match(css, /\.chip-reorder-handle\s*\{[\s\S]*opacity:\s*1;[\s\S]*workspace-chip-text/);
  assert.match(css, /\.drawer-reorder-placeholder\s*\{/);
  assert.match(css, /body\.page-chip-list-dragging\s*\{/);
  assert.match(css, /\.page-chip\.is-dragging\s*\{/);
  assert.match(css, /\.chip-reorder-placeholder\s*\{/);
  assert.match(css, /\.deferred-item\.is-dragging,\s*\.todo-item\.is-dragging\s*\{/);
});

test('saved trigger icon uses the bookmark artwork', () => {
  assert.match(html, /id="deferredTrigger"[\s\S]*viewBox="0 0 24 24"/);
  assert.match(html, /id="deferredTrigger"[\s\S]*M17\.25 6\.75v13\.22/);
});

test('collapsed drawer triggers stay icon-only', () => {
  assert.doesNotMatch(appJs, /deferredTriggerCount/);
  assert.doesNotMatch(appJs, /if \(totalCount === 0\) \{[\s\S]*trigger\.style\.display = 'none';/);
});

test('todo trigger icon uses the checklist artwork', () => {
  assert.match(html, /id="todoTrigger"[\s\S]*M288\.384 173\.488a94\.208 94\.208 0 0 1 93\.392-81\.488/);
  assert.match(html, /id="todoTrigger"[\s\S]*M926\.624 660\.752a32 32 0 0 1 0 45\.248/);
});

test('archive supports deleting single items and clearing all archived items', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

  assert.match(drawerJs, /restore-deferred/);
  assert.match(appJs, /reopenSavedTab\(restored\.url\)/);
  assert.match(drawerJs, /currentTab\.url !== 'about:blank'/);
  assert.match(drawerJs, /delete-archive-item/);
  assert.match(appJs, /clear-archive/);
  assert.match(appJs, /clear-todo-archive/);
  assert.match(html, /class="archive-header-row"/);
  assert.match(html, /id="clearArchiveBtn"/);
  assert.doesNotMatch(drawerJs, /archive-actions/);
});

test('deferred trigger position is persisted separately from drawer open state', () => {
  assert.match(drawerJs, /const DEFERRED_TRIGGER_POSITION_KEY = 'deferredTriggerPosition'/);
  assert.match(drawerJs, /saveDeferredTriggerPosition/);
});

test('deferred trigger supports vertical drag positioning', () => {
  assert.match(appJs, /deferredTriggerDragState/);
  assert.match(appJs, /e\.target\.closest\('\.deferred-trigger'\)/);
  assert.match(appJs, /triggerStack\.style\.top = `\$\{nextTop}px`/);
});

test('drawer and search controls expose stronger accessibility semantics', () => {
  assert.match(html, /id="drawerColumn"[\s\S]*role="dialog"[\s\S]*aria-label="Saved items and todos"[\s\S]*tabindex="-1"/);
  assert.match(html, /role="tablist" aria-label="Drawer views"/);
  assert.match(html, /id="savedSearchToggle"[\s\S]*aria-expanded="false"[\s\S]*aria-controls="savedSearchWrap"/);
  assert.match(html, /id="todoSearchToggle"[\s\S]*aria-expanded="false"[\s\S]*aria-controls="todoSearchWrap"/);
  assert.match(html, /type="search"[\s\S]*id="savedSearchInput"[\s\S]*aria-label="Search saved pages"/);
  assert.match(html, /type="search"[\s\S]*id="todoSearchInput"[\s\S]*aria-label="Search todos"/);
});

test('interactive controls keep button semantics and reduced-motion support', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

  assert.match(themeJs, /class="quick-shortcut-open" type="button"/);
  assert.match(themeJs, /class="quick-shortcut-remove" type="button"/);
  assert.match(themeJs, /setAttribute\('aria-pressed', String\(themePreferences\.themeId === 'sage'\)\)/);
  assert.match(themeJs, /function prefersReducedMotion\(\)/);
  assert.match(appJs, /behavior:\s*prefersReducedMotion\(\) \? 'auto' : 'smooth'/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(auto-fit, minmax\(128px, 1fr\)\);/);
});

test('keyboard focus receives explicit visible treatment', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

  assert.match(css, /--focus-ring:/);
  assert.match(css, /:is\([\s\S]*\.quick-shortcut-open,[\s\S]*\.theme-option,[\s\S]*\.todo-main[\s\S]*\):focus-visible/);
  assert.match(css, /outline:\s*2px solid var\(--focus-ring\);/);
  assert.match(css, /\.header-search-input:focus-visible\s*\{[\s\S]*outline:\s*none;[\s\S]*box-shadow:\s*none;/);
});

test('drawer tab hover and todo title typography stay aligned with theme system', () => {
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

  assert.match(css, /--drawer-tab-idle:/);
  assert.match(css, /--drawer-tab-hover:/);
  assert.match(css, /\.drawer-title-btn\s*\{[\s\S]*color:\s*var\(--drawer-tab-idle\);[\s\S]*text-decoration-color:\s*transparent;/);
  assert.match(css, /\.drawer-title-btn\.is-active,\s*\.drawer-title-btn\[aria-selected="true"\]\s*\{[\s\S]*color:\s*var\(--ink\);/);
  assert.match(css, /\.drawer-title-btn:not\(\.is-active\):hover,\s*\.drawer-title-btn\[aria-selected="false"\]:hover\s*\{[\s\S]*color:\s*var\(--drawer-tab-hover\);/);
  assert.match(css, /\.drawer-title-btn:not\(\.is-active\):active,\s*\.drawer-title-btn\[aria-selected="false"\]:active\s*\{[\s\S]*color:\s*var\(--drawer-tab-pressed\);/);
  assert.match(css, /\.todo-title\s*\{[\s\S]*font-weight:\s*400;[\s\S]*line-height:\s*1\.45;/);
});
