// One post, one request to Jev. Two ways in: TypeSafe's own API and OpenRouter's Decisions API.
// Both take the same { state, questions } and answer in the same shape; they differ in the address,
// the model id and in who reports the price.
import { buildRequest } from './questions.js';

const TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 4;
/** TypeSafe's list price per input token; its API reports tokens and no cost, output is free. */
const TYPESAFE_USD_PER_TOKEN = 0.042 / 1e6;

export const PROVIDERS = {
  typesafe: {
    label: 'TypeSafe',
    keyName: 'TYPESAFE_API_KEY',
    url: 'https://api.typesafe.ai/v1/systemone',
    model: 'jev-1.13.0',
    // 1,200 requests a minute for the whole key: fewer pages at a time than OpenRouter allows.
    pagesAtOnce: 2,
    usd: (usage) => (usage?.input_tokens ?? 0) * TYPESAFE_USD_PER_TOKEN,
  },
  openrouter: {
    label: 'OpenRouter',
    keyName: 'OPENROUTER_API_KEY',
    url: 'https://openrouter.ai/api/alpha/decisions',
    model: 'typesafe/jev-1.13',
    pagesAtOnce: 4,
    usd: (usage) => usage?.cost ?? 0,
  },
};

/**
 * Which way to Jev this deployment uses: JEV_PROVIDER when it is set, otherwise the first provider
 * that has a key, TypeSafe first. Returns the provider with its name and apiKey, or null with no key at all.
 */
export function pickProvider(env) {
  const wanted = String(env.JEV_PROVIDER ?? '').trim().toLowerCase();
  const names = PROVIDERS[wanted] ? [wanted] : Object.keys(PROVIDERS);
  const name = names.find((candidate) => env[PROVIDERS[candidate].keyName]);
  return name ? { name, ...PROVIDERS[name], apiKey: env[PROVIDERS[name].keyName] } : null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One post → { kind, kindConfidence, isAd, clickbait, pressure, tokens, usd, ms }; ms is the answering
 * attempt alone, without retries. `retries` is a shared allowance, { left }: a Worker invocation may
 * make only so many outgoing requests, so all posts of a page draw their retries from one pot.
 */
export async function classifyPost(provider, channelTitle, post, retries = { left: Infinity }) {
  if (!provider?.apiKey) throw Object.assign(new Error('no Jev API key is set'), { code: 'no_key' });

  const { state, questions } = buildRequest(channelTitle, post);
  let lastError;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt) {
      if (retries.left <= 0) break;
      retries.left -= 1;
      // Both endpoints throttle bursts: back off with jitter, so throttled requests do not return together.
      await sleep(250 * 2 ** attempt * (0.75 + Math.random() / 2));
    }
    try {
      const sentAt = performance.now();
      const response = await fetch(provider.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: provider.model, state, questions }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 429 || response.status >= 500) {
        lastError = Object.assign(new Error(`${provider.label} ${response.status}: ${problem(body) ?? 'busy'}`), { throttled: response.status === 429 });
        continue;
      }
      if (!response.ok) throw Object.assign(new Error(`${provider.label} ${response.status}: ${problem(body) ?? 'request failed'}`), { fatal: true });
      const answers = body.answers ?? {};
      return {
        kind: answers.kind?.choice ?? 'other',
        kindConfidence: answers.kind?.confidence ?? 0,
        isAd: answers.is_ad?.noul ?? 0,
        clickbait: answers.clickbait?.noul ?? 0,
        pressure: answers.pressure?.noul ?? 0,
        tokens: body.usage?.input_tokens ?? 0,
        usd: provider.usd(body.usage),
        ms: Math.round(performance.now() - sentAt),
        model: body.model ?? provider.model,
      };
    } catch (error) {
      if (error.fatal) throw error;
      lastError = error; // network hiccup or timeout: try again
    }
  }
  throw lastError;
}

/** The error text of either API: OpenRouter nests it in error.message, TypeSafe answers with detail or message. */
function problem(body) {
  const text = body.error?.message ?? body.error ?? body.detail ?? body.message;
  return text && (typeof text === 'string' ? text : JSON.stringify(text)).slice(0, 200);
}

/** Runs worker(item) over items, at most `limit` at a time; resolves when all have settled. Errors go to onError. */
export async function eachLimit(items, limit, worker, onError) {
  const queue = [...items];
  const lane = async () => {
    while (queue.length) {
      const item = queue.shift();
      await worker(item).catch((error) => onError?.(item, error));
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, lane));
}
