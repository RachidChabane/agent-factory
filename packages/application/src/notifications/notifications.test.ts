import { describe, expect, it } from 'vitest';
import type { Notifier } from '../ports.ts';
import { SteppingClock } from '../runs/test-support.ts';
import { DedupingNotifier } from './deduping-notifier.ts';
import { NOTICES, OperatorNotifications } from './operator-notifications.ts';

class RecordingNotifier implements Notifier {
  readonly sent: { title: string; body: string; link: string }[] = [];
  failures = 0;

  notify(title: string, body: string, link: string): Promise<void> {
    if (this.failures > 0) {
      this.failures -= 1;
      return Promise.reject(new Error('HTTP 500'));
    }
    this.sent.push({ title, body, link });
    return Promise.resolve();
  }
}

const START = new Date('2026-10-10T12:00:00Z');
const WINDOW_MS = 60_000;

describe('operator notifications', () => {
  it('drops an identical notification inside the window and sends it again after', async () => {
    const inner = new RecordingNotifier();
    const clock = new SteppingClock(START);
    const notifier = new DedupingNotifier(inner, clock, WINDOW_MS);
    await notifier.notify('t', 'b', 'l');
    await notifier.notify('t', 'b', 'l');
    await notifier.notify('t', 'other', 'l');
    clock.set(new Date(START.getTime() + WINDOW_MS));
    await notifier.notify('t', 'b', 'l');
    expect(inner.sent.map((entry) => entry.body)).toEqual(['b', 'other', 'b']);
  });

  it('retries a notification whose delivery failed', async () => {
    const inner = new RecordingNotifier();
    inner.failures = 1;
    const notifier = new DedupingNotifier(inner, new SteppingClock(START), WINDOW_MS);
    await expect(notifier.notify('t', 'b', 'l')).rejects.toThrow('HTTP 500');
    await notifier.notify('t', 'b', 'l');
    expect(inner.sent).toHaveLength(1);
  });

  it('links every notice into the cockpit and never lets a delivery failure escape', async () => {
    const inner = new RecordingNotifier();
    const warnings: string[] = [];
    const notifications = new OperatorNotifications(inner, 'http://127.0.0.1:7430/', { info: () => undefined, warn: (line) => warnings.push(line) });
    await notifications.send(NOTICES.needsHuman(42, 'the before proof is not valid'));
    await notifications.send(NOTICES.auditConcluded('abcdef0123', 'challenge', 'No test covers the patch.'));
    await notifications.send(NOTICES.releaseGate('app-v1.2.0', false, ['PREP health check ui failed']));
    expect(inner.sent).toEqual([
      { title: 'Issue #42 needs you', body: 'the before proof is not valid', link: 'http://127.0.0.1:7430/issues/42' },
      { title: 'Audit of abcdef0 concluded: challenge', body: 'No test covers the patch.', link: 'http://127.0.0.1:7430/audits/abcdef0123' },
      { title: 'Release app-v1.2.0 is blocked', body: '- PREP health check ui failed', link: 'http://127.0.0.1:7430/releases/app-v1.2.0' },
    ]);
    inner.failures = 1;
    await notifications.send(NOTICES.paused('budget', 'seven_day window at 90%', new Date('2026-10-12T00:00:00Z')));
    expect(warnings[0]).toContain('was not delivered: HTTP 500');
  });
});
