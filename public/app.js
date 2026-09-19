import { cardToPng, rankedKinds, renderCard } from './card.js';
import { DICTIONARIES, KIND_COLORS, compact, money, number, percent, pickLanguage } from './i18n.js';

const $ = (id) => document.getElementById(id);
const sections = { ask: $('ask'), run: $('run'), result: $('result') };

const FEED_EVERY_MS = 500; // in-flight posts change 40 times a second: show a readable sample of them
const LAST_EVERY_MS = 1100;
const SPARK_BARS = 36;
const TICK_MS = 150;
const FEED_SIZE = 4;
const VIEWS_MIN_POSTS = 10; // a kind with fewer posts gets no row in the views table: its median is noise
const VIEWS_SCALE = 0.25; // the views bars span at least ±25% around the channel median
const TOTALS_FROM = 3; // the totals under the form are shown from this many channels
const PAGES_AT_ONCE = 4; // preview pages in flight at most; the Worker judges 6 posts of each at a time and may ask for fewer pages
const CONNECTIONS_PER_PAGE = 6;
const PAGE_TRIES = 3;
const DONE_PAUSE_MS = 600; // let the finished dashboard be seen before the card replaces it
const SITE = ['localhost', '127.0.0.1'].includes(location.hostname) ? '' : location.host; // printed on the card
const JUDGED_KINDS = Object.keys(KIND_COLORS).filter((kind) => kind !== 'media');

let lang = pickLanguage();
let t = DICTIONARIES[lang];
let card = null;
let sample = null;
let home = null; // what /api/home answered: tiles of finished cards and two totals
let aborter = null; // stops the run in progress
let run = null; // what the live dashboard remembers between ticks

const show = (name) => Object.entries(sections).forEach(([key, section]) => (section.hidden = key !== name));

const lookup = (path) => path.split('.').reduce((node, key) => node?.[key], t);

