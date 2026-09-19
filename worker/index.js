// The whole back end, as one Cloudflare Worker on the free plan. A free invocation may make 50
// outgoing requests and hold 6 connections, so no single request can read a channel. Instead the
// browser drives the run: /api/plan decides which preview pages make up the year, /api/page reads
// and judges one page (about 20 posts) and streams the answers, /api/finish adds everything up.
// Every number on a card comes from rows this Worker wrote itself; the browser only sets the pace.
import { DICTIONARIES, percent } from '../public/i18n.js';
import { aggregate, effectiveKind, YES } from '../shared/aggregate.js';
import { classifyPost, eachLimit, pickProvider, PROVIDERS } from '../shared/jev.js';
import { renderOg } from '../shared/og.js';
import { fetchAvatar, fetchPage, parseChannelName, planChannel } from '../shared/telegram.js';

const MONTHS = 12;
const CARD_TTL_MS = 24 * 3600 * 1000;
const PLAN_JOIN_MS = 15 * 60 * 1000; // a second visitor within this time joins the same run
const PLAN_VALID_MS = 2 * 3600 * 1000;
const CONNECTIONS = 6; // what one invocation may hold open
const RETRIES_PER_PAGE = 20; // 1 page + 20 posts + these stay under 50 outgoing requests
const STORED_TEXT = 200;
const ENOUGH_PAGES = 0.8;
const HOME_TILES = 9;
const HOME_DAYS = 7; // "popular" on the front page means fresh runs within these days
const HOME_TTL_S = 300; // in the Worker's cache only: a browser gets no-store, so a visitor sees their new card on the front page

const today = () => new Date().toISOString().slice(0, 10);

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

const refuse = (code, message, status = 400) => json({ error: { code, message } }, status);

const channelList = (value) => String(value ?? '').split(',').map((name) => parseChannelName(name.trim())?.toLowerCase()).filter(Boolean);

const settings = (env) => ({
  maxPosts: Number(env.WRAPPED_MAX_POSTS ?? 1500),
  dailyLimit: Number(env.WRAPPED_DAILY_LIMIT ?? 0), // fresh runs one address may start per day, 0 = no limit
  dailyBudget: Number(env.WRAPPED_DAILY_BUDGET_USD ?? 0), // what all visitors together may spend per day, 0 = no ceiling
  showcase: channelList(env.WRAPPED_SHOWCASE), // always on the front page, first
  hidden: channelList(env.WRAPPED_HIDDEN), // never on the front page
  tileSubscribers: Number(env.WRAPPED_TILES_MIN_SUBSCRIBERS ?? 5000), // smaller channels get a card and no tile
});

