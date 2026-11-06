'use strict';
// Dependency-free rasterization of icons/mark.svg, supersampled for small toolbar sizes.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const output = path.join(__dirname, '..', 'icons');
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, bytes])));
  return Buffer.concat([length, name, bytes, crc]);
}
function distance(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}
function color(x, y) {
  x = (x - 16) / .75; y = (y - 16) / .75;
  if (x < 0 || x > 128 || y < 0 || y > 128) return [0, 0, 0, 0];
  const outside = Math.hypot(x - Math.max(32, Math.min(96, x)), y - Math.max(32, Math.min(96, y))) > 32;
  if (outside) return [0, 0, 0, 0];
  let rgb = [39, 78, 71];
  for (const [points, opacity] of [[[[25, 76], [64, 98], [103, 76]], .45], [[[25, 62], [64, 84], [103, 62]], .75]]) {
    if (distance(x, y, points[0], points[1]) <= 3.5 || distance(x, y, points[1], points[2]) <= 3.5) rgb = rgb.map((v, i) => v * (1 - opacity) + [183, 212, 191][i] * opacity);
  }
  if (Math.abs(x - 64) / 39 + Math.abs(y - 48) / 22 <= 1) rgb = [229, 237, 206];
  return [...rgb, 255];
}
for (const size of [16, 32, 48, 128, 512]) {
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  const samples = size <= 128 ? 4 : 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sum = [0, 0, 0, 0];
    for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
      const value = color((x + (sx + .5) / samples) / size * 128, (y + (sy + .5) / samples) / size * 128);
      for (let channel = 0; channel < 4; channel++) sum[channel] += value[channel];
    }
    for (let channel = 0; channel < 4; channel++) pixels[y * (size * 4 + 1) + x * 4 + 1 + channel] = Math.round(sum[channel] / (samples * samples));
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  fs.writeFileSync(path.join(output, `icon${size}.png`), Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]));
}