function applyTexts() {
  document.documentElement.lang = lang;
  document.title = `Jev Wrapped · ${t.title}`;
  for (const element of document.querySelectorAll('[data-t]')) element.textContent = lookup(element.dataset.t);
  $('channel').placeholder = t.placeholder;
  $('lang').textContent = lang === 'uk' ? 'English' : 'Українська';
  if (card) showResult(card);
  if (sample) showSample();
  if (home) showHome();
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const shortDay = (iso) => new Date(iso).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

function fail(code) {
  stop();
  show('ask');
  $('problem').textContent = t.errors[code] ?? t.errors.error;
  $('problem').hidden = false;
}

function stop() {
  aborter?.abort();
  aborter = null;
}

// The front page: examples come from the cache, so looking at them costs nothing.
async function loadHome() {
  home = await fetch('/api/home').then((response) => (response.ok ? response.json() : null), () => null);
  if (!home?.tiles.length) return;
  showHome();
  // The example next to the form is the first tile: the first WRAPPED_SHOWCASE channel that has a card.
  const response = await fetch(`/api/card/${home.tiles[0].username}`);
  if (!response.ok) return;
  sample = await response.json();
  showSample();
}

/** One finished channel: who it is, its biggest kind of post, the whole mix as a bar, the three signals. */
function channelTile(tile) {
  const link = element('a', 'channel');
  link.href = `/c/${tile.username}`;

  const head = element('div', 'channel-head');
  if (tile.avatar) {
    const avatar = element('img');
    avatar.src = tile.avatar;
    avatar.alt = '';
    head.append(avatar);
  } else head.append(element('i', 'channel-letter', tile.title.trim().charAt(0).toUpperCase()));
  const names = element('div', 'channel-names');
  names.append(element('b', '', tile.title), element('span', '', [`@${tile.username}`, tile.subscribers ? compact(tile.subscribers, lang) : ''].filter(Boolean).join(' · ')));
  head.append(names);

  const kinds = Object.entries(tile.shares).filter(([, share]) => share > 0).sort((a, b) => b[1] - a[1]);
  const [topKind, topShare] = kinds.find(([kind]) => kind !== 'media') ?? kinds[0];
  const top = element('div', 'channel-top');
  const share = element('b', '', percent(topShare));
  share.style.color = KIND_COLORS[topKind];
  top.append(share, element('span', '', t.kinds[topKind]));

  const mix = element('div', 'channel-mix');
  for (const [kind, part] of kinds) {
    const piece = element('i');
    piece.style.flexGrow = part;
    piece.style.background = KIND_COLORS[kind];
    piece.title = `${t.kinds[kind]} ${percent(part)}`;
    mix.append(piece);
  }

  const signals = [`${t.metrics.ad} ${percent(tile.shares.ad)}`, `${t.metrics.clickbait} ${percent(tile.clickbaitShare)}`, `${t.home.pressure} ${percent(tile.pressureShare)}`];
  link.append(head, top, mix, element('span', 'channel-signals', signals.join(' · ')));
  return link;
}

function showHome() {
  $('channels').replaceChildren(...home.tiles.map(channelTile));
  $('home').hidden = false;
  const { channels, posts } = home.totals;
  $('totals').textContent = t.home.totals(number(channels, lang), number(posts, lang));
  $('totals').hidden = channels < TOTALS_FROM;
}

function showSample() {
  $('sample').href = `/c/${sample.info.username}`;
  $('sample-tag').textContent = t.sampleTag(sample.info.username);
  $('sample-card').innerHTML = renderCard(sample, t, SITE); // an SVG built by card.js, every text node escaped there
  $('sample').hidden = false;
}

function buildTiles() {
  $('tiles').replaceChildren(
    ...JUDGED_KINDS.map((kind) => {
      const tile = element('div', 'tile');
      tile.dataset.kind = kind;
      tile.style.setProperty('--color', KIND_COLORS[kind]);
      tile.append(element('span', 'tile-name', t.kinds[kind]), element('b', '', '0'), element('span', 'tile-share', '0%'));
      return tile;
    }),
  );
}

function updateTiles(data) {
  const judged = Math.max(1, data.done);
  for (const tile of $('tiles').children) {
    const kind = tile.dataset.kind;
    const count = data.kinds[kind] ?? 0;
    const [, value, share] = tile.children;
    share.textContent = percent(count / judged);
    tile.style.setProperty('--share', `${(count / judged) * 100}%`);
    if (count !== (run.kinds[kind] ?? 0)) {
      value.textContent = number(count, lang);
      tile.classList.add('lit');
      tile.classList.remove('hit');
      void tile.offsetWidth; // restart the flash
      tile.classList.add('hit');
    }
  }
  run.kinds = { ...data.kinds }; // a copy: the run keeps counting in the original
}

function updateSpark(data) {
  const now = performance.now();
  if (run.sparkAt && data.answers > run.sparkAnswers) {
    run.spark.push((data.answers - run.sparkAnswers) / ((now - run.sparkAt) / 1000));
    if (run.spark.length > SPARK_BARS) run.spark.shift();
    const top = Math.max(...run.spark);
    $('spark').replaceChildren(
      ...run.spark.map((value) => {
        const bar = element('i');
        bar.style.height = `${Math.max(4, (value / top) * 100)}%`;
        return bar;
      }),
    );
  }
  run.sparkAt = now;
  run.sparkAnswers = data.answers;
}

function updateFeed(data) {
  $('feed-count').textContent = t.feedCount(data.working);
  const now = performance.now();
  if (now - run.feedAt < FEED_EVERY_MS && data.working) return;
  run.feedAt = now;
  const feed = $('feed');
  if (!data.feed.length) return feed.replaceChildren(element('div', 'feed-empty', data.pagesTotal && data.pagesDone === data.pagesTotal ? t.feed.allDone : t.feed.reading));
  // Rows of posts that are still in flight stay where they are: only new ones animate in.
  const rows = new Map([...feed.querySelectorAll('.post')].map((row) => [row.dataset.id, row]));
  feed.replaceChildren(
    ...data.feed.map((post) => {
      const known = rows.get(String(post.id));
      if (known) return known;
      const row = element('div', 'post');
      row.dataset.id = post.id;
      const meta = element('div', 'post-meta', `#${post.id} · ${shortDay(post.date)}`);
      meta.append(element('em', '', 'Jev'));
      row.append(meta, element('p', '', post.text));
      return row;
    }),
  );
}

function probability(label, value, color) {
  const row = element('div', 'prob');
  const track = element('i');
  const fill = element('u');
  fill.style.width = `${value * 100}%`;
  if (color) fill.style.background = color;
  track.append(fill);
  row.append(element('span', '', label), track, element('b', '', percent(value)));
  return row;
}

function updateLast(data) {
  $('answers-count').textContent = t.answersCount(number(data.answers, lang));
  const { last } = data;
  const now = performance.now();
  if (!last || last.id === run.lastId || now - run.lastAt < LAST_EVERY_MS) return;
  run.lastAt = now;
  run.lastId = last.id;

  const chip = element('span', 'chip', t.kinds[last.kind] ?? last.kind);
  chip.style.setProperty('--color', KIND_COLORS[last.kind] ?? KIND_COLORS.other);
  const meta = element('div', 'last-meta', `#${last.id} · ${shortDay(last.date)}`);
  meta.append(chip);
  const body = element('div');
  body.append(meta, element('p', 'last-text', last.text));

  const probs = element('div', 'probs');
  probs.append(
    probability(t.last.confidence, last.kindConfidence, KIND_COLORS[last.kind]),
    probability(t.metrics.ad, last.isAd),
    probability(t.metrics.clickbait, last.clickbait),
    probability(t.metrics.pressure, last.pressure),
    element('p', 'mono', last.reused ? t.last.reused : `${last.ms} ${t.kpi.ms} · $${last.usd.toFixed(6)}`),
  );
  $('last').replaceChildren(body, probs);
}

function onTick(data) {
  if (data.answers || data.reused) $('stage').textContent = t.judging;
  $('c-done').textContent = number(data.done, lang);
  $('bar').style.width = `${(data.pagesDone / Math.max(1, data.pagesTotal)) * 100}%`;
  const media = data.kinds.media ?? 0;
  $('c-split').textContent = t.split(number(data.answers, lang), number(media, lang), data.reused);
  $('c-pages').textContent = data.pagesTotal ? t.pages(data.pagesDone, data.pagesTotal) : '';
  $('c-media').textContent = number(media, lang);

  $('c-rate').textContent = data.rate.toFixed(1);
  $('c-working').textContent = t.working(data.working);
  $('c-median').textContent = data.latency.median ?? '—';
  $('c-p95').textContent = data.latency.p95 == null ? '' : t.p95(data.latency.p95);
  $('c-cost').textContent = `$${data.usd.toFixed(4)}`;
  $('c-tokens').textContent = t.tokensNote(number(data.tokens, lang), data.seconds.toFixed(0));

  for (const [signal, share] of Object.entries({ ad: data.adShare, clickbait: data.clickbaitShare, pressure: data.pressureShare })) {
    const row = document.querySelector(`[data-signal="${signal}"]`);
    row.querySelector('u').style.width = `${share * 100}%`;
    row.querySelector('b').textContent = percent(share);
  }

  updateTiles(data);
  updateSpark(data);
  updateFeed(data);
  updateLast(data);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null);

async function api(path, signal) {
  const response = await fetch(path, { signal });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error?.message ?? response.statusText), { code: body.error?.code ?? 'error' });
  return body;
}

