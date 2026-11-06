'use strict';

globalThis.AstabEnhancements = (() => {
  async function mount() {
    const stored = await chrome.storage.local.get('deskPreferences');
    const section = document.createElement('div');
    section.className = 'theme-menu-section';
    section.innerHTML = `<div class="theme-menu-label">General</div><label class="setting-toggle"><span>Show All Bookmarks</span><input id="showAllBookmarks" type="checkbox" role="switch"></label><label class="setting-toggle"><span>Auto close extras<span class="setting-detail">Keep only the newest new tab, across all windows.</span></span><input id="autoCloseExtras" type="checkbox" role="switch"></label>`;
    document.getElementById('themeMenuPanel').prepend(section);
    const about = document.createElement('a');
    about.href = 'about.html'; about.target = '_blank'; about.rel = 'noopener';
    about.className = 'theme-menu-action'; about.textContent = 'About';
    document.getElementById('themeMenuPanel').append(about);
    renderThemeMenu();
    const toggle = document.getElementById('autoCloseExtras');
    const allToggle = document.getElementById('showAllBookmarks');
    function applyPreferences(value = {}) {
      toggle.checked = value.autoCloseExtras !== false;
      allToggle.checked = value.showAllBookmarks === true;
      AstabBookmarks.setAlwaysShow(allToggle.checked);
    }
    applyPreferences(stored.deskPreferences);
    let saveQueue = Promise.resolve();
    for (const [control,key] of [[allToggle,'showAllBookmarks'],[toggle,'autoCloseExtras']]) {
      control.addEventListener('change', () => {
        const checked = control.checked;
        if (key === 'showAllBookmarks') AstabBookmarks.setAlwaysShow(checked);
        saveQueue = saveQueue.then(async () => {
          const saved = await chrome.storage.local.get('deskPreferences');
          await chrome.storage.local.set({ deskPreferences: { ...saved.deskPreferences, [key]: checked } });
        }).catch(() => { control.checked = !checked; if (key === 'showAllBookmarks') AstabBookmarks.setAlwaysShow(!checked); showToast('Could not save the setting'); });
      });
    }
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.deskPreferences) applyPreferences(changes.deskPreferences.newValue);
      if (changes.todos) AstabNotes.render();
    });
    AstabBookmarks.mount();
    await AstabWallpaper.mount();
    await AstabPomodoro.mount();
  }
  return { mount };
})();
