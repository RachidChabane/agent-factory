import type { Notifier } from '@agent-factory/application';
import { describe, expect, it } from 'vitest';
import { CompositeNotifier, type NotificationChannel } from './compositeNotifier.ts';
import { NotificationChannelsFailedError, NotificationDeliveryError } from './errors.ts';
import { NOTICE_BODY, NOTICE_LINK, NOTICE_TITLE, SECRET_WEBHOOK_URL } from './testSupport.ts';

class RecordingChannel implements Notifier {
  readonly delivered: (readonly [string, string, string])[] = [];

  notify(title: string, body: string, link: string): Promise<void> {
    this.delivered.push([title, body, link]);
    return Promise.resolve();
  }
}

class FailingChannel implements Notifier {
  attempts = 0;
  private readonly failure: unknown;

  constructor(failure: unknown) {
    this.failure = failure;
  }

  notify(): Promise<void> {
    this.attempts += 1;
    return Promise.reject(this.failure);
  }
}

function channel(name: string, notifier: Notifier): NotificationChannel {
  return { name, notifier };
}

describe('CompositeNotifier', () => {
  it('delivers the notice to every channel', async () => {
    const first = new RecordingChannel();
    const second = new RecordingChannel();
    await new CompositeNotifier([channel('slack', first), channel('system', second)]).notify(NOTICE_TITLE, NOTICE_BODY, NOTICE_LINK);
    expect(first.delivered).toEqual([[NOTICE_TITLE, NOTICE_BODY, NOTICE_LINK]]);
    expect(second.delivered).toEqual([[NOTICE_TITLE, NOTICE_BODY, NOTICE_LINK]]);
  });

  it('has nothing to deliver without a channel', async () => {
    await expect(new CompositeNotifier([]).notify(NOTICE_TITLE, NOTICE_BODY, NOTICE_LINK)).resolves.toBeUndefined();
  });

  it('tries every channel when some fail, then throws one error listing the ones that failed', async () => {
    const before = new FailingChannel(new NotificationDeliveryError('Slack webhook answered HTTP 500', 500));
    const reached = new RecordingChannel();
    const after = new FailingChannel(new NotificationDeliveryError('System notification failed: notify-send is not installed or not on the PATH'));
    const delivery = new CompositeNotifier([channel('slack', before), channel('webhook', reached), channel('system', after)]).notify(NOTICE_TITLE, NOTICE_BODY, NOTICE_LINK);
    await expect(delivery).rejects.toBeInstanceOf(NotificationChannelsFailedError);
    await expect(delivery).rejects.toBeInstanceOf(NotificationDeliveryError);
    await expect(delivery).rejects.toMatchObject({
      message:
        'Notification not delivered on 2 of 3 channels: slack (Slack webhook answered HTTP 500); system (System notification failed: notify-send is not installed or not on the PATH)',
      failures: [
        { channel: 'slack', reason: 'Slack webhook answered HTTP 500' },
        { channel: 'system', reason: 'System notification failed: notify-send is not installed or not on the PATH' },
      ],
    });
    expect([before.attempts, reached.delivered.length, after.attempts]).toEqual([1, 1, 1]);
  });

  it('names a failure that is not a delivery error by its type only, so no address can leak through it', async () => {
    const leaking = new FailingChannel(new TypeError(`Invalid URL ${SECRET_WEBHOOK_URL}`));
    const delivery = new CompositeNotifier([channel('webhook', leaking)]).notify(NOTICE_TITLE, NOTICE_BODY, NOTICE_LINK);
    await expect(delivery).rejects.toMatchObject({ failures: [{ channel: 'webhook', reason: 'TypeError' }] });
    await expect(delivery).rejects.toMatchObject({ message: expect.not.stringContaining('SECRET') });
    const unknown = new CompositeNotifier([channel('odd', new FailingChannel(`raw ${SECRET_WEBHOOK_URL}`))]).notify(NOTICE_TITLE, NOTICE_BODY, NOTICE_LINK);
    await expect(unknown).rejects.toMatchObject({ failures: [{ channel: 'odd', reason: 'unknown error' }] });
  });

  it('starts every channel before waiting for any, so a slow one does not delay the others', async () => {
    const started: string[] = [];
    const release: (() => void)[] = [];
    const slow: Notifier = {
      notify: () => {
        started.push('slow');
        return new Promise((resolve) => release.push(resolve));
      },
    };
    const quick: Notifier = {
      notify: () => {
        started.push('quick');
        return Promise.resolve();
      },
    };
    const delivery = new CompositeNotifier([channel('slow', slow), channel('quick', quick)]).notify(NOTICE_TITLE, NOTICE_BODY, NOTICE_LINK);
    await Promise.resolve();
    expect(started).toEqual(['slow', 'quick']);
    release.forEach((resolve) => resolve());
    await expect(delivery).resolves.toBeUndefined();
  });

  it('reports a channel that throws before returning a promise', async () => {
    const throwing: Notifier = {
      notify: () => {
        throw new RangeError('no promise');
      },
    };
    const delivery = new CompositeNotifier([channel('odd', throwing)]).notify(NOTICE_TITLE, NOTICE_BODY, NOTICE_LINK);
    await expect(delivery).rejects.toMatchObject({ failures: [{ channel: 'odd', reason: 'RangeError' }] });
  });
});
