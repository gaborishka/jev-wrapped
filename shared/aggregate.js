// Turns per-post answers into the numbers on the card. Pure functions, shared by server and tests.
import { KINDS } from './questions.js';

/** A yes/no probability counts as "yes" from here up. */
export const YES = 0.5;

/** Posts with no text (a bare photo, video or sticker) are not sent to Jev. */
export const MEDIA_ONLY = 'media';

export const KIND_ORDER = [...Object.keys(KINDS), MEDIA_ONLY];

/** "This is a paid ad" on its own counts from here; the model is this sure about real ad posts. */
export const AD_ALONE = 0.7;
/** …and from here when the kind question also said "ad". */
export const AD_WITH_KIND = 0.4;

/**
 * The kind a post is counted under. Two questions look at advertising, and they have to agree:
 * a confident "paid ad" overrides the topic, while a bare kind of "ad" that the yes/no question
 * does not back up is promotion of the author's own things, not a paid placement.
 */
export function effectiveKind(post) {
  if (!post.kind) return MEDIA_ONLY;
  if (post.isAd >= AD_ALONE) return 'ad';
  if (post.kind === 'ad') return post.isAd >= AD_WITH_KIND ? 'ad' : 'self_promo';
  return post.kind;
}

const share = (part, whole) => (whole ? part / whole : 0);

export function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function tally(posts) {
  const kinds = Object.fromEntries(KIND_ORDER.map((kind) => [kind, 0]));
  let clickbait = 0;
  let pressure = 0;
  let judged = 0;
  for (const post of posts) {
    kinds[effectiveKind(post)] += 1;
    if (!post.kind) continue;
    judged += 1;
    if (post.clickbait >= YES) clickbait += 1;
    if (post.pressure >= YES) pressure += 1;
  }
  return { total: posts.length, judged, kinds, clickbait, pressure };
}

const monthKey = (date) => date.slice(0, 7);

/** The `count` calendar months ending with the month of `to`, oldest first: ["2025-10", …, "2026-09"]. */
export function lastMonths(to, count) {
  const end = new Date(to);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (count - 1 - i), 1));
    return date.toISOString().slice(0, 7);
  });
}

const snippet = (post) => ({ url: post.url, date: post.date, views: post.views, text: post.text.replace(/\s+/g, ' ').slice(0, 160) });

/**
 * posts: [{ id, url, date, text, views, kind?, isAd, clickbait, pressure }], any order.
 * estimatedTotal: how many posts the period really holds when `posts` is only a sample of it.
 * Returns everything the card and the page show.
 */
export function aggregate(posts, { months = 12, estimatedTotal } = {}) {
  const sorted = [...posts].sort((a, b) => a.date.localeCompare(b.date));
  const all = tally(sorted);
  const from = sorted[0]?.date ?? null;
  const to = sorted.at(-1)?.date ?? null;
  const days = from ? Math.max(1, (new Date(to) - new Date(from)) / 86_400_000) : 0;

  const byMonth = Map.groupBy(sorted, (post) => monthKey(post.date));
  const trend = to
    ? lastMonths(to, months).map((month) => {
        const counted = tally(byMonth.get(month) ?? []);
        return {
          month,
          total: counted.total,
          kinds: counted.kinds,
          adShare: share(counted.kinds.ad, counted.total),
          clickbaitShare: share(counted.clickbait, counted.judged),
        };
      })
    : [];

  const viewsByKind = {};
  for (const [kind, group] of Map.groupBy(sorted, effectiveKind)) viewsByKind[kind] = median(group.map((post) => post.views));

  const judged = sorted.filter((post) => post.kind);
  // One post is shown once: if it tops two lists, the second list gets its runner-up.
  const shown = new Set();
  const strongest = (field, from = YES) => {
    const best = judged.reduce((top, post) => (!shown.has(post.id) && post[field] > (top?.[field] ?? from) ? post : top), null);
    if (best) shown.add(best.id);
    return best ? { ...snippet(best), probability: best[field] } : null;
  };

  return {
    total: all.total,
    judged: all.judged,
    from,
    to,
    postsPerWeek: days ? ((estimatedTotal ?? all.total) / days) * 7 : 0,
    kinds: all.kinds,
    shares: Object.fromEntries(KIND_ORDER.map((kind) => [kind, share(all.kinds[kind], all.total)])),
    clickbaitShare: share(all.clickbait, all.judged),
    pressureShare: share(all.pressure, all.judged),
    medianViews: median(sorted.map((post) => post.views)),
    viewsByKind,
    trend,
    examples: { clickbait: strongest('clickbait'), pressure: strongest('pressure'), ad: strongest('isAd', AD_ALONE) },
  };
}
