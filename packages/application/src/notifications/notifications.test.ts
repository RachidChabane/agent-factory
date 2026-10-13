import { describe, expect, it } from 'vitest';
import type { NoticeLink, Notifier } from '../ports.ts';
import { SteppingClock } from '../runs/test-support.ts';
import { DedupingNotifier } from './deduping-notifier.ts';
import { NOTICES, OperatorNotifications } from './operator-notifications.ts';

class RecordingNotifier implements Notifier {
  readonly sent: { title: string; body: string; link: string }[] = [];
  readonly media: (readonly NoticeLink[])[] = [];
  failures = 0;

  notify(title: string, body: string, link: string, media: readonly NoticeLink[] = []): Promise<void> {
    if (this.failures > 0) {
      this.failures -= 1;
      return Promise.reject(new Error('HTTP 500'));
    }
    this.sent.push({ title, body, link });
    this.media.push(media);
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

  it('tells the operator whether every channel took a notice', async () => {
    const inner = new RecordingNotifier();
    const notifications = new OperatorNotifications(inner, 'http://127.0.0.1:7430', { info: () => undefined, warn: () => undefined });
    expect(await notifications.send(NOTICES.needsHuman(1, 'stop'))).toBe(true);
    inner.failures = 1;
    expect(await notifications.send(NOTICES.needsHuman(2, 'stop'))).toBe(false);
  });

  it('hands the links of a notice to the channels, and tells two notices that differ only by a link apart', async () => {
    const inner = new RecordingNotifier();
    const notifier = new DedupingNotifier(inner, new SteppingClock(START), WINDOW_MS);
    const first = [{ label: 'tour · before · film.mp4', url: 'https://files.example.test/a' }];
    await notifier.notify('t', 'b', 'l', first);
    await notifier.notify('t', 'b', 'l', first);
    await notifier.notify('t', 'b', 'l', [{ label: 'tour · before · film.mp4', url: 'https://files.example.test/b' }]);
    expect(inner.media).toEqual([first, [{ label: 'tour · before · film.mp4', url: 'https://files.example.test/b' }]]);
  });

  it('words the notice that a pull request is ready, with its films and its links', () => {
    const media = [{ label: 'checkout-flow · after · film.mp4', url: 'https://files.example.test/after' }];
    expect(NOTICES.pullRequestReady({ issueNumber: 12, pullRequest: { number: 31, url: 'https://forge.example.test/pull/31', headSha: 'abc' }, title: 'feat(cart): show the badge', films: ['checkout-flow'], media })).toEqual({
      title: 'Pull request #31 is ready to merge',
      body: 'feat(cart): show the badge (issue #12). Every check of its head passed. Films recorded: checkout-flow. https://forge.example.test/pull/31',
      path: '/pull-requests/31',
      media,
    });
  });

  it('words the notice of a gesture the delegate made, with its reason and its rule', () => {
    expect(
      NOTICES.gestureDelegated({
        actor: 'orchestrator',
        gesture: 'merge',
        target: { kind: 'pull-request', number: 31 },
        issueNumber: 12,
        reason: 'a documentation change with a clean review',
        rule: 'autonomy.merge for docs',
      }),
    ).toEqual({
      title: 'orchestrator merged pull request #31',
      body: 'Reason: a documentation change with a clean review. Allowed by autonomy.merge for docs.',
      path: '/pull-requests/31',
    });
  });
});
