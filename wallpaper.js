'use strict';

globalThis.AstabWallpaper = (() => {
  let preferences = { source: 'forest', offset: 0 };
  let cache = null;
  let displayedPhoto = null;
  let requestGeneration = 0;
  let lastDay = AstabCore.localDay();
  let prepared = false;

  function normalize(value = {}) {
    return { source: ['custom', 'forest', 'daily'].includes(value.source) ? value.source : 'forest',
      offset: Number.isSafeInteger(value.offset) && value.offset >= 0 ? value.offset : 0 };
  }
  function validCache(value) {
    return value && /^data:image\//.test(value.dataURL || '') ? value : null;
  }
  function apply() {
    const photo = preferences.source === 'custom' ? null : displayedPhoto;
    const background = photo?.dataURL || themePreferences.customBackground;
    document.documentElement.style.setProperty('--my-pure-bg', background ? 'url(' + JSON.stringify(background) + ')' : 'none');
    document.body.classList.toggle('has-custom-background', Boolean(background));
    const credit = document.getElementById('wallpaperCredit');
    credit.replaceChildren();
    if (photo && /^https:\/\/unsplash\.com\//.test(photo.url)) {
      const link = document.createElement('a');
      link.href = photo.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = photo.author + ' / Unsplash';
      credit.append(link);
      if (photo.provider === 'picsum') {
        const provider = document.createElement('a');
        provider.href = 'https://picsum.photos/'; provider.target = '_blank'; provider.rel = 'noopener noreferrer';
        provider.textContent = 'via Picsum'; credit.append(' · ', provider);
      }
    }
    const select = document.getElementById('wallpaperSource');
    if (select) select.value = preferences.source;
    const next = document.getElementById('wallpaperNext');
    if (next) next.disabled = preferences.source === 'custom';
  }
  async function fetchJSON(url) {
    const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Photo library unavailable');
    return response.json();
  }
  async function refresh() {
    const generation = ++requestGeneration;
    apply();
    const status = document.getElementById('wallpaperStatus');
    if (preferences.source === 'custom') { status.textContent = ''; return; }
    const source = preferences.source;
    const day = AstabCore.localDay();
    const seed = Math.floor(Date.parse(day + 'T00:00:00Z') / 86400000) + preferences.offset;
    const key = source + ':' + day + ':' + preferences.offset;
    if (cache?.key === key) {
      displayedPhoto = cache; apply(); status.textContent = 'Changes daily.'; return;
    }
    if (navigator.onLine === false) { status.textContent = 'Offline · keeping your background.'; return; }
    status.textContent = 'Loading photo…';
    try {
      await navigator.locks.request('astab-wallpaper', async () => {
        if (generation !== requestGeneration) return;
        const saved = validCache((await chrome.storage.local.get('wallpaperCache')).wallpaperCache);
        if (saved?.key === key) {
          if (generation === requestGeneration) cache = displayedPhoto = saved;
          return;
        }
        let photo;
        if (source === 'forest') {
          const forest = AstabForestPhotos[seed % AstabForestPhotos.length];
          photo = { ...forest, provider: 'unsplash', image: forest.image + '?auto=format&fit=crop&w=1920&h=1080&q=85' };
        } else {
          const list = await fetchJSON('https://picsum.photos/v2/list?page=' + (Math.floor(seed / 100) % 10 + 1) + '&limit=100');
          const landscape = list.filter(item => item.width >= item.height && /^\d+$/.test(item.id));
          const item = landscape[seed % landscape.length];
          if (!item || !/^https:\/\/unsplash\.com\//.test(item.url)) throw new Error('Photo metadata unavailable');
          photo = { ...item, provider: 'picsum', image: 'https://picsum.photos/id/' + item.id + '/1920/1080' };
        }
        const response = await fetch(photo.image, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error('Photo download failed');
        const blob = await response.blob();
        if (!blob.type.startsWith('image/') || blob.size > 12 * 1024 * 1024) throw new Error('Unsupported photo');
        // Decode and validate before replacing the visible image. A failed download leaves it intact.
        const dataURL = await TabOutBackgroundImage.compressImageFileForStorage(blob);
        if (generation !== requestGeneration) return;
        const nextCache = { key, dataURL, author: String(photo.author), url: photo.url, provider: photo.provider };
        await chrome.storage.local.set({ wallpaperCache: nextCache });
        if (generation === requestGeneration) cache = displayedPhoto = nextCache;
      });
      if (generation === requestGeneration) { apply(); status.textContent = 'Changes daily.'; }
    } catch {
      // Keep the current photo/custom image, or the original solid theme. Never clear it on error.
      if (generation === requestGeneration) status.textContent = 'Couldn’t load photo · keeping your background.';
    }
  }
  async function useCustom() {
    preferences = { ...preferences, source: 'custom' };
    displayedPhoto = null; requestGeneration += 1;
    await chrome.storage.local.set({ wallpaperPreferences: preferences });
    apply();
  }
  async function prepare() {
    if (prepared) return;
    const stored = await chrome.storage.local.get(['wallpaperPreferences', 'wallpaperCache']);
    preferences = normalize(stored.wallpaperPreferences);
    cache = validCache(stored.wallpaperCache);
    displayedPhoto = preferences.source === 'custom' ? null : cache;
    prepared = true;
    apply();
  }
  async function mount() {
    await prepare();
    const section = document.createElement('div');
    section.className = 'theme-menu-section wallpaper-settings';
    section.innerHTML = '<label class="theme-menu-label" for="wallpaperSource">Wallpaper</label>' +
      '<select id="wallpaperSource"><option value="forest">Unsplash · Forest collection</option><option value="daily">Unsplash · Daily discovery</option><option value="custom">My background / Solid color</option></select>' +
      '<button type="button" id="wallpaperNext" class="theme-menu-action is-secondary">Next photo</button>' +
      '<p id="wallpaperStatus" class="setting-detail" role="status"></p>';
    document.getElementById('themeMenuPanel').children[2].after(section);
    document.getElementById('wallpaperSource').addEventListener('change', async event => {
      preferences = normalize({ source: event.target.value, offset: 0 });
      requestGeneration += 1;
      if (preferences.source === 'custom') displayedPhoto = null;
      await chrome.storage.local.set({ wallpaperPreferences: preferences });
      await refresh();
    });
    document.getElementById('wallpaperNext').addEventListener('click', async () => {
      preferences = { ...preferences, offset: preferences.offset + 1 }; requestGeneration += 1;
      await chrome.storage.local.set({ wallpaperPreferences: preferences });
      await refresh();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.wallpaperCache) {
        cache = validCache(changes.wallpaperCache.newValue);
        if (cache) displayedPhoto = cache;
        apply();
      }
      if (changes.wallpaperPreferences && JSON.stringify(normalize(changes.wallpaperPreferences.newValue)) !== JSON.stringify(preferences)) {
        preferences = normalize(changes.wallpaperPreferences.newValue);
        if (preferences.source === 'custom') displayedPhoto = null;
        refresh();
      }
      if (changes.themePreferences) apply();
    });
    window.addEventListener('online', refresh);
    setInterval(() => { const day = AstabCore.localDay(); if (day !== lastDay) { lastDay = day; refresh(); } }, 60000);
    // Network work must not delay the timer or the rest of the page.
    refresh();
  }
  return { mount, prepare, apply, useCustom, get prepared() { return prepared; } };
})();
