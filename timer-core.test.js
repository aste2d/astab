'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const timer = require('./timer-core');

test('timer resumes after reload and sleep using an absolute deadline', () => {
  const running = timer.transition(undefined, 'toggle', 10000);
  assert.equal(running.endsAt, 1510000);
  assert.equal(timer.normalize(JSON.parse(JSON.stringify(running)), 100000).remaining, 1410);
  const finished = timer.transition(running, 'get', 4000000);
  assert.equal(finished.running, false);
  assert.equal(finished.remaining, 0);
  assert.equal(finished.finished, true);
  assert.deepEqual(timer.transition(finished, 'get', 5000000), finished);
});

test('pause and resume do not count paused time', () => {
  const paused = timer.transition(timer.transition(undefined, 'toggle', 0), 'toggle', 10000);
  assert.equal(paused.remaining, 1490);
  assert.equal(paused.running, false);
  const resumed = timer.transition(paused, 'toggle', 60000);
  assert.equal(resumed.endsAt, 1550000);
});

test('mode selection, reset and restarting a finished session', () => {
  const short = timer.transition(undefined, 'short');
  assert.equal(short.remaining, 300);
  assert.equal(timer.transition(short, 'long').remaining, 900);
  const finished = timer.transition(timer.transition(short, 'toggle', 0), 'get', 400000);
  assert.equal(timer.transition(finished, 'toggle', 500000).endsAt, 800000);
  assert.equal(timer.transition(finished, 'reset', 500000).finished, false);
});

test('invalid persisted timer values recover to safe defaults', () => {
  const state = timer.normalize({ mode: 'invalid', running: true, endsAt: 'bad', remaining: -5 });
  assert.equal(state.mode, 'focus');
  assert.equal(state.running, false);
  assert.equal(state.remaining, 0);
});
