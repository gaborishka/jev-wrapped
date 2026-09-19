import assert from 'node:assert/strict';
import { test } from 'node:test';

import { rankedKinds, renderCard } from '../public/card.js';
import { DICTIONARIES, percent } from '../public/i18n.js';
import { aggregate } from '../shared/aggregate.js';

const posts = [
  { id: 1, url: 'u1', date: '2026-08-01T00:00:00+00:00', text: 'a', views: 10, kind: 'news', isAd: 0, clickbait: 0, pressure: 0 },
  { id: 2, url: 'u2', date: '2026-09-01T00:00:00+00:00', text: 'b', views: 20, kind: 'joke', isAd: 0, clickbait: 0.9, pressure: 0 },
  { id: 3, url: 'u3', date: '2026-09-02T00:00:00+00:00', text: 'c', views: 30, kind: 'news', isAd: 0, clickbait: 0, pressure: 0 },
];
const card = (info) => ({
  info: { username: 'demo', title: 'Demo', subscribers: 1200, avatar: null, ...info },
  stats: aggregate(posts),
  meta: { posts: 3, seconds: 2.4, usd: 0.0001, months: 12, maxPosts: 1500, sampled: false, estimatedTotal: 3 },
});

test('percent keeps small shares visible', () => {
  assert.deepEqual([0, 0.004, 0.015, 0.5, 1].map(percent), ['0%', '<1%', '2%', '50%', '100%']);
});

test('kinds are ranked by share and absent ones are left out', () => {
  assert.deepEqual(rankedKinds(aggregate(posts)).map(({ kind }) => kind), ['news', 'joke']);
});

test('a channel title cannot inject markup into the card', () => {
  const svg = renderCard(card({ title: '</text><script>alert(1)</script>' }), DICTIONARIES.en);
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('&lt;script&gt;'));
});

test('only an inlined image is used as the avatar', () => {
  assert.ok(!renderCard(card({ avatar: 'https://evil.example/x.png' }), DICTIONARIES.en).includes('<image'));
  assert.ok(!renderCard(card({ avatar: 'data:image/svg+xml;base64,AAAA' }), DICTIONARIES.en).includes('<image'));
  assert.ok(renderCard(card({ avatar: 'data:image/jpeg;base64,AAAA' }), DICTIONARIES.en).includes('<image'));
});

test('both languages render every kind that the legend can show', () => {
  for (const t of Object.values(DICTIONARIES)) {
    const svg = renderCard(card(), t);
    for (const kind of ['news', 'joke', 'ad', 'fundraising']) assert.ok(svg.includes(t.kinds[kind]), `${t.lang}: ${kind}`);
    assert.ok(!svg.includes('undefined') && !svg.includes('NaN'), t.lang);
  }
});
