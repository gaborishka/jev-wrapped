// The shareable card, drawn as one SVG string: it is shown on the page as is and rasterised
// to a PNG for download. No web fonts and no external images, so the PNG looks like the page.
import { KIND_COLORS, compact, money, percent, shortDate } from './i18n.js';

export const CARD_W = 1080;
export const CARD_H = 1350;

const PAD = 72;
const INNER = CARD_W - PAD * 2;
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const INK = '#0b0e13';
const PANEL = '#151a22';
const TEXT = '#f2f4f8';
const DIM = '#8b93a3';
const METRIC_COLORS = { ad: KIND_COLORS.ad, clickbait: KIND_COLORS.joke, pressure: KIND_COLORS.analysis };

const escapeXml = (value) => String(value).replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[char]);

/** Cuts on a code point boundary, so an emoji at the cut is not split in half. */
function truncate(value, max) {
  const chars = [...String(value)];
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : chars.join('');
}

const text = (x, y, size, content, { fill = TEXT, weight = 400, anchor = 'start' } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeXml(content)}</text>`;

/** Kinds that occur in the channel, largest first. */
export function rankedKinds(stats) {
  return Object.entries(stats.shares)
    .filter(([kind]) => stats.kinds[kind] > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, share]) => ({ kind, share }));
}

let renders = 0; // two cards can be on one page: clip-path ids must not collide

function header(info, t, uid) {
  const initials = truncate(info.title, 2).replace('…', '').toUpperCase();
  // Only an inlined image is accepted: anything else would be a request to a third party, or markup.
  const avatar = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(info.avatar ?? '')
    ? `<image href="${info.avatar}" x="${PAD}" y="${PAD}" width="120" height="120" clip-path="url(#avatar-${uid})" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="${PAD + 60}" cy="${PAD + 60}" r="60" fill="${PANEL}"/>${text(PAD + 60, PAD + 76, 44, initials, { weight: 700, anchor: 'middle', fill: DIM })}`;
  const subline = [`@${info.username}`, info.subscribers ? t.subscribers(compact(info.subscribers, t.lang)) : ''].filter(Boolean).join(' · ');
  return `${avatar}
    ${text(PAD + 150, PAD + 52, 42, truncate(info.title, 32), { weight: 700 })}
    ${text(PAD + 150, PAD + 98, 27, subline, { fill: DIM })}`;
}

function headline(ranked, t) {
  const top = ranked[0];
  if (!top) return '';
  return `${text(PAD - 6, 386, 168, percent(top.share), { weight: 800, fill: KIND_COLORS[top.kind] })}
    ${text(PAD, 452, 48, t.kinds[top.kind], { weight: 600 })}`;
}

function stackedBar(ranked, y, uid) {
  let x = PAD;
  const segments = ranked.map(({ kind, share }) => {
    const width = share * INNER;
    const rect = `<rect x="${x.toFixed(1)}" y="${y}" width="${Math.max(0, width - 3).toFixed(1)}" height="40" fill="${KIND_COLORS[kind]}"/>`;
    x += width;
    return rect;
  });
  return `<g clip-path="url(#bar-${uid})">${segments.join('')}</g>`;
}

const LEGEND_ROWS = 5;

/**
 * Ten slots, largest share first. Kinds the channel never posts fill the rest, dimmed:
 * "jokes 0%" says as much about a channel as "news 80%" does.
 */
function legend(stats, ranked, t, y) {
  const absent = Object.keys(t.kinds)
    .filter((kind) => !stats.kinds[kind] && kind !== 'other' && kind !== 'media')
    .map((kind) => ({ kind, share: 0 }));
  const columnWidth = (INNER - 48) / 2;
  return [...ranked, ...absent]
    .slice(0, LEGEND_ROWS * 2)
    .map(({ kind, share }, index) => {
      const x = PAD + (index >= LEGEND_ROWS ? columnWidth + 48 : 0);
      const rowY = y + (index % LEGEND_ROWS) * 50;
      const fill = share ? TEXT : DIM;
      return `<circle cx="${x + 11}" cy="${rowY - 10}" r="11" fill="${KIND_COLORS[kind]}" opacity="${share ? 1 : 0.35}"/>
        ${text(x + 38, rowY, 29, t.kinds[kind], { fill })}
        ${text(x + columnWidth, rowY, 29, percent(share), { weight: 700, anchor: 'end', fill })}`;
    })
    .join('');
}

function metrics(stats, t, y) {
  const values = { ad: stats.shares.ad, clickbait: stats.clickbaitShare, pressure: stats.pressureShare };
  const width = (INNER - 48) / 3;
  return Object.keys(values)
    .map((key, index) => {
      const x = PAD + index * (width + 24);
      return `<rect x="${x}" y="${y}" width="${width}" height="150" rx="22" fill="${PANEL}"/>
        ${text(x + 28, y + 78, 60, percent(values[key]), { weight: 800, fill: METRIC_COLORS[key] })}
        ${text(x + 28, y + 120, 25, t.metrics[key], { fill: DIM })}`;
    })
    .join('');
}

/** One column per month, each stretched to full height: the mix of kinds, not the number of posts. */
function trend(stats, ranked, t, y) {
  const height = 130;
  const slot = INNER / stats.trend.length;
  const barWidth = Math.min(54, slot - 16);
  const order = ranked.map(({ kind }) => kind);
  const columns = stats.trend
    .map((month, index) => {
      const x = PAD + index * slot + (slot - barWidth) / 2;
      let top = y + height;
      const parts = order
        .filter((kind) => month.kinds[kind] > 0)
        .map((kind) => {
          const part = (month.kinds[kind] / month.total) * height;
          top -= part;
          return `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(0, part - 1).toFixed(1)}" fill="${KIND_COLORS[kind]}"/>`;
        });
      const empty = month.total ? '' : `<rect x="${x.toFixed(1)}" y="${y + height - 3}" width="${barWidth.toFixed(1)}" height="3" fill="${PANEL}"/>`;
      const label = t.months[Number(month.month.slice(5)) - 1];
      return `${parts.join('')}${empty}${text(x + barWidth / 2, y + height + 32, 21, label, { fill: DIM, anchor: 'middle' })}`;
    })
    .join('');
  const perWeek = stats.postsPerWeek >= 10 ? Math.round(stats.postsPerWeek) : stats.postsPerWeek.toFixed(1);
  return `${text(PAD, y - 24, 25, t.trend, { fill: DIM })}
    ${text(CARD_W - PAD, y - 24, 25, `${t.period(shortDate(stats.from, t), shortDate(stats.to, t))} · ${t.perWeek(perWeek)}`, { fill: DIM, anchor: 'end' })}
    ${columns}`;
}

