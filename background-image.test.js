'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  constrainImageDimensions,
  estimateDataUrlBytes,
  MAX_BACKGROUND_EDGE,
} = require('./background-image.js');

test('constrainImageDimensions keeps smaller images unchanged', () => {
  assert.deepEqual(
    constrainImageDimensions({ width: 1200, height: 800, maxEdge: MAX_BACKGROUND_EDGE }),
    { width: 1200, height: 800 }
  );
});

test('constrainImageDimensions scales landscape images down to the max edge', () => {
  assert.deepEqual(
    constrainImageDimensions({ width: 4000, height: 2000, maxEdge: 1920 }),
    { width: 1920, height: 960 }
  );
});

test('constrainImageDimensions scales portrait images down to the max edge', () => {
  assert.deepEqual(
    constrainImageDimensions({ width: 1800, height: 3600, maxEdge: 1600 }),
    { width: 800, height: 1600 }
  );
});

test('estimateDataUrlBytes converts base64 payload length to bytes', () => {
  const payload = Buffer.from('tab-harbor-background').toString('base64');
  const dataUrl = `data:image/jpeg;base64,${payload}`;

  assert.equal(
    estimateDataUrlBytes(dataUrl),
    Buffer.byteLength('tab-harbor-background')
  );
});