/** One preview page: the Worker reads it, judges its posts and streams a JSON line per event. Resolves with the last line. */
async function readPage(channel, before, signal, onLine) {
  const response = await fetch(`/api/page?${new URLSearchParams({ channel, before })}`, { signal });
  if (!response.ok) throw Object.assign(new Error(`page ${before}: ${response.status}`), { code: response.status === 409 ? 'error' : 'retry' });
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let rest = '';
  let last = null;
  for (;;) {
    const { value, done } = await reader.read();
    const lines = (rest + (value ?? '')).split('\n');
    rest = done ? '' : lines.pop();
    for (const line of lines) if (line) onLine((last = JSON.parse(line)));
    if (done) return last;
  }
}

/** What the dashboard shows, from what the pages have said so far. */
function snapshot(state) {
  const sorted = state.latencies.toSorted((a, b) => a - b);
  const judged = Math.max(1, state.answers + state.reused);
  const now = performance.now();
  return {
    done: state.done,
    pagesDone: state.pagesDone,
    pagesTotal: state.pagesTotal,
    kinds: state.kinds,
    adShare: (state.kinds.ad ?? 0) / Math.max(1, state.done),
    clickbaitShare: state.clickbait / judged,
    pressureShare: state.pressure / judged,
    usd: state.usd,
    tokens: state.tokens,
    seconds: (now - state.startedAt) / 1000,
    answers: state.answers,
    reused: state.reused,
    rate: state.judgingSince ? state.answers / Math.max(0.5, (now - state.judgingSince) / 1000) : 0,
    latency: { median: quantile(sorted, 0.5), p95: quantile(sorted, 0.95) },
    working: Math.min(state.inflight.size, state.active * CONNECTIONS_PER_PAGE),
    feed: [...state.inflight.values()].slice(0, FEED_SIZE),
    last: state.last,
  };
}

