import assert from 'node:assert/strict';
import { test } from 'node:test';

import { aggregate, effectiveKind, lastMonths, median } from '../shared/aggregate.js';

const post = (id, date, kind, extra = {}) => ({ id, url: `https://t.me/demo/${id}`, date, text: `post ${id}`, views: 100 * id, kind, isAd: 0.02, clickbait: 0.1, pressure: 0.1, ...extra });

test('the two ad questions have to agree; no text means media only', () => {
  const kindOf = (kind, isAd) => effectiveKind(post(1, '2026-09-01', kind, { isAd }));
  assert.equal(kindOf('news', 0.9), 'ad'); // sure enough on its own
  assert.equal(kindOf('news', 0.6), 'news');
  assert.equal(kindOf('ad', 0.5), 'ad'); // both questions point at an ad
  assert.equal(kindOf('ad', 0.2), 'self_promo'); // promotion, but not a paid placement
  assert.equal(effectiveKind({ id: 2, date: '2026-09-01', text: '' }), 'media');
});

test('median of views ignores posts without a view count', () => {
  assert.equal(median([3, null, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test('months run back from the newest post, across a year boundary', () => {
  assert.deepEqual(lastMonths('2026-02-10T00:00:00+00:00', 4), ['2025-11', '2025-12', '2026-01', '2026-02']);
});

test('shares, yes/no shares and the monthly mix', () => {
  const stats = aggregate(
    [
      post(1, '2026-08-01T00:00:00+00:00', 'news'),
      post(2, '2026-08-15T00:00:00+00:00', 'news', { clickbait: 0.8 }),
      post(3, '2026-09-01T00:00:00+00:00', 'joke', { isAd: 0.8 }),
      { id: 4, url: 'u', date: '2026-09-02T00:00:00+00:00', text: '', views: 50 },
    ],
    { months: 2 },
  );
  assert.equal(stats.total, 4);
  assert.equal(stats.judged, 3);
  assert.deepEqual([stats.kinds.news, stats.kinds.ad, stats.kinds.joke, stats.kinds.media], [2, 1, 0, 1]);
  assert.equal(stats.shares.news, 0.5);
  assert.equal(stats.clickbaitShare, 1 / 3); // of the posts that were judged
  assert.deepEqual(stats.trend.map((month) => [month.month, month.total, month.kinds.news]), [['2026-08', 2, 2], ['2026-09', 2, 0]]);
  assert.equal(stats.trend[1].adShare, 0.5);
  assert.equal(stats.examples.clickbait.url, 'https://t.me/demo/2');
  assert.equal(stats.examples.pressure, null); // nothing reached 50%
  assert.equal(stats.viewsByKind.news, 150);
});

test('posts per week uses the estimated total when the posts are a sample', () => {
  const posts = [post(1, '2026-09-01T00:00:00+00:00', 'news'), post(2, '2026-09-15T00:00:00+00:00', 'news')];
  assert.equal(aggregate(posts).postsPerWeek, 1);
  assert.equal(aggregate(posts, { estimatedTotal: 200 }).postsPerWeek, 100);
});

test('no posts gives zeros, not NaN', () => {
  const stats = aggregate([]);
  assert.deepEqual([stats.total, stats.shares.news, stats.clickbaitShare, stats.postsPerWeek, stats.trend.length], [0, 0, 0, 0, 0]);
});
