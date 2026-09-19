// Every question Jev is asked about one post. This is the file to read to understand what the
// card's numbers mean; everything else is fetching, counting and drawing.

export const MAX_POST_CHARS = 1200;

/** Post kinds, in the order they are listed on the card. */
export const KINDS = {
  news: 'Reports a current event or a fact: what happened, where, when. Breaking news, updates, official statements',
  analysis: "The author's opinion, commentary, analysis or explanation of events, trends or ideas",
  useful: 'Practical value for the reader: advice, tutorial, how-to, review, a recommended tool, book or resource',
  personal: "The author's own life: a diary-like story, feelings, behind the scenes, what they did today",
  joke: 'Humour: a joke, meme, irony, funny story, shitpost',
  ad: "Paid advertising or promotion of someone else's product, service, channel, shop, casino or course",
  self_promo: "About the author's own product, company or project: releases, new features, milestones, sales, paid subscription, merch, own events or other own channels",
  fundraising: 'A fundraiser or a call to donate money: "збір", "банка", "донат", a card number or a donation link',
  announcement: 'Channel or community housekeeping: schedule, stream starting, holiday greeting, poll, contest, giveaway, rules',
  other: 'None of these, or too short to tell',
};

/**
 * post = { text, media, link: { title, description, site } | null, forwardedFrom }
 * The state is what Jev reads; questions are asked about it. Instructions stay in English
 * (cheaper in tokens), the post stays in whatever language it was written in.
 */
export function buildRequest(channelTitle, post) {
  const state = {
    channel: channelTitle,
    post: post.text.slice(0, MAX_POST_CHARS),
  };
  if (post.media) state.attached = post.media;
  if (post.link) state.link_preview = [post.link.site, post.link.title, post.link.description].filter(Boolean).join(' · ').slice(0, 300);
  if (post.forwardedFrom) state.forwarded_from = post.forwardedFrom;

  const questions = {
    kind: {
      type: 'choice',
      instructions: 'What kind of Telegram channel post is this? The post may be in any language. Judge by the main purpose of the post.',
      criteria: KINDS,
    },
    is_ad: {
      type: 'noul',
      instructions: 'Is this post a paid advertisement or a sponsored placement for a third party?',
      criteria: {
        true: 'Pushes a third-party product, service, shop, bot, casino, course or another channel with a call to action, a referral link or a promo code; or is marked as advertising ("реклама", "#ad", "erid", "партнерський пост")',
        false: "Regular content of the channel, the author promoting their own product, platform, events or partners' launches on it, and news that merely mentions a company",
      },
    },
    clickbait: {
      type: 'noul',
      instructions: 'Does the post use clickbait to get attention or clicks?',
      criteria: {
        true: 'Withholds the key fact to force a click or a read ("you will not believe", "деталі за посиланням", "ось що сталося"), sensational or exaggerated wording, shock words in capitals ("ШОК", "ТЕРМІНОВО" without real urgency)',
        false: 'States its point plainly; a reader knows what it is about without clicking anything',
      },
    },
    pressure: {
      type: 'noul',
      instructions: 'Does the post use emotionally charged language to provoke fear, anger or outrage rather than to inform?',
      criteria: {
        true: 'Loaded words, insults, alarmist framing, appeals to panic or hatred',
        false: 'Calm or neutral wording, even when the topic itself is serious or sad',
      },
    },
  };
  return { state, questions };
}