function postsLine(meta, t) {
  const read = meta.posts.toLocaleString(t.lang === 'uk' ? 'uk-UA' : 'en-US');
  return meta.sampled ? t.postsSampled(read, compact(meta.estimatedTotal, t.lang)) : t.postsRead(read, meta.posts);
}

/** card = { info, stats, meta } as the server sends it; t = a dictionary from i18n.js; site = the address printed on the card, so a shared picture leads back to the tool. */
export function renderCard(card, t, site = '') {
  const { info, stats, meta } = card;
  const ranked = rankedKinds(stats);
  const uid = ++renders;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_W} ${CARD_H}" width="${CARD_W}" height="${CARD_H}" font-family="${FONT}">
  <defs>
    <clipPath id="avatar-${uid}"><circle cx="${PAD + 60}" cy="${PAD + 60}" r="60"/></clipPath>
    <clipPath id="bar-${uid}"><rect x="${PAD}" y="500" width="${INNER}" height="40" rx="20"/></clipPath>
  </defs>
  <rect width="${CARD_W}" height="${CARD_H}" fill="${INK}"/>
  ${header(info, t, uid)}
  ${headline(ranked, t)}
  ${stackedBar(ranked, 500, uid)}
  ${legend(stats, ranked, t, 606)}
  ${metrics(stats, t, 850)}
  ${trend(stats, ranked, t, 1080)}
  ${text(PAD, CARD_H - 50, 23, t.footer(postsLine(meta, t), Math.round(meta.seconds), money(meta.usd)), { fill: DIM })}
  ${text(CARD_W - PAD, CARD_H - 50, 23, site ? t.madeAt(site) : t.madeWith, { fill: site ? TEXT : DIM, anchor: 'end' })}
</svg>`;
}

/** SVG string → PNG blob, at twice the card size so it stays sharp after Telegram recompresses it. */
export async function cardToPng(svg, scale = 2) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = CARD_W * scale;
    canvas.height = CARD_H * scale;
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
