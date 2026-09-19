import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';

import { aggregate } from '../shared/aggregate.js';
import { OG_H, OG_W, renderOg } from '../shared/og.js';

const post = (id, kind, date) => ({ id, url: `https://t.me/demo/${id}`, date, text: 'text', views: 10, kind, kindConfidence: 0.9, isAd: 0, clickbait: 0, pressure: 0 });
const card = { info: { username: 'demo', title: 'Demo' }, stats: aggregate([post(1, 'news', '2026-08-01T10:00:00+00:00'), post(2, 'news', '2026-08-02T10:00:00+00:00'), post(3, 'joke', '2026-09-01T10:00:00+00:00')]) };

/** Walks the chunks of a PNG: [{ type, data }]. */
function chunks(png) {
  const view = new DataView(png.buffer, png.byteOffset);
  const found = [];
  for (let at = 8; at < png.length; ) {
    const length = view.getUint32(at);
    found.push({ type: String.fromCharCode(...png.subarray(at + 4, at + 8)), data: png.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
  }
  return found;
}

test('the link preview is a valid palette PNG of the promised size', async () => {
  const png = await renderOg(card, 'wrapped.example.com');
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = chunks(png);
  assert.deepEqual(parts.map((part) => part.type), ['IHDR', 'PLTE', 'IDAT', 'IEND']);
  const header = new DataView(parts[0].data.buffer, parts[0].data.byteOffset);
  assert.deepEqual([header.getUint32(0), header.getUint32(4), parts[0].data[8], parts[0].data[9]], [OG_W, OG_H, 8, 3]);
  assert.equal(inflateSync(parts[2].data).length, (OG_W + 1) * OG_H);
  assert.ok(png.length < 40_000, 'flat colours compress to a few kilobytes');
});

test('the picture shows the mix: the largest kind takes the most pixels', async () => {
  const pixels = inflateSync(chunks(await renderOg(card))[2].data);
  const count = new Map();
  for (const index of pixels) count.set(index, (count.get(index) ?? 0) + 1);
  const [background, ...painted] = [...count.entries()].sort((a, b) => b[1] - a[1]);
  assert.ok(background[1] > pixels.length / 2);
  assert.ok(painted.length >= 3, 'text, news and jokes are all drawn');
});

test('a name with characters the bitmap font lacks does not break the picture', async () => {
  const png = await renderOg({ ...card, info: { username: 'дивний канал 🚀', title: 'x' } });
  assert.ok(png.length > 1000);
});