function takeLine(state, line) {
  if (line.type === 'media') {
    state.done += line.count;
    state.kinds.media = (state.kinds.media ?? 0) + line.count;
  } else if (line.type === 'posts') {
    for (const post of line.posts) if (!state.seen.has(post.id)) state.inflight.set(post.id, post);
    state.judgingSince ??= performance.now();
  } else if (line.type === 'answer') {
    state.inflight.delete(line.id);
    if (state.seen.has(line.id)) return; // sampled pages may overlap
    state.seen.add(line.id);
    state.done += 1;
    state.kinds[line.kind] = (state.kinds[line.kind] ?? 0) + 1;
    state.clickbait += line.isClickbait;
    state.pressure += line.isPressure;
    if (line.reused) state.reused += 1;
    else {
      state.answers += 1;
      state.latencies.push(line.ms);
      state.usd += line.usd;
      state.tokens += line.tokens;
    }
    if (!line.reused || !state.last) state.last = line;
  } else if (line.type === 'fatal') {
    throw Object.assign(new Error(line.message), { code: line.code });
  }
}

/**
 * The browser drives the run: it asks for a plan, then for the pages of that plan, a few at a time,
 * then for the sum. A page the Worker could not finish (throttling) goes back to the end of the line,
 * and the run slows down by one page.
 */
async function start(channel, { fresh = false } = {}) {
  stop();
  const abort = (aborter = new AbortController());
  card = null;
  run = { kinds: {}, spark: [], sparkAt: 0, sparkAnswers: 0, feedAt: 0, lastAt: 0, lastId: null };
  const state = { startedAt: performance.now(), judgingSince: null, done: 0, answers: 0, reused: 0, clickbait: 0, pressure: 0, usd: 0, tokens: 0, kinds: {}, latencies: [], inflight: new Map(), seen: new Set(), last: null, pagesDone: 0, pagesTotal: 0, active: 0 };
  $('problem').hidden = true;
  $('stage').textContent = t.reading;
  $('run-channel').textContent = `t.me/s/${channel.replace(/^.*[/@]/, '')}`;
  $('last').replaceChildren(element('p', 'dim', t.last.waiting));
  $('spark').replaceChildren();
  buildTiles();
  onTick(snapshot(state));
  show('run');
  const clock = setInterval(() => onTick(snapshot(state)), TICK_MS);

  try {
    const query = new URLSearchParams({ channel });
    if (fresh) query.set('fresh', '1');
    const limit = new URLSearchParams(location.search).get('limit'); // ?limit=50 for a cheap trial run
    if (limit) query.set('limit', limit);
    const plan = await api(`/api/plan?${query}`, abort.signal);
    const name = plan.card?.info.username ?? plan.info.username;
    if (location.pathname !== `/c/${name}`) history.pushState(null, '', `/c/${name}${location.search}`);
    if (plan.card) return showResult(plan.card);

    const queue = plan.befores.map((before) => ({ before, tries: 0 }));
    state.pagesTotal = queue.length;
    if (plan.model) $('request-model').textContent = plan.model;
    const lanesAtStart = Math.min(PAGES_AT_ONCE, plan.pagesAtOnce ?? PAGES_AT_ONCE);
    let lanes = lanesAtStart;
    const lane = async (index) => {
      while (queue.length) {
        if (index >= lanes) return; // the run was slowed down: this lane retires
        const page = queue.shift();
        state.active += 1;
        const end = await readPage(name, page.before, abort.signal, (line) => takeLine(state, line)).catch((error) => {
          if (error.code !== 'retry') throw error;
          return { retry: true };
        });
        state.active -= 1;
        if (end?.retry && ++page.tries < PAGE_TRIES) {
          queue.push(page);
          lanes = Math.max(1, lanes - 1);
          await sleep(1500 * page.tries);
        } else state.pagesDone += 1;
      }
    };
    await Promise.all(Array.from({ length: lanesAtStart }, (_, index) => lane(index)));

    onTick(snapshot(state));
    const { card: finished } = await api(`/api/finish?${new URLSearchParams({ channel: name })}`, abort.signal);
    await sleep(DONE_PAUSE_MS);
    if (!abort.signal.aborted) showResult(finished);
  } catch (error) {
    if (!abort.signal.aborted) fail(error.code ?? 'error');
  } finally {
    clearInterval(clock);
  }
}

