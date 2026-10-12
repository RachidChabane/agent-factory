import { describe, expect, it } from 'vitest';
import { GoogleChatNotifier } from './googleChatNotifier.ts';
import { describeWebhookDelivery, NOTICE_BODY, NOTICE_LINK, NOTICE_TITLE, recordingFetch, SECRET_WEBHOOK_URL, type RecordedCall } from './testSupport.ts';

const OK_STATUS = 200;
const TIMEOUT_MS = 1_000;

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

describeWebhookDelivery('Google Chat', (fetch, timeoutMs) => new GoogleChatNotifier({ webhookUrl: SECRET_WEBHOOK_URL, fetch, timeoutMs }));
