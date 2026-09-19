// All words the page and the card show, in Ukrainian and English.

export const KIND_COLORS = {
  news: '#4f8ef7',
  analysis: '#9b7bff',
  useful: '#2cc7a0',
  personal: '#f7a74f',
  joke: '#ffd84d',
  ad: '#ff5c5c',
  self_promo: '#ff8fd0',
  fundraising: '#7ed957',
  announcement: '#5cd6f2',
  other: '#7b8494',
  media: '#4a5160',
};

// «1 пост», «3 пости», «25 постів»: the word that follows a number. After «з» it is always «постів».
const ukRules = new Intl.PluralRules('uk');
const ukWord = (one, few, many) => (n) => ({ one, few })[ukRules.select(n)] ?? many;
const ukPosts = ukWord('пост', 'пости', 'постів');
const ukSeconds = ukWord('секунда', 'секунди', 'секунд');

const uk = {
  lang: 'uk',
  title: 'Рентген Telegram-каналу',
  lead: 'Вставте назву публічного каналу. Модель Jev оцінить кожен пост за останній рік і порахує, скільки в каналі новин, реклами, жартів і клікбейту.',
  placeholder: 'назва каналу',
  go: 'Просвітити',
  again: 'Перерахувати',
  download: 'Завантажити PNG',
  copyLink: 'Скопіювати посилання',
  copied: 'Скопійовано',
  another: 'Інший канал',
  kinds: {
    news: 'Новини',
    analysis: 'Думки й аналітика',
    useful: 'Користь',
    personal: 'Особисте',
    joke: 'Жарти',
    ad: 'Реклама',
    self_promo: 'Свої проєкти',
    fundraising: 'Збори коштів',
    announcement: 'Оголошення',
    other: 'Інше',
    media: 'Лише медіа',
  },
  months: ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'],
  eyebrow: 'Публічні канали · без входу в Telegram',
  home: {
    title: 'Уже просвітили',
    note: 'спершу ті, що запускали найчастіше за тиждень',
    totals: (channels, posts) => `каналів: ${channels} · оцінено постів: ${posts}`,
    pressure: 'тиск',
  },
  sampleTag: (name) => `приклад · @${name}`,
  steps: {
    read: { title: 'Читає t.me/s', text: 'Публічний канал відкривається у вебі без входу в Telegram. Сайт читає пости за 12 місяців. Якщо їх понад 1\u00a0500, бере рівномірну вибірку за весь рік.' },
    judge: { title: 'Один пост — один запит', text: 'Jev не пише тексту. Про кожен пост він отримує чотири питання і на кожне повертає ймовірність: який це тип поста, чи це реклама, чи є клікбейт, чи тисне пост на емоції.' },
    card: { title: 'Картка і посилання', text: 'Картку можна завантажити як PNG або поділитися її адресою. Модель помиляється, тому частки приблизні. Під карткою показано пости, в яких вона найбільш упевнена.' },
  },
  reading: 'Читаю канал',
  judging: 'Jev оцінює пости',
  kpi: { posts: 'Оцінено постів', speed: 'Швидкість', perSecond: 'постів/с', latency: 'Відповідь Jev', ms: 'мс', cost: 'Вартість запуску' },
  split: (answers, media, reused) => [`${answers} через Jev`, `${media} без тексту`, reused ? `${reused} з кешу` : ''].filter(Boolean).join(' · '),
  pages: (done, total) => `стор. ${done} / ${total}`,
  working: (n) => `${n} запитів одночасно`,
  p95: (ms) => `медіана · p95 ${ms} мс`,
  tokensNote: (tokens, seconds) => `${tokens} вхідних токенів · ${seconds} с`,
  feed: { title: 'Зараз у Jev', media: 'без тексту. Фото й відео моделі не надсилаються: вона читає лише текст.', reading: 'Читаю сторінки каналу…', allDone: 'Усі пости оцінено.' },
  feedCount: (n) => `${n} в роботі`,
  request: {
    title: 'Один запит',
    kind: 'Який це тип поста? Десять варіантів.',
    ad: 'Це платна реклама?',
    clickbait: 'Пост приховує суть, щоб змусити клікнути?',
    pressure: 'Тисне на страх чи гнів замість інформувати?',
    note: 'На кожне питання Jev повертає ймовірність, а не текст. Пороги застосовує звичайний код.',
  },
  map: { title: 'Типи постів', note: '10 типів · обирає Jev' },
  last: { title: 'Остання відповідь', waiting: 'Перша відповідь з’явиться тут.', confidence: 'тип, упевненість', reused: 'відповідь із попереднього запуску' },
  answersCount: (n) => `відповідей: ${n}`,
  receipt: { posts: ukPosts, seconds: ukSeconds, cost: 'вартість', perPost: 'за пост' },
  foot: 'Оцінки приблизні, модель помиляється. Перш ніж робити висновки про канал, перегляньте пости під карткою. Модель Jev 1.13 від TypeSafe.',
  subscribers: (n) => `${n} підписників`,
  metrics: { ad: 'реклама', clickbait: 'клікбейт', pressure: 'емоційний тиск' },
  trend: 'Склад постів за місяцями',
  perWeek: (n) => `${n} на тиждень`,
  period: (from, to) => `${from} – ${to}`,
  footer: (posts, seconds, cost) => `${posts} · ${seconds} с · ${cost}`,
  postsRead: (shown, n) => `${shown} ${ukPosts(n)}`,
  postsSampled: (n, total) => `вибірка ${n} з ≈${total} постів`,
  madeWith: 'jev wrapped · оцінила модель Jev',
  madeAt: (site) => `${site} · модель Jev`,
  cached: 'Картку взято з кешу. Натисніть «Перерахувати», щоб дочитати нові пости.',
  examples: { title: 'Найпоказовіші пости', clickbait: 'Найбільше схожий на клікбейт', pressure: 'Найсильніший емоційний тиск', ad: 'Найочевидніша реклама' },
  views: {
    title: 'Перегляди за типом поста',
    baseline: (value, posts) => `Медіана каналу: ${value} переглядів на пост, постів у розрахунку: ${posts}. Нижче видно, наскільки кожен тип від неї відходить.`,
    cols: { posts: 'постів', diff: 'до медіани каналу', median: 'медіана' },
    few: (n) => `Типів, у яких менше ${n} постів, тут немає. Медіана з кількох постів нічого не каже.`,
  },
  method: {
    title: 'Як це пораховано',
    read: (shown, n, months) => `Сайт прочитав ${shown} ${ukPosts(n)} каналу за останні ${months} міс. з публічної сторінки t.me/s.`,
    sampled: (total) => `За рік у каналі їх приблизно ${total}, тому це рівномірна вибірка. Сторінки взято через однакові проміжки за весь період.`,
    judged: (judged) => `Постів із текстом: ${judged}. Кожен із них модель Jev оцінила окремим запитом.`,
    media: (media) => `Пости без тексту пораховано як «лише медіа», їх ${media}.`,
    failed: (n) => `Не вдалося оцінити постів: ${n}. У частки вони не входять.`,
    run: (date, seconds, tokens, cost, model) => `Запуск ${date}: ${seconds} с, ${tokens} вхідних токенів, ${cost} за прайсом, модель ${model}.`,
    more: 'Питання до моделі, пороги й обмеження',
    questionsTitle: 'Чотири питання про кожен пост',
    here: (n, of) => `У цьому каналі: ${n} з ${of}.`,
    questions: [
      {
        key: 'kind',
        name: 'Тип поста',
        text: 'Jev обирає один із десяти типів за головною метою поста. Типи описано нижче. Якщо вийшла «реклама», а на питання про рекламу модель відповіла нижче за 40%, пост пораховано як «свої проєкти». Без цього правила власні анонси автора потрапляли в рекламу.',
      },
      {
        key: 'ad',
        name: 'Реклама',
        text: '«Це платна реклама чи спонсорське розміщення для третьої сторони?» Так: пост просуває чужий продукт, сервіс, магазин, бот, казино, курс чи канал із закликом до дії, реферальним посиланням або промокодом, або позначений як реклама. Ні: звичайний контент, власні продукти автора, новина, де компанію лише згадано. Зараховано від 70%, або від 40%, якщо й тип поста вийшов «реклама».',
      },
      {
        key: 'clickbait',
        name: 'Клікбейт',
        text: '«Пост використовує клікбейт, щоб отримати увагу чи клік?» Так: приховує головний факт, щоб змусити клікнути або дочитати, перебільшує, пише «ШОК» чи «ТЕРМІНОВО» без справжньої терміновості. Ні: каже суть прямо. Зараховано від 50%.',
      },
      {
        key: 'pressure',
        name: 'Емоційний тиск',
        text: '«Пост використовує емоційно заряджену мову, щоб викликати страх, гнів чи обурення, а не поінформувати?» Так: навантажені слова, образи, алармістська подача, заклики до паніки чи ненависті. Ні: спокійний тон, навіть коли тема серйозна чи сумна. Зараховано від 50%.',
      },
    ],
    kindsTitle: 'Десять типів постів',
    kindNotes: {
      news: 'подія чи факт: що сталося, де, коли',
      analysis: 'думка автора, коментар, аналіз або пояснення',
      useful: 'порада, інструкція, огляд, рекомендований інструмент чи ресурс',
      personal: 'життя автора: історія, відчуття, закулісся',
      joke: 'гумор, мем, іронія',
      ad: 'платне просування чужого продукту, сервісу, каналу, магазину, казино чи курсу',
      self_promo: 'власний продукт чи проєкт автора: релізи, продажі, платна підписка, свої події та канали',
      fundraising: 'збір або заклик задонатити',
      announcement: 'справи каналу: розклад, стрім, привітання, опитування, розіграш, правила',
      other: 'жоден із типів або пост закороткий, щоб визначити',
    },
    limitsTitle: 'Чого ці цифри не кажуть',
    limits: [
      'Jev не пояснює відповідей і помиляється. Перевірити його можна за постами з найвищими оцінками, їх показано вище.',
      'Пороги 50% і 70% вибрано вручну. Вони однакові для всіх каналів, тому канали можна порівнювати між собою. З іншим порогом самі відсотки були б інші.',
      'Питання про тиск стосується подачі. Спокійний пост про війну не вважається тиском, а саркастичний жарт може ним стати, бо сарказм від серйозного тону модель не відрізняє.',
      'Модель читає назву каналу, текст поста до 1\u00a0200 символів, тип вкладення, прев’ю посилання і назву джерела, якщо пост переслано. Фото, відео й голосові вона не бачить.',
      'Видалених постів сайт не бачить, а відредаговані читає в поточній редакції.',
    ],
    sampledLimit: 'Частки пораховано за вибіркою. Решту постів каналу сайт не читав.',
  },
  errors: {
    bad_name: 'Це не схоже на назву каналу.',
    not_found: 'Такого публічного каналу немає, або в нього вимкнено перегляд у вебі.',
    empty: 'За останній рік у каналі немає постів.',
    busy: 'Зараз обробляються інші канали. Спробуйте за хвилину.',
    limit: 'Денний ліміт запусків вичерпано. Готові картки відкриваються й далі, нові запуски будуть завтра.',
    no_key: 'На сервері не задано ключ Jev: TYPESAFE_API_KEY або OPENROUTER_API_KEY.',
    error: 'Не вдалося обробити канал. Спробуйте ще раз.',
  },
};

