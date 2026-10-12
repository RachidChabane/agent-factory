import { describe, expect, it } from 'vitest';
import { GoogleChatNotifier, type NotifyFetchFunction } from './googleChatNotifier.ts';
import { NotificationDeliveryError } from './errors.ts';

const WEBHOOK_URL = 'https://chat.googleapis.com/v1/spaces/AAA/messages?key=SECRET_KEY&token=SECRET_TOKEN';
const TITLE = 'Issue 42 needs review';
const BODY = 'The pull request is ready.';
const LINK = 'http://127.0.0.1:7430/issues/42';
const TIMEOUT_MS = 1_000;
const TINY_TIMEOUT_MS = 5;
const SERVER_ERROR_STATUS = 500;
const OK_STATUS = 200;

interface RecordedCall {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

function recordingFetch(status: number, calls: RecordedCall[]): NotifyFetchFunction {
  return (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    return Promise.resolve({ status });
  };
}

function notifierWith(fetch: NotifyFetchFunction, timeoutMs = TIMEOUT_MS): GoogleChatNotifier {
  return new GoogleChatNotifier({ webhookUrl: WEBHOOK_URL, fetch, timeoutMs });
}

describe('GoogleChatNotifier', () => {
  it('posts a cardsV2 message with the title, body and cockpit button', async () => {
    const calls: RecordedCall[] = [];
    await notifierWith(recordingFetch(OK_STATUS, calls)).notify(TITLE, BODY, LINK);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe(WEBHOOK_URL);
    expect(call?.method).toBe('POST');
    expect(call?.headers).toEqual({ 'Content-Type': 'application/json; charset=UTF-8' });
    expect(JSON.parse(call?.body ?? '')).toEqual({
      text: TITLE,
      cardsV2: [
        {
          cardId: 'factory-notification',
          card: {
            header: { title: TITLE },
            sections: [
              {
                widgets: [
                  { textParagraph: { text: BODY } },
                  { buttonList: { buttons: [{ text: 'Open in cockpit', onClick: { openLink: { url: LINK } } }] } },
                ],
              },
            ],
          },
        },
      ],
    });
  });

  it('throws a NotificationDeliveryError carrying the status on a non-2xx answer', async () => {
    const delivery = notifierWith(recordingFetch(SERVER_ERROR_STATUS, [])).notify(TITLE, BODY, LINK);
    await expect(delivery).rejects.toBeInstanceOf(NotificationDeliveryError);
    await expect(delivery).rejects.toMatchObject({ status: SERVER_ERROR_STATUS, message: expect.not.stringContaining('SECRET') });
  });

  it('throws a NotificationDeliveryError without the webhook URL when fetch rejects', async () => {
    const failing: NotifyFetchFunction = () => Promise.reject(new Error(`connect ECONNREFUSED ${WEBHOOK_URL}`));
    const delivery = notifierWith(failing).notify(TITLE, BODY, LINK);
    await expect(delivery).rejects.toBeInstanceOf(NotificationDeliveryError);
    await expect(delivery).rejects.toMatchObject({ status: undefined, message: expect.not.stringContaining(WEBHOOK_URL) });
    await expect(delivery).rejects.toMatchObject({ message: expect.not.stringContaining('SECRET') });
  });

  it('aborts the request after the timeout', async () => {
    let aborted = false;
    const hanging: NotifyFetchFunction = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          aborted = true;
          reject(init.signal.reason);
        });
      });
    const error = await notifierWith(hanging, TINY_TIMEOUT_MS).notify(TITLE, BODY, LINK).catch((caught: unknown) => caught);
    expect(aborted).toBe(true);
    expect(error).toBeInstanceOf(NotificationDeliveryError);
  });
});
