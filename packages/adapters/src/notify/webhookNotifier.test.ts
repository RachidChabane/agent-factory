import { describe, expect, it } from 'vitest';
import { NotificationDeliveryError } from './errors.ts';
import { describeWebhookDelivery, NOTICE_BODY, NOTICE_LINK, NOTICE_TITLE, recordingFetch, rejectingFetch, SECRET_WEBHOOK_URL, type RecordedCall } from './testSupport.ts';
import { buildWebhookPayload, WebhookNotifier, type WebhookNotifierSettings } from './webhookNotifier.ts';

const OK_STATUS = 200;
const SERVER_ERROR_STATUS = 500;
const TIMEOUT_MS = 1_000;
const AUTHORIZATION_VALUE = 'Bearer SECRET_BEARER_VALUE';

function notifier(settings: Partial<WebhookNotifierSettings>): WebhookNotifier {
  return new WebhookNotifier({ url: SECRET_WEBHOOK_URL, headers: {}, fetch: recordingFetch(OK_STATUS, []), timeoutMs: TIMEOUT_MS, ...settings });
}

describe('WebhookNotifier', () => {
  it('posts the title, the body and the link as JSON', async () => {
    const calls: RecordedCall[] = [];
    await notifier({ fetch: recordingFetch(OK_STATUS, calls) }).notify(NOTICE_TITLE, NOTICE_BODY, NOTICE_LINK);
    const [call] = calls;
    expect(call?.url).toBe(SECRET_WEBHOOK_URL);
    expect(call?.method).toBe('POST');
    expect(call?.headers).toEqual({ 'Content-Type': 'application/json; charset=UTF-8' });
    expect(JSON.parse(call?.body ?? '')).toEqual({ title: NOTICE_TITLE, body: NOTICE_BODY, link: NOTICE_LINK });
    expect(buildWebhookPayload(NOTICE_TITLE, NOTICE_BODY, NOTICE_LINK)).toEqual({ title: NOTICE_TITLE, body: NOTICE_BODY, link: NOTICE_LINK });
  });

  it('sends the configured headers along with the content type', async () => {
    const calls: RecordedCall[] = [];
    await notifier({ headers: { Authorization: AUTHORIZATION_VALUE, 'X-Source': 'agent-factory' }, fetch: recordingFetch(OK_STATUS, calls) }).notify(
      NOTICE_TITLE,
      NOTICE_BODY,
      NOTICE_LINK,
    );
    expect(calls[0]?.headers).toEqual({
      'Content-Type': 'application/json; charset=UTF-8',
      Authorization: AUTHORIZATION_VALUE,
      'X-Source': 'agent-factory',
    });
  });

  it.each(['Content-Type', 'content-type', 'CONTENT-TYPE'])('lets the configured %s replace the default one instead of repeating it', async (name) => {
    const calls: RecordedCall[] = [];
    await notifier({ headers: { [name]: 'application/cloudevents+json' }, fetch: recordingFetch(OK_STATUS, calls) }).notify(NOTICE_TITLE, NOTICE_BODY, NOTICE_LINK);
    expect(calls[0]?.headers).toEqual({ [name]: 'application/cloudevents+json' });
  });

  it('never puts a header value in an error', async () => {
    const refused = notifier({ headers: { Authorization: AUTHORIZATION_VALUE }, fetch: recordingFetch(SERVER_ERROR_STATUS, []) }).notify(NOTICE_TITLE, NOTICE_BODY, NOTICE_LINK);
    await expect(refused).rejects.toBeInstanceOf(NotificationDeliveryError);
    await expect(refused).rejects.toMatchObject({ message: expect.not.stringContaining('SECRET') });
    const failed = notifier({ headers: { Authorization: AUTHORIZATION_VALUE }, fetch: rejectingFetch(`bad header ${AUTHORIZATION_VALUE}`) }).notify(
      NOTICE_TITLE,
      NOTICE_BODY,
      NOTICE_LINK,
    );
    await expect(failed).rejects.toMatchObject({ message: expect.not.stringContaining('SECRET') });
  });
});

describeWebhookDelivery('Webhook', (fetch, timeoutMs) => new WebhookNotifier({ url: SECRET_WEBHOOK_URL, headers: {}, fetch, timeoutMs }));