const en = {
  lang: 'en',
  title: 'Telegram channel X-ray',
  lead: 'Paste the name of a public channel. The Jev model judges every post of the last year and counts how much of the channel is news, ads, jokes and clickbait.',
  placeholder: 'channel name',
  go: 'X-ray it',
  again: 'Recount',
  download: 'Download PNG',
  copyLink: 'Copy link',
  copied: 'Copied',
  another: 'Another channel',
  kinds: {
    news: 'News',
    analysis: 'Opinion and analysis',
    useful: 'Useful',
    personal: 'Personal',
    joke: 'Jokes',
    ad: 'Ads',
    self_promo: 'Own projects',
    fundraising: 'Fundraising',
    announcement: 'Announcements',
    other: 'Other',
    media: 'Media only',
  },
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  eyebrow: 'Public channels · no Telegram login',
  home: {
    title: 'Already X-rayed',
    note: 'most runs this week first',
    totals: (channels, posts) => `channels: ${channels} · posts judged: ${posts}`,
    pressure: 'pressure',
  },
  sampleTag: (name) => `example · @${name}`,
  steps: {
    read: { title: 'Reads t.me/s', text: 'A public channel opens on the web without a Telegram login. The site reads the posts of the last 12 months. Above 1,500 posts it takes an even sample across the year.' },
    judge: { title: 'One post, one request', text: 'Jev writes no text. It gets four questions about every post and returns a probability for each: what kind of post it is, whether it is an ad, whether it uses clickbait, whether it pushes on emotions.' },
    card: { title: 'A card and a link', text: 'Download the card as a PNG or share its address. The model makes mistakes, so the shares are approximate. Below the card are the posts it was most sure about.' },
  },
  reading: 'Reading the channel',
  judging: 'Jev is judging posts',
  kpi: { posts: 'Posts judged', speed: 'Speed', perSecond: 'posts/s', latency: 'Jev response', ms: 'ms', cost: 'Cost of this run' },
  split: (answers, media, reused) => [`${answers} via Jev`, `${media} without text`, reused ? `${reused} from cache` : ''].filter(Boolean).join(' · '),
  pages: (done, total) => `pages ${done} / ${total}`,
  working: (n) => `${n} requests at a time`,
  p95: (ms) => `median · p95 ${ms} ms`,
  tokensNote: (tokens, seconds) => `${tokens} input tokens · ${seconds} s`,
  feed: { title: 'With Jev right now', media: 'without text. Photos and videos are not sent to the model: it only reads text.', reading: 'Reading the channel pages…', allDone: 'All posts are judged.' },
  feedCount: (n) => `${n} in flight`,
  request: {
    title: 'One request',
    kind: 'What kind of post is this? Ten options.',
    ad: 'Is it a paid ad?',
    clickbait: 'Does it hide the point to force a click?',
    pressure: 'Does it push on fear or anger instead of informing?',
    note: 'Jev answers each question with a probability, not with text. Thresholds are applied by plain code.',
  },
  map: { title: 'Kinds of posts', note: '10 kinds · picked by Jev' },
  last: { title: 'Latest answer', waiting: 'The first answer will show up here.', confidence: 'kind, confidence', reused: 'answer from an earlier run' },
  answersCount: (n) => `answers: ${n}`,
  receipt: { posts: (n) => (n === 1 ? 'post' : 'posts'), seconds: (n) => (n === 1 ? 'second' : 'seconds'), cost: 'cost', perPost: 'per post' },
  foot: 'The shares are approximate, the model makes mistakes. Before drawing conclusions about a channel, read the posts below its card. Model: Jev 1.13 by TypeSafe.',
  subscribers: (n) => `${n} subscribers`,
  metrics: { ad: 'ads', clickbait: 'clickbait', pressure: 'emotional pressure' },
  trend: 'Mix of posts by month',
  perWeek: (n) => `${n} per week`,
  period: (from, to) => `${from} – ${to}`,
  footer: (posts, seconds, cost) => `${posts} · ${seconds} s · ${cost}`,
  postsRead: (shown, n) => `${shown} ${n === 1 ? 'post' : 'posts'}`,
  postsSampled: (n, total) => `a sample of ${n} from ≈${total} posts`,
  madeWith: 'jev wrapped · judged by the Jev model',
  madeAt: (site) => `${site} · Jev model`,
  cached: 'This card comes from the cache. Press “Recount” to read the new posts.',
  examples: { title: 'Most telling posts', clickbait: 'Closest to clickbait', pressure: 'Strongest emotional pressure', ad: 'Most obvious ad' },
  views: {
    title: 'Views by kind of post',
    baseline: (value, posts) => `Channel median: ${value} views per post, posts counted: ${posts}. Below is how far each kind is from it.`,
    cols: { posts: 'posts', diff: 'against the channel median', median: 'median' },
    few: (n) => `Kinds with fewer than ${n} posts are left out. A median of a few posts says nothing.`,
  },
  method: {
    title: 'How this was counted',
    read: (shown, n, months) => `The site read ${shown} ${n === 1 ? 'post' : 'posts'} of the channel from the last ${months} months, from the public t.me/s page.`,
    sampled: (total) => `The channel has about ${total} a year, so this is an even sample. The pages are taken at equal steps across the whole period.`,
    judged: (judged) => `Posts with text: ${judged}. The Jev model judged each of them in a request of its own.`,
    media: (media) => `Posts without text are counted as "media only", ${media} of them.`,
    failed: (n) => `Posts that could not be judged: ${n}. They are not part of the shares.`,
    run: (date, seconds, tokens, cost, model) => `Run on ${date}: ${seconds} s, ${tokens} input tokens, ${cost} at list price, model ${model}.`,
    more: 'Questions to the model, thresholds and limits',
    questionsTitle: 'Four questions about every post',
    here: (n, of) => `In this channel: ${n} of ${of}.`,
    questions: [
      {
        key: 'kind',
        name: 'Kind of post',
        text: 'Jev picks one of ten kinds by the main purpose of the post. The kinds are described below. When it says "ad" and answers the ad question below 40%, the post is counted as "own projects". Without this rule the author\'s own announcements ended up as ads.',
      },
      {
        key: 'ad',
        name: 'Ads',
        text: '"Is this post a paid advertisement or a sponsored placement for a third party?" Yes: it pushes someone else\'s product, service, shop, bot, casino, course or channel with a call to action, a referral link or a promo code, or it is marked as advertising. No: regular content, the author\'s own products, news that only mentions a company. Counted from 70%, or from 40% when the kind of post also came out as "ad".',
      },
      {
        key: 'clickbait',
        name: 'Clickbait',
        text: '"Does the post use clickbait to get attention or clicks?" Yes: it withholds the key fact to force a click or a read, exaggerates, or shouts "SHOCK" and "URGENT" without real urgency. No: it states its point plainly. Counted from 50%.',
      },
      {
        key: 'pressure',
        name: 'Emotional pressure',
        text: '"Does the post use emotionally charged language to provoke fear, anger or outrage rather than to inform?" Yes: loaded words, insults, alarmist framing, appeals to panic or hatred. No: a calm tone, even when the topic is serious or sad. Counted from 50%.',
      },
    ],
    kindsTitle: 'Ten kinds of posts',
    kindNotes: {
      news: 'an event or a fact: what happened, where, when',
      analysis: "the author's opinion, commentary, analysis or explanation",
      useful: 'advice, a how-to, a review, a recommended tool or resource',
      personal: "the author's own life: a story, feelings, behind the scenes",
      joke: 'humour, a meme, irony',
      ad: "paid promotion of someone else's product, service, channel, shop, casino or course",
      self_promo: "the author's own product or project: releases, sales, paid subscription, own events and channels",
      fundraising: 'a fundraiser or a call to donate',
      announcement: 'channel housekeeping: schedule, stream, greeting, poll, giveaway, rules',
      other: 'none of these, or too short to tell',
    },
    limitsTitle: 'What these numbers do not say',
    limits: [
      'Jev gives no explanation and makes mistakes. Check it against the highest-scoring posts shown above.',
      'The 50% and 70% thresholds were picked by hand. They are the same for every channel, so channels can be compared with each other. Another threshold would give other percentages.',
      'The pressure question is about wording. A calm post about war is not pressure, and a sarcastic joke can be, because the model cannot tell sarcasm from a serious tone.',
      'The model reads the channel name, up to 1,200 characters of the post, the type of attachment, the link preview and the source of a forwarded post. It does not see photos, videos or voice messages.',
      'The site does not see deleted posts, and reads edited ones as they are now.',
    ],
    sampledLimit: "The shares are counted over the sample. The site did not read the rest of the channel's posts.",
  },
  errors: {
    bad_name: 'That does not look like a channel name.',
    not_found: 'There is no such public channel, or its web preview is turned off.',
    empty: 'The channel has no posts in the last year.',
    busy: 'Other channels are being processed right now. Try again in a minute.',
    limit: 'The daily limit of runs is used up. Finished cards still open; new runs start again tomorrow.',
    no_key: 'No Jev key on the server: set TYPESAFE_API_KEY or OPENROUTER_API_KEY.',
    error: 'Could not process the channel. Try again.',
  },
};

export const DICTIONARIES = { uk, en };

export function pickLanguage() {
  try {
    const saved = localStorage.getItem('jev-wrapped.lang');
    if (saved in DICTIONARIES) return saved;
  } catch {}
  return navigator.languages?.some((language) => language.startsWith('uk')) ? 'uk' : 'en';
}

export const percent = (share) => (share > 0 && share < 0.01 ? '<1%' : `${Math.round(share * 100)}%`);

export function compact(number, lang) {
  if (number == null) return '—';
  return new Intl.NumberFormat(lang === 'uk' ? 'uk-UA' : 'en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(number);
}

export const number = (value, lang) => new Intl.NumberFormat(lang === 'uk' ? 'uk-UA' : 'en-US').format(value);

export const money = (usd) => (usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`);

export function shortDate(iso, t) {
  const date = new Date(iso);
  return `${t.months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