/**
 * "How this was counted": what was read and judged for this very card stays open; the questions Jev
 * was asked, the ten kinds and the limits of the numbers unfold, because together they are a page of text.
 */
function methodBlock({ stats, meta }) {
  const m = t.method;
  const count = (value) => number(value, lang);
  const facts = [
    m.read(count(meta.posts), meta.posts, meta.months),
    meta.sampled ? m.sampled(compact(meta.estimatedTotal, lang)) : '',
    m.judged(count(stats.judged)),
    stats.kinds.media ? m.media(count(stats.kinds.media)) : '',
    meta.failed ? m.failed(count(meta.failed)) : '',
  ];
  const run = m.run(shortDay(meta.createdAt), meta.seconds.toFixed(0), count(meta.tokens), money(meta.usd), meta.model);

  // How many posts of this channel each question caught: a share of a few hundred posts reads better as a count.
  const caught = {
    ad: [stats.kinds.ad, stats.total],
    clickbait: [Math.round(stats.clickbaitShare * stats.judged), stats.judged],
    pressure: [Math.round(stats.pressureShare * stats.judged), stats.judged],
  };
  const questions = element('dl', 'method-list');
  for (const { key, name, text } of m.questions) {
    const here = caught[key] ? ` ${m.here(count(caught[key][0]), count(caught[key][1]))}` : '';
    questions.append(element('dt', '', name), element('dd', '', text + here));
  }
  const kinds = element('dl', 'method-list method-kinds');
  for (const [kind, note] of Object.entries(m.kindNotes)) {
    const term = element('dt', '', t.kinds[kind]);
    term.style.setProperty('--kind', KIND_COLORS[kind]);
    kinds.append(term, element('dd', '', note));
  }
  const limits = element('ul', 'method-limits');
  for (const limit of [...m.limits, ...(meta.sampled ? [m.sampledLimit] : [])]) limits.append(element('li', '', limit));

  const more = element('details', 'method-more');
  more.append(element('summary', '', m.more), element('h4', '', m.questionsTitle), questions, element('h4', '', m.kindsTitle), kinds, element('h4', '', m.limitsTitle), limits);
  return [element('p', 'method', facts.filter(Boolean).join(' ')), element('p', 'method method-run', run), more];
}

function exampleRow(label, example) {
  if (!example) return null;
  const row = element('a', 'example');
  row.href = example.url;
  row.target = '_blank';
  row.rel = 'noopener';
  const head = element('div', 'example-head');
  head.append(element('span', '', label), element('b', '', percent(example.probability)));
  row.append(head, element('p', '', example.text));
  return row;
}

function renderReceipt({ meta }) {
  const cell = (value, label) => {
    const box = element('div');
    box.append(element('b', '', value), element('span', '', label));
    return box;
  };
  $('receipt').replaceChildren(
    cell(number(meta.posts, lang), t.receipt.posts(meta.posts)),
    cell(meta.seconds.toFixed(0), t.receipt.seconds(Math.round(meta.seconds))),
    cell(money(meta.usd), t.receipt.cost),
    cell(`$${(meta.usd / Math.max(1, meta.judged)).toFixed(5)}`, t.receipt.perPost),
  );
}

