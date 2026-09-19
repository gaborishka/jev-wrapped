import assert from 'node:assert/strict';
import { test } from 'node:test';

import { eachLimit } from '../shared/jev.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('never runs more than the limit at once and reaches every item', async () => {
  let running = 0;
  let peak = 0;
  const seen = [];
  await eachLimit([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
    peak = Math.max(peak, ++running);
    await sleep(5);
    running -= 1;
    seen.push(item);
  });
  assert.equal(peak, 3);
  assert.deepEqual(seen.sort(), [1, 2, 3, 4, 5, 6, 7]);
});

test('a failed item is reported and does not stop the rest', async () => {
  const failed = [];
  const done = [];
  await eachLimit([1, 2, 3], 2, async (item) => (item === 2 ? Promise.reject(new Error('no')) : done.push(item)), (item) => failed.push(item));
  assert.deepEqual([failed, done.sort()], [[2], [1, 3]]);
});