async function visitorId(request) {
  const address = request.headers.get('CF-Connecting-IP') ?? 'local';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${address}|${today()}`));
  return [...new Uint8Array(digest).subarray(0, 8)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const readCard = async (env, channel) => {
  const row = await env.DB.prepare('SELECT card, created_at, max_posts FROM cards WHERE channel = ?').bind(channel).first();
  return row && { card: JSON.parse(row.card), createdAt: row.created_at, maxPosts: row.max_posts };
};

const readPlan = async (env, channel) => {
  const row = await env.DB.prepare('SELECT created_at, max_posts, since, plan FROM plans WHERE channel = ?').bind(channel).first();
  return row && { createdAt: row.created_at, maxPosts: row.max_posts, since: row.since, ...JSON.parse(row.plan) };
};

/** What the browser needs to run a plan; pagesAtOnce is how hard the chosen way to Jev may be pushed. */
const planAnswer = (plan, maxPosts, provider) => ({ info: plan.info, befores: plan.befores, sampled: plan.sampled, maxPosts, provider: provider.name, model: provider.model, pagesAtOnce: provider.pagesAtOnce });

async function handlePlan(request, env, url) {
  const startedAt = new Date().toISOString(); // the run is timed from here, reading the channel included
  const channel = parseChannelName(url.searchParams.get('channel'))?.toLowerCase();
  if (!channel) return refuse('bad_name', 'not a channel name');
  const provider = pickProvider(env);
  if (!provider) return refuse('no_key', `neither ${Object.values(PROVIDERS).map((known) => known.keyName).join(' nor ')} is set`, 500);

  const { maxPosts: ceiling, dailyLimit, dailyBudget } = settings(env);
  const limit = Number(url.searchParams.get('limit')); // ?limit=50 reads fewer posts: a cheap way to try a channel
  const maxPosts = limit > 0 ? Math.min(limit, ceiling) : ceiling;

  if (!url.searchParams.has('fresh')) {
    const cached = await readCard(env, channel);
    if (cached && Date.now() - new Date(cached.createdAt) < CARD_TTL_MS && cached.maxPosts >= maxPosts) return json({ card: { ...cached.card, cached: true } });
  }

  const running = await readPlan(env, channel);
  if (running && Date.now() - new Date(running.createdAt) < PLAN_JOIN_MS && running.maxPosts === maxPosts) return json(planAnswer(running, maxPosts, provider));

  if (dailyBudget) {
    const spent = await env.DB.prepare('SELECT COALESCE(SUM(usd), 0) AS usd FROM pages WHERE day = ?').bind(today()).first('usd');
    if (spent >= dailyBudget) return refuse('limit', 'daily budget is used up', 429);
  }
  const visitor = await visitorId(request);
  if (dailyLimit) {
    const runs = await env.DB.prepare('SELECT COUNT(*) AS runs FROM runs WHERE visitor = ? AND day = ?').bind(visitor, today()).first('runs');
    if (runs >= dailyLimit) return refuse('limit', 'daily limit reached', 429);
  }

  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - MONTHS);
  let plan;
  try {
    plan = await planChannel(channel, { since, maxPosts });
  } catch (error) {
    return error.code === 'not_found' ? refuse('not_found', error.message, 404) : refuse('error', error.message, 502);
  }
  const avatar = plan.info.avatarUrl ? await fetchAvatar(plan.info.avatarUrl) : null;
  plan.info = { ...plan.info, avatar, avatarUrl: undefined };

  const now = startedAt;
  await env.DB.batch([
    env.DB.prepare('INSERT OR REPLACE INTO plans (channel, created_at, max_posts, since, plan) VALUES (?, ?, ?, ?, ?)').bind(channel, now, maxPosts, since.toISOString(), JSON.stringify(plan)),
    env.DB.prepare('INSERT INTO runs (visitor, day, channel, created_at) VALUES (?, ?, ?, ?)').bind(visitor, today(), channel, now),
  ]);
  return json(planAnswer(plan, maxPosts, provider));
}

const brief = (post, max) => ({ id: post.id, date: post.date, text: post.text.replace(/\s+/g, ' ').slice(0, max) });

/** What the browser is told about one judged post; the thresholds stay on this side. */
const answerLine = (channel, post, extra = {}) => ({
  type: 'answer',
  ...brief(post, 320),
  url: `https://t.me/${channel}/${post.id}`,
  kind: effectiveKind(post),
  kindConfidence: post.kindConfidence,
  isAd: post.isAd,
  clickbait: post.clickbait,
  pressure: post.pressure,
  isClickbait: post.clickbait >= YES,
  isPressure: post.pressure >= YES,
  ...extra,
});

/** Answers this Worker already has for the ids on a page, from rows of earlier runs. */
async function knownAnswers(env, channel, posts) {
  const lowest = posts[0].id;
  const highest = posts.at(-1).id;
  const { results } = await env.DB.prepare('SELECT posts FROM pages WHERE channel = ? AND (before = 0 OR (before > ? AND before <= ?))').bind(channel, lowest, highest + 100).all();
  const known = new Map();
  for (const row of results) for (const post of JSON.parse(row.posts)) if (post.kind) known.set(post.id, post);
  return known;
}

