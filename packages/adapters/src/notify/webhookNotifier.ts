import type { NoticeLink, Notifier } from '@agent-factory/application';
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
  /** The links a notice carries to files, each with the label it is shown under; empty for a notice that has none. */
  readonly links: readonly NoticeLink[];
}

export function buildWebhookPayload(title: string, body: string, link: string, media: readonly NoticeLink[] = []): WebhookPayload {
  return { title, body, link, links: media.map(({ label, url }) => ({ label, url })) };
}

export class WebhookNotifier implements Notifier {
  private readonly settings: WebhookNotifierSettings;

  constructor(settings: WebhookNotifierSettings) {
    this.settings = settings;
  }

  notify(title: string, body: string, link: string, media: readonly NoticeLink[] = []): Promise<void> {
    return postJson(WEBHOOK_CHANNEL, this.settings, buildWebhookPayload(title, body, link, media));
  }
}
