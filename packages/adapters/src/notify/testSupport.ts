import type { Notifier } from '@agent-factory/application';
import { describe, expect, it } from 'vitest';
import { NotificationDeliveryError } from './errors.ts';
import type { NotifyFetchFunction } from './webhookDelivery.ts';

export const SECRET_WEBHOOK_URL = 'https://hooks.example.test/services/T000/B000/SECRET_PATH_TOKEN?key=SECRET_KEY';
export const NOTICE_TITLE = 'Issue 42 needs review';
export const NOTICE_BODY = 'The pull request is ready.';
export const NOTICE_LINK = 'http://127.0.0.1:7430/issues/42';

const OK_STATUS = 200;
const SERVER_ERROR_STATUS = 500;
const TINY_TIMEOUT_MS = 5;
const GENEROUS_TIMEOUT_MS = 1_000;

export interface RecordedCall {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export function recordingFetch(status: number, calls: RecordedCall[]): NotifyFetchFunction {
  return (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    return Promise.resolve({ status });
  };
}

export function rejectingFetch(message: string): NotifyFetchFunction {
  return () => Promise.reject(new Error(message));
}

export function hangingFetch(onAbort: () => void = () => undefined): NotifyFetchFunction {
  return (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        onAbort();
        reject(init.signal.reason);
      });
    });
}

export type NotifierFactory = (fetch: NotifyFetchFunction, timeoutMs: number) => Notifier;

export function describeWebhookDelivery(channel: string, createNotifier: NotifierFactory): void {
  describe(`${channel} delivery`, () => {
    const notify = (fetch: NotifyFetchFunction, timeoutMs = GENEROUS_TIMEOUT_MS): Promise<void> =>
      createNotifier(fetch, timeoutMs).notify(NOTICE_TITLE, NOTICE_BODY, NOTICE_LINK);

    it.each([200, 201, 204, 299])('accepts HTTP %i', async (status) => {
      await expect(notify(recordingFetch(status, []))).resolves.toBeUndefined();
    });

    it.each([199, 300, 302, 400, 404, 429, SERVER_ERROR_STATUS])('refuses HTTP %i with a NotificationDeliveryError carrying it', async (status) => {
      const delivery = notify(recordingFetch(status, []));
      await expect(delivery).rejects.toBeInstanceOf(NotificationDeliveryError);
      await expect(delivery).rejects.toMatchObject({ status, message: expect.stringContaining(`HTTP ${status}`) });
    });

    it('never puts the webhook address in the error of a refused delivery', async () => {
      const delivery = notify(recordingFetch(SERVER_ERROR_STATUS, []));
      await expect(delivery).rejects.toMatchObject({ message: expect.not.stringContaining('SECRET') });
    });

    it('throws a NotificationDeliveryError without the webhook address or the cause message when fetch rejects', async () => {
      const delivery = notify(rejectingFetch(`connect ECONNREFUSED ${SECRET_WEBHOOK_URL}`));
      await expect(delivery).rejects.toBeInstanceOf(NotificationDeliveryError);
      await expect(delivery).rejects.toMatchObject({
        status: undefined,
        message: expect.stringContaining('request failed: Error'),
      });
      await expect(delivery).rejects.toMatchObject({ message: expect.not.stringContaining('SECRET') });
      await expect(delivery).rejects.toMatchObject({ message: expect.not.stringContaining('ECONNREFUSED') });
    });

    it('aborts the request after the timeout', async () => {
      let aborted = false;
      const error = await notify(
        hangingFetch(() => {
          aborted = true;
        }),
        TINY_TIMEOUT_MS,
      ).catch((caught: unknown) => caught);
      expect(aborted).toBe(true);
      expect(error).toBeInstanceOf(NotificationDeliveryError);
      expect(error).toMatchObject({ message: expect.stringContaining('request failed') });
    });

    it('sends exactly one POST', async () => {
      const calls: RecordedCall[] = [];
      await notify(recordingFetch(OK_STATUS, calls));
      expect(calls).toHaveLength(1);
      expect(calls[0]?.method).toBe('POST');
    });
  });
}
