import type { Notifier } from '@agent-factory/application';
import { NotificationDeliveryError } from './errors.ts';

export const GOOGLE_CHAT_CONTENT_TYPE = 'application/json; charset=UTF-8';
export const GOOGLE_CHAT_CARD_ID = 'factory-notification';
export const GOOGLE_CHAT_OPEN_BUTTON_LABEL = 'Open in cockpit';
export const HTTP_SUCCESS_MIN = 200;
export const HTTP_SUCCESS_MAX_EXCLUSIVE = 300;

export type NotifyFetchFunction = (
  url: string,
  init: {
    readonly method: 'POST';
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly signal: AbortSignal;
  },
) => Promise<{ readonly status: number }>;

export interface GoogleChatNotifierSettings {
  readonly webhookUrl: string;
  readonly fetch: NotifyFetchFunction;
  readonly timeoutMs: number;
}

export interface GoogleChatMessage {
  readonly text: string;
  readonly cardsV2: readonly [
    {
      readonly cardId: string;
      readonly card: {
        readonly header: { readonly title: string };
        readonly sections: readonly [
          {
            readonly widgets: readonly [
              { readonly textParagraph: { readonly text: string } },
              {
                readonly buttonList: {
                  readonly buttons: readonly [
                    { readonly text: string; readonly onClick: { readonly openLink: { readonly url: string } } },
                  ];
                };
              },
            ];
          },
        ];
      };
    },
  ];
}

export function buildGoogleChatMessage(title: string, body: string, link: string): GoogleChatMessage {
  return {
    text: title,
    cardsV2: [
      {
        cardId: GOOGLE_CHAT_CARD_ID,
        card: {
          header: { title },
          sections: [
            {
              widgets: [
                { textParagraph: { text: body } },
                {
                  buttonList: {
                    buttons: [{ text: GOOGLE_CHAT_OPEN_BUTTON_LABEL, onClick: { openLink: { url: link } } }],
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

function isSuccessStatus(status: number): boolean {
  return status >= HTTP_SUCCESS_MIN && status < HTTP_SUCCESS_MAX_EXCLUSIVE;
}

export class GoogleChatNotifier implements Notifier {
  private readonly settings: GoogleChatNotifierSettings;

  constructor(settings: GoogleChatNotifierSettings) {
    this.settings = settings;
  }

  async notify(title: string, body: string, link: string): Promise<void> {
    const status = await this.post(JSON.stringify(buildGoogleChatMessage(title, body, link)));
    if (!isSuccessStatus(status)) {
      throw new NotificationDeliveryError(`Google Chat webhook answered HTTP ${status}`, status);
    }
  }

  private async post(body: string): Promise<number> {
    try {
      const response = await this.settings.fetch(this.settings.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': GOOGLE_CHAT_CONTENT_TYPE },
        body,
        signal: AbortSignal.timeout(this.settings.timeoutMs),
      });
      return response.status;
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'unknown error';
      throw new NotificationDeliveryError(`Google Chat webhook request failed: ${reason}`);
    }
  }
}
