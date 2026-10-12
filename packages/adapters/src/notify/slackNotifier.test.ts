import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildSlackMessage, escapeSlackText, SLACK_SECTION_TEXT_LIMIT, SlackNotifier } from './slackNotifier.ts';
import { describeWebhookDelivery, NOTICE_BODY, NOTICE_LINK, NOTICE_TITLE, recordingFetch, SECRET_WEBHOOK_URL, type RecordedCall } from './testSupport.ts';

const OK_STATUS = 200;
const TIMEOUT_MS = 1_000;
const BARE_AMPERSAND = /&(?!amp;|lt;|gt;)/;

function sectionText(title: string, body: string): string {
  return buildSlackMessage(title, body, NOTICE_LINK).blocks[0].text.text;
}

describe('SlackNotifier', () => {
  it('posts the title as the fallback text, a section with the body and a button to the cockpit', async () => {
    const calls: RecordedCall[] = [];
    await new SlackNotifier({ webhookUrl: SECRET_WEBHOOK_URL, fetch: recordingFetch(OK_STATUS, calls), timeoutMs: TIMEOUT_MS }).notify(
      NOTICE_TITLE,
      NOTICE_BODY,
      NOTICE_LINK,
    );
    const [call] = calls;
    expect(call?.url).toBe(SECRET_WEBHOOK_URL);
    expect(call?.method).toBe('POST');
    expect(call?.headers).toEqual({ 'Content-Type': 'application/json; charset=UTF-8' });
    expect(JSON.parse(call?.body ?? '')).toEqual({
      text: NOTICE_TITLE,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `*${NOTICE_TITLE}*\n${NOTICE_BODY}` } },
        { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in cockpit' }, url: NOTICE_LINK }] },
      ],
    });
  });

  it('keeps a mention or a link in an issue title from reaching the channel as one', () => {
    const message = buildSlackMessage('<!channel> Issue 7', 'See <https://phishing.example|the pull request> & more', NOTICE_LINK);
    expect(message.text).toBe('&lt;!channel&gt; Issue 7');
    expect(message.blocks[0].text.text).toBe('*&lt;!channel&gt; Issue 7*\nSee &lt;https://phishing.example|the pull request&gt; &amp; more');
  });

  it('escapes the three control characters of Slack and nothing else', () => {
    expect(escapeSlackText('a & b < c > d "e" \'f\' *g*')).toBe('a &amp; b &lt; c &gt; d "e" \'f\' *g*');
  });

  it('cuts a body that exceeds what a section holds, with an ellipsis', () => {
    const text = sectionText(NOTICE_TITLE, 'x'.repeat(SLACK_SECTION_TEXT_LIMIT * 2));
    expect(Array.from(text)).toHaveLength(SLACK_SECTION_TEXT_LIMIT);
    expect(text.endsWith('…')).toBe(true);
  });

  it('leaves a body that fits untouched', () => {
    const body = 'y'.repeat(SLACK_SECTION_TEXT_LIMIT - Array.from(`*${NOTICE_TITLE}*\n`).length);
    expect(sectionText(NOTICE_TITLE, body)).toBe(`*${NOTICE_TITLE}*\n${body}`);
  });

  it('never cuts an escaped character in two', () => {
    const prefixLength = Array.from(`*${NOTICE_TITLE}*\n`).length;
    const upToTheLastCharacter = SLACK_SECTION_TEXT_LIMIT - 1 - prefixLength;
    for (const padding of [0, 1, 2, 3, 4, 5]) {
      for (const character of ['&', '<', '>']) {
        const text = sectionText(NOTICE_TITLE, `${'z'.repeat(upToTheLastCharacter - padding)}${character.repeat(10)}`);
        expect(BARE_AMPERSAND.test(text), `${character} after ${padding} characters short of the cut`).toBe(false);
        expect(Array.from(text).length).toBeLessThanOrEqual(SLACK_SECTION_TEXT_LIMIT);
      }
    }
  });

  it('writes sections Slack accepts and text no mention can come out of, whatever the notice says', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), fc.string({ unit: 'binary' }), (title, body) => {
        const message = buildSlackMessage(title, body, NOTICE_LINK);
        const text = message.blocks[0].text.text;
        expect(Array.from(text).length).toBeLessThanOrEqual(SLACK_SECTION_TEXT_LIMIT);
        for (const exposed of [text, message.text]) {
          expect(exposed.includes('<') || exposed.includes('>')).toBe(false);
          expect(BARE_AMPERSAND.test(exposed)).toBe(false);
        }
      }),
    );
  });
});

describeWebhookDelivery('Slack', (fetch, timeoutMs) => new SlackNotifier({ webhookUrl: SECRET_WEBHOOK_URL, fetch, timeoutMs }));
