import type { Clock, NoticeLink, Notifier } from '../ports.ts';

const KEY_SEPARATOR = '\u0000';
const NO_MEDIA: readonly NoticeLink[] = [];

export class DedupingNotifier implements Notifier {
  private readonly inner: Notifier;
  private readonly clock: Clock;
  private readonly windowMs: number;
  private readonly sentAt = new Map<string, number>();

  constructor(inner: Notifier, clock: Clock, windowMs: number) {
    this.inner = inner;
    this.clock = clock;
    this.windowMs = windowMs;
  }

  async notify(title: string, body: string, link: string, media: readonly NoticeLink[] = NO_MEDIA): Promise<void> {
    const now = this.clock.now().getTime();
    this.forgetExpired(now);
    const key = [title, body, link, ...media.flatMap((item) => [item.label, item.url])].join(KEY_SEPARATOR);
    if (this.sentAt.has(key)) return;
    this.sentAt.set(key, now);
    try {
      await this.inner.notify(title, body, link, media);
    } catch (error) {
      this.sentAt.delete(key);
      throw error;
    }
  }

  private forgetExpired(now: number): void {
    for (const [key, sentAt] of this.sentAt) {
      if (now - sentAt >= this.windowMs) this.sentAt.delete(key);
    }
  }
}
