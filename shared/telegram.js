// Reads a public channel through Telegram's own web preview, https://t.me/s/<channel>.
// No login and no API key: the page shows about 20 posts, `?before=<id>` shows the 20 before that id.

const PAGE_SIZE = 20;
const FETCH_TIMEOUT_MS = 12_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; jev-wrapped/0.1; +https://github.com/gaborishka/jev-wrapped)';

const CHANNEL_RE = /^[a-z][a-z0-9_]{3,31}$/i;

/** Accepts "name", "@name", "t.me/name", "https://t.me/s/name/123". Returns the bare name or null. */
export function parseChannelName(input) {
  const raw = String(input ?? '').trim();
  const fromLink = raw.match(/^(?:https?:\/\/)?(?:t|telegram)\.me\/(?:s\/)?([^/?#\s]+)/i);
  const name = (fromLink ? fromLink[1] : raw).replace(/^@/, '');
  return CHANNEL_RE.test(name) ? name : null;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? whole;
    const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
  });
}

/** HTML fragment → plain text with line breaks kept. */
export function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|blockquote|pre|li)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Inner HTML of the first <div> whose class list contains `className`; nested divs are balanced. */
function innerDiv(html, className) {
  const open = new RegExp(`<div[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>`).exec(html);
  if (!open) return null;
  const start = open.index + open[0].length;
  const tags = /<(\/?)div\b[^>]*>/g;
  tags.lastIndex = start;
  let depth = 1;
  for (let tag = tags.exec(html); tag; tag = tags.exec(html)) {
    depth += tag[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, tag.index);
  }
  return html.slice(start);
}

const textOf = (html, className) => {
  const inner = innerDiv(html, className);
  return inner === null ? '' : htmlToText(inner);
};

/** "18.8M" → 18800000, "1.2K" → 1200, "532" → 532 */
export function parseCount(text) {
  const match = String(text ?? '').trim().match(/^([\d.,\s]+)\s*([KMB])?$/i);
  if (!match) return null;
  const value = parseFloat(match[1].replace(/\s/g, '').replace(',', '.'));
  const factor = { K: 1e3, M: 1e6, B: 1e9 }[match[2]?.toUpperCase()] ?? 1;
  return Number.isFinite(value) ? Math.round(value * factor) : null;
}

function mediaOf(html) {
  const kinds = [];
  if (/tgme_widget_message_photo_wrap/.test(html)) kinds.push('photo');
  if (/tgme_widget_message_(video|roundvideo)/.test(html)) kinds.push('video');
  if (/tgme_widget_message_voice/.test(html)) kinds.push('voice message');
  if (/tgme_widget_message_document/.test(html)) kinds.push('file');
  if (/tgme_widget_message_poll/.test(html)) kinds.push('poll');
  if (/tgme_widget_message_sticker/.test(html)) kinds.push('sticker');
  return kinds.join(', ');
}

