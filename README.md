# Jev Wrapped

Live at [wrapped.ivanhabor.com](https://wrapped.ivanhabor.com), no sign-in.

Paste the name of a public Telegram channel and get a card: what the channel posts, how much of it is ads, clickbait and emotional pressure, and how the mix changed over the last twelve months. Every post is judged separately by [Jev](https://typesafe.ai), a model that answers typed questions with probabilities and generates no text.

A channel with about 1,500 posts takes 35 to 85 seconds, depending on the way to Jev, and costs about $0.10 at list price. The whole thing is one Cloudflare Worker and fits the free plan.

## Run it

Requirements: Node 22 or newer and a key for Jev: from [TypeSafe](https://typesafe.ai) itself or from [OpenRouter](https://openrouter.ai/settings/keys).

```bash
git clone https://github.com/gaborishka/jev-wrapped.git
cd jev-wrapped
npm install            # wrangler, the only dev dependency; the Worker itself has none
cp .env.example .env   # paste one of the two keys into it
npm run dev
```

Open http://localhost:5190, type a channel name, `@name` or a `t.me/...` link. The finished card lives at `/c/<channel>`; that address can be shared, and the card can be downloaded as a PNG. The page is in Ukrainian or English (button in the top right corner).

For a cheap trial add `?limit=60` to the page address: only 60 posts are read.

## How it works

1. **Reading.** Posts come from Telegram's own web preview, `https://t.me/s/<channel>`: no login, no bot, no API key. A page holds about 20 posts and `?before=<id>` gives the 20 before that id. Post ids are consecutive integers, which allows two shortcuts: the id from a year ago is found by bisection (about a dozen requests), and the pages in between are requested in parallel.
2. **Sampling.** Up to 1,500 posts from the last 12 months are judged. A channel with more than that is sampled: pages spread evenly over the year's id range, so every month is represented and the cost stays flat. The card then says "a sample of N from ≈M posts".
3. **Judging.** Each post with text goes to Jev in its own request with four typed questions (`shared/questions.js`): the kind of post (one of ten), is it a paid ad, does it use clickbait, does it push on emotions. HTTP 429 and 5xx are retried with backoff. The request goes to TypeSafe's API or to OpenRouter's Decisions API, see below. Posts without text are counted as "media only" and cost nothing.
4. **Counting.** `shared/aggregate.js` turns the answers into shares, the monthly mix, median views per kind and the most telling posts. Clickbait and pressure count from a probability of 50%. A post counts as an ad from 70% on the yes/no question, or from 40% when the kind question also said "ad"; a bare kind of "ad" without that backing is counted as the author's own promotion.
5. **Drawing.** The card is one SVG string (`public/card.js`) with no web fonts and no external images, so the PNG export looks like the page. The picture a messenger shows next to a link (`/og/<channel>.png`) is drawn by the Worker pixel by pixel into a palette PNG with a 5×7 bitmap font (`shared/og.js`): no image library, a few milliseconds, about 6 KB.

### Why the browser drives the run

A free Worker invocation may make 50 outgoing requests, hold 6 connections and use 10 ms of CPU, so no single request can read a channel. The work is cut into pieces that fit:

- `GET /api/plan?channel=` reads the newest page, finds the id from a year ago and answers with the list of pages to read (about 15 requests to t.me);
- `GET /api/page?channel=&before=` reads one page, judges its posts six at a time and streams a JSON line per answer (1 + about 20 requests), then writes one row to D1;
- `GET /api/finish?channel=` adds the rows up into a card.

The browser asks for up to four pages at a time (the plan says how many), which makes up to 24 Jev requests in flight, and shows every answer as it arrives. If a page comes back throttled, it goes to the end of the line and the run drops to three pages at a time, then two. There is no shared queue: every visitor's run is paced by their own browser, and the only shared ceilings are the daily ones below.

The browser sets the pace and nothing else. `/api/page` only accepts pages of a plan the Worker made itself, post texts come from t.me and never from the browser, and the card is computed from rows the Worker wrote. Nobody can spend the key on requests of their own choosing or put invented numbers on a channel's card.

Rows of judged pages stay in D1 and double as the store of answers. A repeated run within 24 hours returns the stored card; "Recount" reads the channel again and pays only for posts it has not seen.

### Two ways to Jev

`shared/jev.js` knows two addresses that take the same `{ state, questions }` and answer in the same shape:

| | key | address | model | pages at a time | 1,500 posts |
|---|---|---|---|---|---|
| TypeSafe | `TYPESAFE_API_KEY` | `api.typesafe.ai/v1/systemone` | `jev-1.13.0` | 2 | about 85 s |
| OpenRouter | `OPENROUTER_API_KEY` | `openrouter.ai/api/alpha/decisions` | `typesafe/jev-1.13` | 4 | about 35 s |

With one key set, that way is used. With both, TypeSafe wins unless `JEV_PROVIDER=openrouter`. TypeSafe allows 1,200 requests a minute per key, so the plan tells the browser to read two pages at a time: about 25 requests a second, and a full run went through without a single 429. Two visitors at once will be throttled; throttled pages go back in line and the run slows down, as described above. TypeSafe's API reports tokens and no price, so the cost on the page is tokens at the list price, $0.042 per million input tokens, whatever the key is actually billed.

## What the numbers are and are not

The shares are a model's reading of public posts. Jev gives no explanation for an answer, and it makes mistakes: on a channel with no paid advertising it still marked two partner promotions as ads. Treat a card as a reason to look at a channel more closely, not as a verdict. The page shows the posts that scored highest on clickbait, pressure and advertising, so a reader can check the extremes.

The only text sent to TypeSafe or OpenRouter is the text of public posts. About the person using the page nothing is sent to them. The deployed site counts page views with Cloudflare Web Analytics, which sets no cookies; the CSP in `worker/index.js` allows its script, and a fork on a zone without it loads nothing extra.

## Putting it online

```bash
npx wrangler login
npx wrangler d1 create jev-wrapped          # copy the database_id it prints into wrangler.jsonc
npx wrangler secret put TYPESAFE_API_KEY    # or OPENROUTER_API_KEY, or both
npm run deploy                              # applies migrations/ to D1, then deploys
```

Before the first deploy look through `wrangler.jsonc`:

- `routes` holds the address (`wrapped.ivanhabor.com` here). With the domain on Cloudflare the DNS record and the certificate are created by the deploy. Remove the block to get a `*.workers.dev` address instead.
- Every fresh run spends your key, about $0.05 per 1,000 posts, so there are three ceilings: `WRAPPED_DAILY_LIMIT` (fresh runs one address may start per day), `WRAPPED_DAILY_BUDGET_USD` (all visitors together; counted from the rows in D1), and a spending limit on the key itself where the provider has one (OpenRouter does), which holds even if this code is wrong. Set the last one. The budget is counted at list price, also while TypeSafe's API is free.
- The front page shows up to nine tiles of channels that already have a card, the ones with most fresh runs in the last seven days first. A channel gets a tile after a full run and from `WRAPPED_TILES_MIN_SUBSCRIBERS` subscribers (5,000), so somebody's small channel does not end up on the front page because its owner tried the tool. `WRAPPED_SHOWCASE` channels skip that test and come first, in the order listed, and the first of them is the example card next to the form; run each once after the deploy so that its card exists. `WRAPPED_HIDDEN` channels never get a tile: that is the switch for a channel you do not want on your front page.

What the free plan allows per day: 100,000 Worker requests and 100,000 rows written to D1. A full run is about 80 requests and 80 rows, a card view is one request, and scripts and styles are static assets that do not count. The 10 ms CPU limit is the one thing that cannot be measured locally: if the dashboard shows pages failing with error 1102, the Workers Paid plan ($5 a month) lifts it.

The OpenRouter Decisions API is in alpha and throttles bursts. 24 parallel requests went through without a single 429 in testing; if that changes, lower `pagesAtOnce` of the provider in `shared/jev.js`.

## Project layout

```
worker/index.js      the Worker: plan, page, finish, cards, front page tiles, link previews, page head
shared/telegram.js   t.me/s pages: parsing, bisection to a year ago, sampling
shared/jev.js        one post -> Jev answers, through TypeSafe or OpenRouter
shared/questions.js  the four questions and the ten kinds of post
shared/aggregate.js  answers -> the numbers on the card
shared/og.js         the link preview picture: bitmap font, palette PNG encoder
public/              the page, the SVG card, Ukrainian and English texts
migrations/          the D1 schema
test/                node --test
```

```bash
npm test
```

## License

MIT
