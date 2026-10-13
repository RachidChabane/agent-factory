import { describe, expect, it } from 'vitest';
import { buildGoogleChatMessage, GoogleChatNotifier } from './googleChatNotifier.ts';
import { describeWebhookDelivery, NOTICE_BODY, NOTICE_LINK, NOTICE_TITLE, recordingFetch, SECRET_WEBHOOK_URL, type RecordedCall } from './testSupport.ts';

const OK_STATUS = 200;
const TIMEOUT_MS = 1_000;

const MEDIA = [
  { label: 'checkout-flow · before · film.mp4', url: 'https://files.example.test/a/film.mp4' },
  { label: 'checkout-flow · after · <film> & "more"', url: 'https://files.example.test/b?x=1&y="2"' },
];

describe('GoogleChatNotifier', () => {
  it('posts a cardsV2 message with the title, body and cockpit button', async () => {
    const calls: RecordedCall[] = [];
    await new GoogleChatNotifier({ webhookUrl: SECRET_WEBHOOK_URL, fetch: recordingFetch(OK_STATUS, calls), timeoutMs: TIMEOUT_MS }).notify(
      NOTICE_TITLE,
      NOTICE_BODY,
      NOTICE_LINK,
    );
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe(SECRET_WEBHOOK_URL);
    expect(call?.method).toBe('POST');
    expect(call?.headers).toEqual({ 'Content-Type': 'application/json; charset=UTF-8' });
    expect(JSON.parse(call?.body ?? '')).toEqual({
      text: NOTICE_TITLE,
      cardsV2: [
        {
          cardId: 'factory-notification',
          card: {
            header: { title: NOTICE_TITLE },
            sections: [
              {
                widgets: [
                  { textParagraph: { text: NOTICE_BODY } },
                  { buttonList: { buttons: [{ text: 'Open in cockpit', onClick: { openLink: { url: NOTICE_LINK } } }] } },
                ],
              },
            ],
          },
        },
      ],
    });
  });
});

describe('the links of a Google Chat message', () => {
  const widgetsOf = (media: typeof MEDIA): readonly unknown[] => buildGoogleChatMessage(NOTICE_TITLE, NOTICE_BODY, NOTICE_LINK, media).cardsV2[0].card.sections[0].widgets;

  it('stand in a paragraph of their own between the body and the button', () => {
    expect(widgetsOf(MEDIA)).toEqual([
      { textParagraph: { text: NOTICE_BODY } },
      {
        textParagraph: {
          text: '<a href="https://files.example.test/a/film.mp4">checkout-flow · before · film.mp4</a><br><a href="https://files.example.test/b?x=1&amp;y=&quot;2&quot;">checkout-flow · after · &lt;film&gt; &amp; &quot;more&quot;</a>',
        },
      },
      { buttonList: { buttons: [{ text: 'Open in cockpit', onClick: { openLink: { url: NOTICE_LINK } } }] } },
    ]);
  });

  it('add no paragraph when the notice has no link', () => {
    expect(widgetsOf([])).toHaveLength(2);
  });

  it('show the first links and count the others', () => {
    const many = Array.from({ length: 22 }, (_, index) => ({ label: `file ${index}`, url: `https://files.example.test/${index}` }));
    const links = widgetsOf(many)[1] as { textParagraph: { text: string } };
    expect(links.textParagraph.text.split('<br>')).toHaveLength(21);
    expect(links.textParagraph.text.endsWith('<br>and 2 more in the cockpit')).toBe(true);
  });

  it('are posted when the notifier is given some', async () => {
    const calls: RecordedCall[] = [];
    await new GoogleChatNotifier({ webhookUrl: SECRET_WEBHOOK_URL, fetch: recordingFetch(OK_STATUS, calls), timeoutMs: TIMEOUT_MS }).notify(NOTICE_TITLE, NOTICE_BODY, NOTICE_LINK, MEDIA);
    expect(calls[0]?.body).toContain('https://files.example.test/a/film.mp4');
  });
});

describeWebhookDelivery('Google Chat', (fetch, timeoutMs) => new GoogleChatNotifier({ webhookUrl: SECRET_WEBHOOK_URL, fetch, timeoutMs }));