function parsePost(html, channel) {
  // "Channel created" and "pinned a photo" are service messages: they have text and sometimes a date, and are not posts.
  if (/class="tgme_widget_message [^"]*\bservice_message\b/.test(html)) return null;
  const id = Number(html.match(/data-post="[^"/]+\/(\d+)"/)?.[1]);
  const date = html.match(/tgme_widget_message_date"[^>]*>\s*<time[^>]*datetime="([^"]+)"/)?.[1];
  if (!id || !date) return null;
  const poll = textOf(html, 'tgme_widget_message_poll_question');
  const text = [textOf(html, 'js-message_text'), poll && `Poll: ${poll}`].filter(Boolean).join('\n');
  const linkTitle = textOf(html, 'link_preview_title');
  const forwarded = html.match(/tgme_widget_message_forwarded_from_name[^>]*>(?:<span[^>]*>)?([^<]+)/)?.[1];
  return {
    id,
    url: `https://t.me/${channel}/${id}`,
    date,
    text,
    views: parseCount(html.match(/tgme_widget_message_views">([^<]*)/)?.[1]),
    media: mediaOf(html),
    link: linkTitle
      ? { title: linkTitle, description: textOf(html, 'link_preview_description'), site: textOf(html, 'link_preview_site_name') }
      : null,
    forwardedFrom: forwarded ? decodeEntities(forwarded).trim() : '',
  };
}

function parseInfo(html, channel) {
  const counters = {};
  for (const [, value, type] of html.matchAll(/counter_value">([^<]*)<\/span>\s*<span class="counter_type">([^<]*)/g)) {
    counters[type.trim()] = parseCount(value);
  }
  const title = html.match(/tgme_channel_info_header_title"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/)?.[1];
  return {
    username: channel,
    title: title ? htmlToText(title) : channel,
    description: textOf(html, 'tgme_channel_info_description'),
    subscribers: counters.subscribers ?? counters.subscriber ?? null,
    avatarUrl: html.match(/tgme_page_photo_image[^>]*>\s*<img[^>]*src="([^"]+)"/)?.[1] ?? null,
  };
}

/** One preview page → { info, posts (oldest first), before: id to ask for the previous page or null }. */
export function parsePage(html, channel) {
  const chunks = html.split(/<div class="tgme_widget_message_wrap\b/).slice(1);
  const posts = chunks.map((chunk) => parsePost(chunk, channel)).filter(Boolean);
  const before = Number(html.match(/js-messages_more"[^>]*data-before="(\d+)"/)?.[1]) || null;
  return { info: parseInfo(html, channel), posts, before, isChannel: /tgme_channel_info/.test(html) };
}

async function fetchText(url, attempt = 0) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
    redirect: 'manual', // a name that is not a public channel redirects to t.me/<name>
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if ((response.status === 429 || response.status >= 500) && attempt < 3) {
    await new Promise((resolve) => setTimeout(resolve, 800 * 2 ** attempt));
    return fetchText(url, attempt + 1);
  }
  if (response.status >= 300 && response.status < 400) return null;
  if (!response.ok) throw new Error(`t.me answered ${response.status}`);
  return response.text();
}

const pageUrl = (channel, before) => `https://t.me/s/${channel}${before ? `?before=${before}` : ''}`;

export const fetchPage = async (channel, before) => parsePage((await fetchText(pageUrl(channel, before))) ?? '', channel);

/**
 * Smallest `before` whose page still reaches back to `since`, found by bisection over post ids
 * (ids grow with time). Costs about log2(latestId) page requests.
 */
async function findStartId(channel, latestId, since) {
  let low = 1; // posts below `low` are older than `since`
  let high = latestId; // posts from `high` up are newer
  while (high - low > PAGE_SIZE * 2) {
    const middle = Math.floor((low + high) / 2);
    const { posts } = await fetchPage(channel, middle);
    const newestBelow = posts.at(-1);
    if (newestBelow && new Date(newestBelow.date) >= since) high = posts[0].id;
    else low = middle; // nothing below `middle`, or everything below it is too old
  }
  return low;
}

/**
 * Decides which preview pages make up the last year of a channel, without reading them all.
 * A channel with up to `maxPosts` posts in that range is read in full. A busier one is sampled:
 * pages spread evenly over the id range, so every month is represented and the cost stays flat.
 * Post ids are consecutive integers, which is what makes both the bisection and the even
 * spread possible; gaps left by deleted posts and albums only make pages overlap.
 * Returns { info, befores, sampled, latestId, startId }; befores[0] is 0, the newest page.
 */
export async function planChannel(channel, { since, maxPosts }) {
  const firstHtml = await fetchText(pageUrl(channel));
  const first = firstHtml && parsePage(firstHtml, channel);
  if (!first?.isChannel) throw Object.assign(new Error('not a public channel'), { code: 'not_found' });

  const latestId = first.posts.at(-1)?.id ?? 0;
  const reachedStart = first.posts.some((post) => new Date(post.date) < since) || !first.before;
  const startId = reachedStart ? latestId : await findStartId(channel, first.before, since);
  const span = Math.max(0, first.before - startId);
  const sampled = !reachedStart && span > maxPosts * 1.2;

  // Albums and service messages make a page hold fewer than 20 posts: size the sample by what the first page held.
  const pages = Math.ceil(maxPosts / Math.max(8, first.posts.length));
  const older = reachedStart
    ? []
    : sampled
      ? Array.from({ length: pages - 1 }, (_, i) => Math.round(first.before - (i * span) / (pages - 1)))
      : Array.from({ length: Math.ceil(span / PAGE_SIZE) + 1 }, (_, i) => first.before - i * PAGE_SIZE);

  return { info: first.info, befores: [0, ...older.filter((before) => before > 1)], sampled, latestId, startId };
}

/** Avatar as a data URI, so the card can be drawn to a PNG in the browser without CORS trouble. */
export async function fetchAvatar(url) {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== 'https:' || !/(^|\.)(telesco\.pe|cdn-telegram\.org|telegram\.org)$/.test(hostname)) return null;
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !type.startsWith('image/')) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 400_000) return null;
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${type};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}
