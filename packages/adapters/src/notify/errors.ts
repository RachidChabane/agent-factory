export class NotificationDeliveryError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'NotificationDeliveryError';
    this.status = status;
  }
}
