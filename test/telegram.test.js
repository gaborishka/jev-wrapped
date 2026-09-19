import assert from 'node:assert/strict';
import { test } from 'node:test';

import { htmlToText, parseChannelName, parseCount, parsePage } from '../shared/telegram.js';

const message = ({ id, date, body = '', extra = '' }) => `
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="demo/${id}">
  <div class="tgme_widget_message_bubble">${extra}${body}
    <div class="tgme_widget_message_footer"><span class="tgme_widget_message_views">1.2K</span>
      <a class="tgme_widget_message_date" href="https://t.me/demo/${id}"><time datetime="${date}" class="time">10:00</time></a>
    </div>
  </div>
</div></div>`;

const page = `
<div class="tgme_channel_info">
  <i class="tgme_page_photo_image bgcolor2" data-content="D"><img src="https://cdn4.telesco.pe/file/abc.jpg"></i>
  <div class="tgme_channel_info_header_title"><span dir="auto">Demo &amp; Co</span></div>
  <div class="tgme_channel_info_counter"><span class="counter_value">10.7M</span> <span class="counter_type">subscribers</span></div>
  <div class="tgme_channel_info_description">About <b>us</b></div>
</div>
<a class="tme_messages_more js-messages_more" data-before="41"></a>
${message({ id: 41, date: '2026-09-01T10:00:00+00:00', body: '<div class="tgme_widget_message_text js-message_text" dir="auto">First line<br/>second &quot;line&quot; <div class="nested">inside</div> tail</div>' })}
${message({ id: 42, date: '2026-09-02T10:00:00+00:00', extra: '<a class="tgme_widget_message_photo_wrap" style="x"></a>' })}
${message({ id: 43, date: '2026-09-03T10:00:00+00:00', body: '<div class="tgme_widget_message_text js-message_text">Read this</div><a class="tgme_widget_message_link_preview"><div class="link_preview_site_name">Example</div><div class="link_preview_title">A title</div><div class="link_preview_description">Words</div></a>' })}
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message service_message" data-post="demo/44"><div class="tgme_widget_message_text js-message_text">Channel created</div></div></div>
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap service_message js-widget_message" data-post="demo/45"><div class="tgme_widget_message_text js-message_text">Demo pinned a photo</div><a class="tgme_widget_message_date" href="https://t.me/demo/45"><time datetime="2026-09-04T10:00:00+00:00" class="time">10:00</time></a></div></div>`;

test('channel names come out of names, handles and links', () => {
  assert.deepEqual(['durov', '@durov', 'https://t.me/s/durov/12', 't.me/durov?x=1', ' telegram.me/Durov '].map(parseChannelName), ['durov', 'durov', 'durov', 'durov', 'Durov']);
  assert.deepEqual(['bad name', 'ab', '1abc', 'https://example.com/durov', '../etc'].map(parseChannelName), [null, null, null, null, null]);
});

test('counts with K and M suffixes', () => {
  assert.deepEqual(['18.8M', '1.2K', '532', '1 204', '', 'n/a'].map(parseCount), [18_800_000, 1200, 532, 1204, null, null]);
});

test('html becomes text with line breaks and decoded entities', () => {
  assert.equal(htmlToText('a<br/>b &amp; c<i class="emoji"><b>⛔️</b></i> &#1087;&#x456;'), 'a\nb & c⛔️ пі');
});

test('a preview page gives channel info, posts and the id to page from', () => {
  const { info, posts, before, isChannel } = parsePage(page, 'demo');
  assert.equal(isChannel, true);
  assert.equal(before, 41);
  assert.deepEqual(info, { username: 'demo', title: 'Demo & Co', description: 'About us', subscribers: 10_700_000, avatarUrl: 'https://cdn4.telesco.pe/file/abc.jpg' });
  assert.deepEqual(posts.map((post) => post.id), [41, 42, 43]); // service messages are not posts, with a date link ("pinned a photo") or without
  assert.equal(posts[0].text, 'First line\nsecond "line" inside\n tail');
  assert.equal(posts[0].views, 1200);
  assert.equal(posts[0].url, 'https://t.me/demo/41');
  assert.deepEqual([posts[1].text, posts[1].media], ['', 'photo']);
  assert.deepEqual(posts[2].link, { title: 'A title', description: 'Words', site: 'Example' });
});

test('a page that is not a channel says so', () => {
  assert.equal(parsePage('<html><body>nothing here</body></html>', 'demo').isChannel, false);
});
