'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clampTriggerTop,
  normalizeTriggerPosition,
} = require('./deferred-trigger-position.js');

test('normalizeTriggerPosition keeps finite top values only', () => {
  assert.deepEqual(normalizeTriggerPosition({ top: 180 }), { top: 180 });
  assert.deepEqual(normalizeTriggerPosition({ top: 'bad' }), { top: null });
});

test('clampTriggerTop keeps trigger inside viewport bounds', () => {
  assert.equal(clampTriggerTop(8, 900, 48, 24), 24);
  assert.equal(clampTriggerTop(300, 900, 48, 24), 300);
  assert.equal(clampTriggerTop(880, 900, 48, 24), 828);
});
