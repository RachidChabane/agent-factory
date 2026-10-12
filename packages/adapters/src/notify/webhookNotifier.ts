import type { Notifier } from '@agent-factory/application';
import { postJson, type NotifyFetchFunction } from './webhookDelivery.ts';

const WEBHOOK_CHANNEL = 'Webhook';

export interface WebhookNotifierSettings {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly fetch: NotifyFetchFunction;
  readonly timeoutMs: number;
}

export interface WebhookPayload {
  readonly title: string;
  readonly body: string;
  readonly link: string;
}

export function buildWebhookPayload(title: string, body: string, link: string): WebhookPayload {
  return { title, body, link };
}

export class WebhookNotifier implements Notifier {
  private readonly settings: WebhookNotifierSettings;

  constructor(settings: WebhookNotifierSettings) {
    this.settings = settings;
  }

  notify(title: string, body: string, link: string): Promise<void> {
    return postJson(WEBHOOK_CHANNEL, this.settings, buildWebhookPayload(title, body, link));
  }
}