function renderDetails(data) {
  const { stats, meta } = data;
  const details = $('details');
  details.replaceChildren();

  const examples = ['clickbait', 'pressure', 'ad'].map((key) => exampleRow(t.examples[key], stats.examples[key])).filter(Boolean);
  if (examples.length) details.append(element('h3', '', t.examples.title), ...examples);

  // Views per kind, as a distance from the channel's own median: absolute bars of 4.8K and 4.9K look the same and say nothing.
  const rows = rankedKinds(stats).filter(({ kind }) => stats.viewsByKind[kind] != null && stats.kinds[kind] >= VIEWS_MIN_POSTS);
  if (rows.length && stats.medianViews) {
    const gap = (kind) => stats.viewsByKind[kind] / stats.medianViews - 1;
    const scale = Math.max(VIEWS_SCALE, ...rows.map(({ kind }) => Math.abs(gap(kind)))); // a 3% gap must not fill the bar
    const table = element('div', 'views');
    const head = element('div', 'views-row views-head');
    head.append(element('span'), element('span', '', t.views.cols.posts), element('span', '', t.views.cols.diff), element('span'), element('span', '', t.views.cols.median));
    table.append(head);
    for (const { kind } of rows) {
      const row = element('div', 'views-row');
      const bar = element('i');
      const piece = element('u');
      piece.style.width = `${(Math.abs(gap(kind)) / scale) * 50}%`;
      piece.style[gap(kind) < 0 ? 'right' : 'left'] = '50%';
      piece.style.background = KIND_COLORS[kind];
      bar.append(piece);
      const percentGap = Math.round(gap(kind) * 100);
      row.append(element('span', '', t.kinds[kind]), element('em', '', number(stats.kinds[kind], lang)), bar, element('em', '', `${percentGap > 0 ? '+' : percentGap < 0 ? '−' : ''}${Math.abs(percentGap)}%`), element('b', '', compact(stats.viewsByKind[kind], lang)));
      table.append(row);
    }
    const hidden = rankedKinds(stats).length > rows.length;
    details.append(
      element('h3', '', t.views.title),
      element('p', 'method', t.views.baseline(compact(stats.medianViews, lang), number(stats.total, lang))),
      table,
      ...(hidden ? [element('p', 'method views-note', t.views.few(VIEWS_MIN_POSTS))] : []),
    );
  }

  details.append(element('h3', '', t.method.title), ...methodBlock(data));
}

function showResult(data) {
  card = data;
  $('card').innerHTML = renderCard(data, t, SITE); // an SVG built by card.js, every text node escaped there
  $('cached').hidden = !data.cached;
  renderReceipt(data);
  renderDetails(data);
  show('result');
  scrollTo(0, 0);
}

async function download() {
  const blob = await cardToPng(renderCard(card, t, SITE));
  const link = element('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${card.info.username}-wrapped.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function copyLink() {
  await navigator.clipboard.writeText(`${location.origin}/c/${card.info.username}`);
  $('copy').textContent = t.copied;
  setTimeout(() => ($('copy').textContent = t.copyLink), 1500);
}

async function route() {
  const name = location.pathname.match(/^\/c\/([^/]+)/)?.[1];
  if (!name) return stop(), (card = null), show('ask');
  const response = await fetch(`/api/card/${encodeURIComponent(name)}`);
  if (response.ok) showResult(await response.json());
  else start(name);
}

$('form').addEventListener('submit', (event) => {
  event.preventDefault();
  start($('channel').value.trim());
});
$('lang').addEventListener('click', () => {
  lang = lang === 'uk' ? 'en' : 'uk';
  t = DICTIONARIES[lang];
  try {
    localStorage.setItem('jev-wrapped.lang', lang);
  } catch {}
  applyTexts();
});
$('download').addEventListener('click', download);
$('copy').addEventListener('click', copyLink);
$('again').addEventListener('click', () => start(card.info.username, { fresh: true }));
window.addEventListener('popstate', route);

applyTexts();
route();
loadHome();