async function judgePage(env, channel, plan, before, say) {
  if (before) {
    const stored = await env.DB.prepare('SELECT posts FROM pages WHERE channel = ? AND before = ?').bind(channel, before).first('posts');
    if (stored) {
      const posts = JSON.parse(stored);
      say({ type: 'media', count: posts.filter((post) => !post.kind).length });
      for (const post of posts) if (post.kind) say(answerLine(channel, post, { reused: true }));
      return say({ type: 'end', usd: 0, tokens: 0, failed: 0 });
    }
  }

  const page = await fetchPage(channel, before);
  const inRange = page.posts.filter((post) => post.date >= plan.since);
  const known = inRange.length ? await knownAnswers(env, channel, inRange) : new Map();
  const judged = [];
  const toJudge = [];
  for (const post of inRange) {
    const earlier = known.get(post.id);
    if (earlier) judged.push({ ...earlier, views: post.views });
    else if (post.text) toJudge.push(post);
    else judged.push({ id: post.id, date: post.date, views: post.views, text: '' });
  }
  say({ type: 'media', count: judged.filter((post) => !post.kind).length });
  for (const post of judged) if (post.kind) say(answerLine(channel, post, { reused: true }));
  say({ type: 'posts', posts: toJudge.map((post) => brief(post, 140)) });

  let usd = 0;
  let tokens = 0;
  let failed = 0;
  let throttled = 0;
  let fatal = null;
  const retries = { left: RETRIES_PER_PAGE };
  const provider = pickProvider(env);
  await eachLimit(
    toJudge,
    CONNECTIONS,
    async (post) => {
      if (fatal) return;
      const answer = await classifyPost(provider, plan.info.title, post, retries);
      usd += answer.usd;
      tokens += answer.tokens;
      const { kind, kindConfidence, isAd, clickbait, pressure } = answer;
      const stored = { id: post.id, date: post.date, views: post.views, text: post.text.slice(0, STORED_TEXT), kind, kindConfidence, isAd, clickbait, pressure };
      judged.push(stored);
      say(answerLine(channel, { ...stored, text: post.text }, { ms: answer.ms, usd: answer.usd, tokens: answer.tokens, model: answer.model }));
    },
    (post, error) => {
      if (error.fatal || error.code === 'no_key') fatal = error;
      if (error.throttled) throttled += 1;
      failed += 1;
      console.warn(`[${channel}] post ${post.id}: ${error.message}`);
    },
  );
  if (fatal) return say({ type: 'fatal', code: 'error', message: fatal.message });

  // A page that mostly failed is not kept: the browser asks for it again once the throttling eases.
  const retry = failed > toJudge.length * 0.3;
  if (!retry) {
    await env.DB.prepare('INSERT OR REPLACE INTO pages (channel, before, day, lowest, found, posts, usd, tokens, failed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(channel, before, today(), page.posts[0]?.id ?? before, page.posts.length, JSON.stringify(judged), usd, tokens, failed)
      .run();
  }
  say({ type: 'end', usd, tokens, failed, throttled, retry });
}

async function handlePage(env, ctx, url) {
  const channel = parseChannelName(url.searchParams.get('channel'))?.toLowerCase();
  const before = Number(url.searchParams.get('before'));
  const plan = channel && (await readPlan(env, channel));
  // Only pages of a plan made here are judged: nobody can spend the key on pages of their own choosing.
  if (!plan || Date.now() - new Date(plan.createdAt) > PLAN_VALID_MS || !plan.befores.includes(before)) return refuse('no_plan', 'ask for /api/plan first', 409);

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const say = (line) => writer.write(encoder.encode(`${JSON.stringify(line)}\n`)).catch(() => {});
  ctx.waitUntil(
    judgePage(env, channel, plan, before, say)
      .catch((error) => (console.error(`[${channel}] page ${before}: ${error.message}`), say({ type: 'end', usd: 0, tokens: 0, failed: 0, retry: true })))
      .finally(() => writer.close().catch(() => {})),
  );
  return new Response(readable, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

async function handleFinish(env, url) {
  const channel = parseChannelName(url.searchParams.get('channel'))?.toLowerCase();
  const plan = channel && (await readPlan(env, channel));
  if (!plan) return refuse('no_plan', 'ask for /api/plan first', 409);
  const provider = pickProvider(env);
  if (!provider) return refuse('no_key', 'no Jev API key is set', 500);

  const done = await readCard(env, channel);
  if (done && done.createdAt > plan.createdAt) return json({ card: done.card });

  const { results } = await env.DB.prepare('SELECT before, lowest, found, posts, usd, tokens, failed FROM pages WHERE channel = ? AND before <= ?')
    .bind(channel, Math.max(...plan.befores))
    .all();
  const wanted = new Set(plan.befores);
  const rows = results.filter((row) => wanted.has(row.before));
  if (rows.length < plan.befores.length * ENOUGH_PAGES) return refuse('incomplete', `${rows.length} of ${plan.befores.length} pages are judged`, 409);

  const byId = new Map();
  let idsCovered = 0;
  let postsFound = 0;
  let usd = 0;
  let tokens = 0;
  let failed = 0;
  for (const row of rows) {
    for (const post of JSON.parse(row.posts)) byId.set(post.id, { ...post, url: `https://t.me/${channel}/${post.id}` });
    idsCovered += (row.before || plan.latestId + 1) - row.lowest;
    postsFound += row.found;
    usd += row.usd;
    tokens += row.tokens;
    failed += row.failed;
  }
  const posts = [...byId.values()].sort((a, b) => b.id - a.id).slice(0, plan.maxPosts).reverse();
  if (!posts.length) return refuse('empty', 'no posts in the last year', 404);

  const judged = posts.filter((post) => post.kind).length;
  const estimatedTotal = plan.sampled && idsCovered ? Math.round(((plan.latestId - plan.startId) * postsFound) / idsCovered) : posts.length;
  const createdAt = new Date().toISOString();
  const card = {
    info: plan.info,
    stats: aggregate(posts, { months: MONTHS, estimatedTotal: plan.sampled ? estimatedTotal : undefined }),
    meta: { posts: posts.length, judged, failed, seconds: (Date.now() - new Date(plan.createdAt)) / 1000, usd, tokens, model: provider.model, provider: provider.name, createdAt, months: MONTHS, maxPosts: plan.maxPosts, sampled: plan.sampled, estimatedTotal },
  };
  await env.DB.prepare('INSERT OR REPLACE INTO cards (channel, created_at, max_posts, card) VALUES (?, ?, ?, ?)').bind(channel, createdAt, plan.maxPosts, JSON.stringify(card)).run();
  await caches.default.delete(homeKey(url)); // the front page may show the new card at once
  return json({ card });
}

async function handleCard(env, name) {
  const channel = parseChannelName(name)?.toLowerCase();
  const cached = channel && (await readCard(env, channel));
  return cached ? json(cached.card) : refuse('no_card', 'no card yet', 404);
}

/** The examples on the front page: only cards that already exist, so showing them costs nothing. */
const homeKey = (url) => new Request(`${url.origin}/api/home`);

/**
 * The front page: tiles of channels that already have a card, and two totals. A tile needs a full
 * run and a channel big enough to be public knowledge anyway; WRAPPED_SHOWCASE channels skip that
 * test and come first, WRAPPED_HIDDEN channels never show. The rest are ordered by fresh runs this
 * week. SQLite picks the few fields out of the stored cards, so the Worker never parses them.
 */
async function handleHome(env, ctx, url) {
  const hit = await caches.default.match(homeKey(url));
  if (hit) return new Response(hit.body, json(null)); // the stored bytes with the headers every answer gets

  const { showcase, hidden, tileSubscribers, maxPosts } = settings(env);
  const marks = (list) => list.map(() => '?').join(', ') || "''"; // an empty list matches no channel
  const since = new Date(Date.now() - HOME_DAYS * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const [tiles, totals] = await env.DB.batch([
    env.DB.prepare(
      `SELECT json_extract(c.card, '$.info.username') AS username, json_extract(c.card, '$.info.title') AS title,
              json_extract(c.card, '$.info.avatar') AS avatar, json_extract(c.card, '$.info.subscribers') AS subscribers,
              json_extract(c.card, '$.meta.posts') AS posts, json_extract(c.card, '$.stats.shares') AS shares,
              json_extract(c.card, '$.stats.clickbaitShare') AS clickbaitShare, json_extract(c.card, '$.stats.pressureShare') AS pressureShare,
              c.channel IN (${marks(showcase)}) AS pinned, COALESCE(r.runs, 0) AS runs
       FROM cards c LEFT JOIN (SELECT channel, COUNT(*) AS runs FROM runs WHERE day >= ? GROUP BY channel) r ON r.channel = c.channel
       WHERE c.channel NOT IN (${marks(hidden)})
         AND (c.channel IN (${marks(showcase)}) OR (c.max_posts >= ? AND json_extract(c.card, '$.info.subscribers') >= ?))
       ORDER BY pinned DESC, runs DESC, c.created_at DESC LIMIT ?`,
    ).bind(...showcase, since, ...hidden, ...showcase, maxPosts, tileSubscribers, HOME_TILES),
    env.DB.prepare("SELECT COUNT(*) AS channels, COALESCE(SUM(json_extract(card, '$.meta.posts')), 0) AS posts FROM cards"),
  ]);

  // Showcase channels keep the order they are listed in: the first one is the example next to the form.
  const place = (tile) => (tile.pinned ? showcase.indexOf(tile.username.toLowerCase()) : showcase.length);
  const body = {
    tiles: tiles.results.sort((a, b) => place(a) - place(b)).map(({ shares, pinned, runs, ...tile }) => ({ ...tile, shares: JSON.parse(shares) })),
    totals: totals.results[0],
  };
  // Two copies: the zone's Browser Cache TTL rewrites any cacheable answer to hours, so the browser's copy is no-store.
  ctx.waitUntil(caches.default.put(homeKey(url), new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${HOME_TTL_S}` } })));
  return json(body);
}

async function handleOg(request, env, ctx, name) {
  const hit = await caches.default.match(request);
  if (hit) return hit;
  const channel = parseChannelName(name.replace(/\.png$/, ''))?.toLowerCase();
  const cached = channel && (await readCard(env, channel));
  if (!cached) return new Response('not found', { status: 404 });
  const png = await renderOg(cached.card, new URL(request.url).host);
  const response = new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' } });
  ctx.waitUntil(caches.default.put(request, response.clone()));
  return response;
}

const escapeHtml = (value) => String(value).replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** A link to a card pasted into a messenger should say what is on the card, so the page head is filled in here. */
async function pageHead(env, url) {
  const t = DICTIONARIES.uk;
  let title = `Jev Wrapped · ${t.title}`;
  let description = t.lead;
  let image = '';
  const channel = url.pathname.startsWith('/c/') && parseChannelName(url.pathname.slice(3))?.toLowerCase();
  const cached = channel && (await readCard(env, channel));
  if (cached) {
    const { info, stats, meta } = cached.card;
    const [kind, share] = Object.entries(stats.shares).sort((a, b) => b[1] - a[1])[0];
    title = `${info.title}: ${percent(share)} — ${t.kinds[kind].toLowerCase()}`;
    description = `${t.metrics.ad} ${percent(stats.shares.ad)} · ${t.metrics.clickbait} ${percent(stats.clickbaitShare)} · ${t.metrics.pressure} ${percent(stats.pressureShare)}. ${t.postsRead(meta.posts, meta.posts)} за рік оцінила модель Jev.`;
    image = `${url.origin}/og/${channel}.png?v=${Date.parse(cached.createdAt)}`;
  }
  return `<title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Jev Wrapped" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />${
      image
        ? `
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />`
        : ''
    }`;
}

const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-cache',
  // Cloudflare adds its Web Analytics script to pages of a zone that has it on: no cookies, page views and referrers only.
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
};

async function servePage(request, env, url) {
  const asset = await env.ASSETS.fetch(new Request(new URL('/index.html', url), { headers: request.headers }));
  const html = await asset.text();
  return new Response(html.replace('<!-- head -->', await pageHead(env, url)), { headers: PAGE_HEADERS });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
    try {
      if (url.pathname === '/api/plan') return await handlePlan(request, env, url);
      if (url.pathname === '/api/page') return await handlePage(env, ctx, url);
      if (url.pathname === '/api/finish') return await handleFinish(env, url);
      if (url.pathname === '/api/home') return await handleHome(env, ctx, url);
      if (url.pathname.startsWith('/api/card/')) return await handleCard(env, url.pathname.slice('/api/card/'.length));
      if (url.pathname.startsWith('/og/')) return await handleOg(request, env, ctx, url.pathname.slice('/og/'.length));
      if (url.pathname === '/' || url.pathname.startsWith('/c/')) return await servePage(request, env, url);
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(error);
      return refuse('error', 'something went wrong', 500);
    }
  },
};
