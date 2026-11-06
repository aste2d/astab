'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
async function page({ stored = {}, background = '', online = true, fail = false, decodeFails = false, saveFails = false } = {}) {
  const elements = new Map(), styles = {}, paints = [], calls = [], events = {}, work = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, { children: [{}, {}, { after() {} }], listeners: {},
      addEventListener(name, fn) { this.listeners[name] = fn; }, replaceChildren() {}, append() {} });
    return elements.get(id);
  };
  const data = { ...stored };
  let day = '2026-11-06';
  const context = vm.createContext({ Date, AbortSignal, console,
    themePreferences: { customBackground: background }, AstabCore: { localDay: () => day },
    document: { getElementById: element, createElement: () => element(Symbol()),
      documentElement: { style: { setProperty: (key, value) => { styles[key] = value; paints.push({key,value}); } } }, body: { classList: { toggle() {} } } },
    chrome: { storage: { local: { get: async key => typeof key === 'string' ? { [key]: data[key] } : data,
      set: async patch => { if (saveFails && patch.wallpaperCache) throw Error('quota'); Object.assign(data, patch); } }, onChanged: { addListener() {} } } },
    navigator: { onLine: online, locks: { request: (_name, fn) => { const job = fn(); work.push(job); return job; } } },
    window: { addEventListener: (name, fn) => { events[name] = fn; } }, setInterval: fn => { events.day = fn; },
    fetch: async (url, options) => { calls.push({ url, options }); if (fail) throw Error('network'); return { ok: true, blob: async () => ({ type: 'image/jpeg', size: 4000 }) }; },
    TabOutBackgroundImage: { compressImageFileForStorage: async () => { if (decodeFails) throw Error('invalid image'); return 'data:image/webp;base64,new'; } },
  });
  for (const file of ['forest-library.js', 'wallpaper.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context);
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); await Promise.allSettled(work); };
  await context.AstabWallpaper.mount(); await flush();
  return { data, calls, styles, paints, context, events, element, flush, nextDay() { day = '2026-11-07'; events.day(); } };
}
const oldPhoto = { key: 'forest:2026-11-05:0', dataURL: 'data:image/webp;base64,old', url: 'https://unsplash.com/photos/example', author: 'Example' };
test('offline first launch uses custom background or the original solid theme without requests', async () => {
  const custom = await page({ online: false, background: 'data:image/png;base64,custom' });
  assert.match(custom.styles['--my-pure-bg'], /custom/); assert.equal(custom.calls.length, 0);
  const plain = await page({ online: false });
  assert.equal(plain.styles['--my-pure-bg'], 'none'); assert.equal(plain.calls.length, 0);
});
test('network, decoding and cache write failures preserve the previous background', async () => {
  for (const failure of [{ fail: true }, { decodeFails: true }, { saveFails: true }]) {
    const p = await page({ ...failure, stored: { wallpaperCache: oldPhoto } });
    assert.match(p.styles['--my-pure-bg'], /old/); assert.equal(p.data.wallpaperCache, oldPhoto);
    assert.match(p.element('wallpaperStatus').textContent, /keeping/);
  }
});
test('missing cache with a network failure falls back to custom or solid color', async () => {
  const custom = await page({ fail: true, background: 'data:image/png;base64,custom' });
  assert.match(custom.styles['--my-pure-bg'], /custom/);
  const plain = await page({ fail: true }); assert.equal(plain.styles['--my-pure-bg'], 'none');
});
test('forest library is default, changes on next photo and on the next calendar day', async () => {
  const p = await page(); const first = p.calls[0].url;
  assert.match(first, /^https:\/\/images\.unsplash\.com\//);
  assert.equal(p.calls[0].options.credentials, 'omit');
  assert.equal(p.element('wallpaperSource').value, 'forest');
  await p.element('wallpaperNext').listeners.click();
  assert.notEqual(p.calls[1].url, first);
  p.nextDay(); await p.flush(); assert.notEqual(p.calls[2].url, p.calls[1].url);
  assert.match(p.styles['--my-pure-bg'], /new/);
});
test('today’s cached photo opens without network requests', async () => {
  const p = await page({ stored: { wallpaperCache: { ...oldPhoto, key: 'forest:2026-11-06:0' } } });
  assert.equal(p.calls.length, 0); assert.match(p.styles['--my-pure-bg'], /old/);
});
test('reconnecting retries the forest library after starting offline', async () => {
  const p = await page({ online: false }); assert.equal(p.calls.length, 0);
  p.context.navigator.onLine = true; await p.events.online();
  assert.equal(p.calls.length, 1); assert.match(p.styles['--my-pure-bg'], /new/);
});
test('selecting a library from custom keeps the current image if download fails', async () => {
  const p = await page({ fail: true, background: 'data:image/png;base64,custom', stored: { wallpaperCache: oldPhoto, wallpaperPreferences: { source: 'custom', offset: 0 } } });
  await p.element('wallpaperSource').listeners.change({ target: { value: 'forest' } });
  assert.match(p.styles['--my-pure-bg'], /custom/); assert.equal(p.calls.length, 1);
});

test('startup chooses cached wallpaper before any custom fallback can be painted', async () => {
  const p = await page({ background:'data:image/png;base64,custom', stored:{wallpaperCache:{...oldPhoto,key:'forest:2026-11-06:0'}} });
  const backgrounds = p.paints.filter(item=>item.key==='--my-pure-bg');
  assert.ok(backgrounds.length > 0);
  assert.ok(backgrounds.every(item=>item.value.includes('old')));
  assert.equal(p.calls.length,0);
});
