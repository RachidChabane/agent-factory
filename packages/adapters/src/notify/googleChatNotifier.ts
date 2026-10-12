import type { Notifier } from '@agent-factory/application';
import { OPEN_IN_COCKPIT_LABEL, postJson, type NotifyFetchFunction } from './webhookDelivery.ts';

export const GOOGLE_CHAT_CARD_ID = 'factory-notification';

const GOOGLE_CHAT_CHANNEL = 'Google Chat webhook';
const NO_EXTRA_HEADERS: Readonly<Record<string, string>> = {};

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
                    buttons: [{ text: OPEN_IN_COCKPIT_LABEL, onClick: { openLink: { url: link } } }],
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

export class GoogleChatNotifier implements Notifier {
  private readonly settings: GoogleChatNotifierSettings;

  constructor(settings: GoogleChatNotifierSettings) {
    this.settings = settings;
  }

  notify(title: string, body: string, link: string): Promise<void> {
    const endpoint = { url: this.settings.webhookUrl, headers: NO_EXTRA_HEADERS, fetch: this.settings.fetch, timeoutMs: this.settings.timeoutMs };
    return postJson(GOOGLE_CHAT_CHANNEL, endpoint, buildGoogleChatMessage(title, body, link));
  }
}
