'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
const files = ['manifest.json', 'index.html', 'style.css', 'enhancements.css', 'app.js', 'background.js',
  'desk-core.js', 'timer-core.js', 'pomodoro.js', 'enhancements.js', 'tabs-panel.js', 'card-drag.js', 'close-confirm.js', 'palette-core.js', 'notes-panel.js', 'bookmarks.js', 'forest-library.js', 'wallpaper.js', 'background-image.js',
  'dashboard-runtime.js', 'deferred-trigger-position.js', 'drawer-manager.js', 'group-order.js',
  'icon-utils.js', 'list-order.js', 'session-groups.js', 'theme-controls.js', 'todos-store.js',
  'ui-helpers.js', 'about.html', 'privacy.html', 'about.css', 'LICENSE',
  'fonts/fonts.css', 'fonts/libre-caslon-display-400.ttf', 'fonts/public-sans-400.ttf', 'fonts/public-sans-500.ttf', 'fonts/public-sans-600.ttf', 'fonts/public-sans-700.ttf', 'fonts/Libre-Caslon-Display-OFL.txt', 'fonts/Public-Sans-OFL.txt',
  'icons/mark.svg', 'icons/icon16.png', 'icons/icon32.png', 'icons/icon48.png', 'icons/icon128.png'];
for (const file of files) if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing release file: ${file}`);
fs.mkdirSync(path.join(root, 'release'), { recursive: true });
const target = path.join(root, 'release', `astab-${manifest.version}.zip`);
// Recreate the generated artifact so removed files cannot linger from an earlier build.
if (fs.existsSync(target)) fs.unlinkSync(target);
execFileSync('/usr/bin/zip', ['-X', '-q', target, ...files], { cwd: root });
console.log(target);
