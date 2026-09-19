import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { classifyPost, pickProvider } from '../shared/jev.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const post = { id: 1, text: 'Знижка 50% за промокодом JEV', media: null, link: null, forwardedFrom: null };
const answers = { kind: { choice: 'ad', confidence: 0.9 }, is_ad: { noul: 0.95 }, clickbait: { noul: 0.2 }, pressure: { noul: 0.05 } };

const answerWith = (body, status = 200) => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const reply = typeof body === 'function' ? body(calls.length) : { status, body };
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  };
  return calls;
};

test('TypeSafe is picked when both keys are present, and JEV_PROVIDER overrides that', () => {
  const env = { TYPESAFE_API_KEY: 'ts', OPENROUTER_API_KEY: 'or' };
  assert.equal(pickProvider(env).name, 'typesafe');
  assert.equal(pickProvider({ ...env, JEV_PROVIDER: 'OpenRouter' }).name, 'openrouter');
  assert.equal(pickProvider({ OPENROUTER_API_KEY: 'or' }).name, 'openrouter');
  assert.equal(pickProvider({ OPENROUTER_API_KEY: 'or', JEV_PROVIDER: 'typesafe' }), null);
  assert.equal(pickProvider({}), null);
});

test('TypeSafe: own address and model, cost from tokens at the list price', async () => {
  const calls = answerWith({ model: 'jev-1.13.0', answers, usage: { input_tokens: 1000, output_tokens: 40 } });
  const answer = await classifyPost(pickProvider({ TYPESAFE_API_KEY: 'ts' }), 'Channel', post);
  assert.equal(calls[0].url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(calls[0].headers.Authorization, 'Bearer ts');
  assert.equal(calls[0].body.model, 'jev-1.13.0');
  assert.deepEqual(Object.keys(calls[0].body.questions), ['kind', 'is_ad', 'clickbait', 'pressure']);
  assert.equal(answer.kind, 'ad');
  assert.equal(answer.isAd, 0.95);
  assert.equal(answer.tokens, 1000);
  assert.ok(Math.abs(answer.usd - 0.000042) < 1e-12);
});

test('OpenRouter: the cost is the one it reports', async () => {
  const calls = answerWith({ model: 'typesafe/jev-1.13', answers, usage: { input_tokens: 1000, cost: 0.00005 } });
  const answer = await classifyPost(pickProvider({ OPENROUTER_API_KEY: 'or' }), 'Channel', post);
  assert.equal(calls[0].url, 'https://openrouter.ai/api/alpha/decisions');
  assert.equal(calls[0].body.model, 'typesafe/jev-1.13');
  assert.equal(answer.usd, 0.00005);
});

test('429 and 529 are retried from the shared allowance; 401 is fatal at once', async () => {
  const retries = { left: 5 };
  const calls = answerWith((n) => (n === 1 ? { status: 429, body: {} } : n === 2 ? { status: 529, body: {} } : { status: 200, body: { answers, usage: { input_tokens: 10 } } }));
  const answer = await classifyPost(pickProvider({ TYPESAFE_API_KEY: 'ts' }), 'Channel', post, retries);
  assert.equal(calls.length, 3);
  assert.equal(retries.left, 3);
  assert.equal(answer.kind, 'ad');

  const denied = answerWith({ detail: 'Invalid API key' }, 401);
  await assert.rejects(classifyPost(pickProvider({ TYPESAFE_API_KEY: 'bad' }), 'Channel', post), (error) => error.fatal && /TypeSafe 401: Invalid API key/.test(error.message));
  assert.equal(denied.length, 1);

  await assert.rejects(classifyPost(null, 'Channel', post), { code: 'no_key' });
});
