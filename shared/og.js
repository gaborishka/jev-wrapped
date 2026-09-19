// The picture a messenger shows next to a link to a card: 1200×630, drawn here pixel by pixel
// into an 8-bit palette PNG. No font engine and no image library, so text is a 5×7 bitmap font;
// the same code runs in a Worker and in Node.
import { KIND_COLORS } from '../public/i18n.js';

export const OG_W = 1200;
export const OG_H = 630;

const GLYPHS = {
  A: '.###. #...# #...# ##### #...# #...# #...#',
  B: '####. #...# #...# ####. #...# #...# ####.',
  C: '.###. #...# #.... #.... #.... #...# .###.',
  D: '####. #...# #...# #...# #...# #...# ####.',
  E: '##### #.... #.... ####. #.... #.... #####',
  F: '##### #.... #.... ####. #.... #.... #....',
  G: '.###. #...# #.... #.### #...# #...# .###.',
  H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
  J: '..### ...#. ...#. ...#. ...#. #..#. .##..',
  K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  L: '#.... #.... #.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #.#.# #...# #...# #...#',
  N: '#...# ##..# #.#.# #..## #...# #...# #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.',
  P: '####. #...# #...# ####. #.... #.... #....',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
  R: '####. #...# #...# ####. #.#.. #..#. #...#',
  S: '.#### #.... #.... .###. ....# ....# ####.',
  T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.',
  V: '#...# #...# #...# #...# #...# .#.#. ..#..',
  W: '#...# #...# #...# #.#.# #.#.# ##.## #...#',
  X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  Z: '##### ....# ...#. ..#.. .#... #.... #####',
  0: '.###. #...# #..## #.#.# ##..# #...# .###.',
  1: '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  2: '.###. #...# ....# ...#. ..#.. .#... #####',
  3: '##### ...#. ..#.. ...#. ....# #...# .###.',
  4: '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  5: '##### #.... ####. ....# ....# #...# .###.',
  6: '..##. .#... #.... ####. #...# #...# .###.',
  7: '##### ....# ...#. ..#.. .#... .#... .#...',
  8: '.###. #...# #...# .###. #...# #...# .###.',
  9: '.###. #...# #...# .#### ....# ...#. .##..',
  '%': '##... ##..# ...#. ..#.. .#... #..## ...##',
  '@': '.###. #...# #.### #.#.# #.### #.... .###.',
  _: '..... ..... ..... ..... ..... ..... #####',
  '.': '..... ..... ..... ..... ..... .##.. .##..',
  '-': '..... ..... ..... ##### ..... ..... .....',
  '<': '...#. ..#.. .#... #.... .#... ..#.. ...#.',
};
const ROWS = Object.fromEntries(Object.entries(GLYPHS).map(([char, rows]) => [char, rows.split(' ')]));

const BASE = ['#0b0e13', '#151a22', '#eef1f5', '#8a93a3', '#2a3240'];
const [INK, PANEL, TEXT, DIM, FAINT] = [0, 1, 2, 3, 4];
const KIND_INDEX = Object.fromEntries(Object.keys(KIND_COLORS).map((kind, i) => [kind, BASE.length + i]));
const PALETTE = [...BASE, ...Object.values(KIND_COLORS)];

const CRC = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set([...type].map((char) => char.charCodeAt(0)), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** pixels: palette indices, row by row. */
async function encodePng(pixels, width, height) {
  const raw = new Uint8Array((width + 1) * height); // every row starts with filter type 0
  for (let y = 0; y < height; y++) raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 3, 0, 0, 0], 8); // 8 bits, palette colour
  const palette = Uint8Array.from(PALETTE.flatMap((hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))));
  const parts = [Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk('IHDR', header), chunk('PLTE', palette), chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array(0))];
  const png = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let at = 0;
  for (const part of parts) png.set(part, at), (at += part.length);
  return png;
}

