export class NotificationDeliveryError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'NotificationDeliveryError';
    this.status = status;
  }
}

export interface ChannelFailure {
  readonly channel: string;
  readonly reason: string;
}

function describeFailure(failure: ChannelFailure): string {
  return `${failure.channel} (${failure.reason})`;
}

export class NotificationChannelsFailedError extends NotificationDeliveryError {
  readonly failures: readonly ChannelFailure[];

  constructor(failures: readonly ChannelFailure[], channelCount: number) {
    super(`Notification not delivered on ${failures.length} of ${channelCount} channels: ${failures.map(describeFailure).join('; ')}`);
    this.name = 'NotificationChannelsFailedError';
    this.failures = failures;
  }
}
