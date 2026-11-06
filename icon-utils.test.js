'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

global.chrome = { runtime: { getURL: path => `chrome-extension://test${path}` } };

const {
  escapeHtmlAttribute,
  getFallbackLabel,
  getGoogleFaviconUrl,
  getGroupIcon,
  getIconSources,
} = require('./icon-utils.js');

test('icons use Chrome cache without sending URLs to an external service', () => {
  const iconData = getIconSources({
    favIconUrl: 'https://example.com/favicon.ico',
    url: 'https://www.example.com/page',
  }, 32);

  assert.equal(iconData.hostname, 'www.example.com');
  assert.deepEqual(iconData.sources, [
    'chrome-extension://test/_favicon/?pageUrl=https%3A%2F%2Fwww.example.com%2Fpage&size=32',
  ]);
});

test('getGroupIcon uses Chrome favicon cache when the tab has no icon', () => {
  const iconData = getGroupIcon({
    tabs: [{ url: 'https://chatgpt.com/c/test' }],
  }, 'ChatGPT', 32);

  assert.equal(iconData.src, 'chrome-extension://test/_favicon/?pageUrl=https%3A%2F%2Fchatgpt.com%2Fc%2Ftest&size=32');
  assert.equal(iconData.fallbackSrc, '');
  assert.equal(iconData.fallbackLabel, 'C');
});

test('getFallbackLabel derives stable initials from labels and hosts', () => {
  assert.equal(getFallbackLabel('GitHub Issues', 'github.com'), 'GI');
  assert.equal(getFallbackLabel('', 'www.wikipedia.org'), 'WI');
  assert.equal(getGoogleFaviconUrl('github.com', 16), 'chrome-extension://test/_favicon/?pageUrl=https%3A%2F%2Fgithub.com&size=16');
});

test('escapeHtmlAttribute protects custom tooltip text', () => {
  assert.equal(
    escapeHtmlAttribute('ChatGPT "Projects" & Notes'),
    'ChatGPT &quot;Projects&quot; &amp; Notes'
  );
});