function canvas() {
  const pixels = new Uint8Array(OG_W * OG_H).fill(INK);
  const rect = (x, y, width, height, color) => {
    const [x0, x1] = [Math.max(0, Math.round(x)), Math.min(OG_W, Math.round(x + width))];
    const [y0, y1] = [Math.max(0, Math.round(y)), Math.min(OG_H, Math.round(y + height))];
    for (let row = y0; row < y1; row++) pixels.fill(color, row * OG_W + x0, row * OG_W + x1);
  };
  const textWidth = (string, scale) => string.length * 6 * scale - scale;
  /** align 'end' puts the right edge of the text at x. */
  const text = (string, x, y, scale, color, align = 'start') => {
    let left = align === 'end' ? x - textWidth(string, scale) : x;
    for (const char of string) {
      ROWS[char]?.forEach((row, r) => [...row].forEach((cell, c) => cell === '#' && rect(left + c * scale, y + r * scale, scale, scale, color)));
      left += 6 * scale;
    }
  };
  return { pixels, rect, text, textWidth };
}

const label = (share) => (share > 0 && share < 0.01 ? '<1%' : `${Math.round(share * 100)}%`);

/** card = { info, stats } as stored; site = the host printed in the corner. Returns PNG bytes. */
export async function renderOg(card, site = '') {
  const { info, stats } = card;
  const { pixels, rect, text } = canvas();
  const PAD = 64;
  const INNER = OG_W - PAD * 2;
  const ranked = Object.entries(stats.shares)
    .filter(([kind]) => stats.kinds[kind] > 0)
    .sort((a, b) => b[1] - a[1]);

  // The mark, the channel, the address.
  [[36, 'news'], [25, 'joke'], [14, 'ad']].forEach(([width, kind], i) => rect(PAD, 52 + i * 12, width, 8, KIND_INDEX[kind]));
  text(`@${info.username}`.toUpperCase().slice(0, 28), PAD + 56, 54, 4, TEXT);
  text(site.toUpperCase().slice(0, 34), OG_W - PAD, 58, 3, DIM, 'end');

  // The largest kind, as large as it gets.
  const [topKind, topShare] = ranked[0] ?? ['other', 0];
  text(label(topShare), PAD, 140, 22, KIND_INDEX[topKind]);

  // The next kinds: a bar each, scaled to the largest.
  const LEGEND_X = 600;
  ranked.slice(0, 5).forEach(([kind, share], i) => {
    const y = 140 + i * 32;
    rect(LEGEND_X, y + 4, 14, 14, KIND_INDEX[kind]);
    rect(LEGEND_X + 30, y + 8, 400, 6, PANEL);
    rect(LEGEND_X + 30, y + 8, Math.max(3, (400 * share) / topShare), 6, KIND_INDEX[kind]);
    text(label(share), OG_W - PAD, y, 3, i ? DIM : TEXT, 'end');
  });

  // All kinds in one bar.
  let x = PAD;
  for (const [kind, share] of ranked) {
    rect(x, 344, Math.max(0, share * INNER - 3), 32, KIND_INDEX[kind]);
    x += share * INNER;
  }

  // Twelve months, each stretched to full height: the mix, not the number of posts.
  const TOP = 416;
  const HEIGHT = 140;
  const slot = INNER / stats.trend.length;
  stats.trend.forEach((month, i) => {
    const left = PAD + i * slot + 10;
    const width = slot - 20;
    let bottom = TOP + HEIGHT;
    if (!month.total) rect(left, bottom - 3, width, 3, FAINT);
    for (const [kind] of ranked) {
      const part = ((month.kinds[kind] ?? 0) / (month.total || 1)) * HEIGHT;
      if (!part) continue;
      bottom -= part;
      rect(left, bottom, width, Math.max(1, part - 1), KIND_INDEX[kind]);
    }
    text(month.month.slice(5), left + width / 2 - 11, TOP + HEIGHT + 14, 2, DIM);
  });

  return encodePng(pixels, OG_W, OG_H);
}
