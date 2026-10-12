import type { NoticeLink, Notifier } from '@agent-factory/application';
import { NotificationChannelsFailedError, NotificationDeliveryError, type ChannelFailure } from './errors.ts';

const UNKNOWN_FAILURE = 'unknown error';

export interface NotificationChannel {
  readonly name: string;
  readonly notifier: Notifier;
}

function reasonOf(error: unknown): string {
  if (error instanceof NotificationDeliveryError) return error.message;
  return error instanceof Error ? error.name : UNKNOWN_FAILURE;
}

async function deliver(channel: NotificationChannel, title: string, body: string, link: string, media: readonly NoticeLink[]): Promise<ChannelFailure | null> {
  try {
    await channel.notifier.notify(title, body, link, media);
    return null;
  } catch (error) {
    return { channel: channel.name, reason: reasonOf(error) };
  }
}

export class CompositeNotifier implements Notifier {
  private readonly channels: readonly NotificationChannel[];

  constructor(channels: readonly NotificationChannel[]) {
    this.channels = channels;
  }

  async notify(title: string, body: string, link: string, media: readonly NoticeLink[] = []): Promise<void> {
    const outcomes = await Promise.all(this.channels.map((channel) => deliver(channel, title, body, link, media)));
    const failures = outcomes.filter((outcome) => outcome !== null);
    if (failures.length > 0) throw new NotificationChannelsFailedError(failures, this.channels.length);
  }
}
