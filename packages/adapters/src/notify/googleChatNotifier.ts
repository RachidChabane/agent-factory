import type { NoticeLink, Notifier } from '@agent-factory/application';
import { hiddenLinksText, renderedMediaLinks } from './mediaLinks.ts';
import { OPEN_IN_COCKPIT_LABEL, postJson, type NotifyFetchFunction } from './webhookDelivery.ts';

export const GOOGLE_CHAT_CARD_ID = 'factory-notification';

const GOOGLE_CHAT_CHANNEL = 'Google Chat webhook';
const NO_EXTRA_HEADERS: Readonly<Record<string, string>> = {};
const MARKUP_CHARACTERS = /[&<>"]/g;
const MARKUP_ENTITIES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const LINE_BREAK = '<br>';

export interface GoogleChatNotifierSettings {
  readonly webhookUrl: string;
  readonly fetch: NotifyFetchFunction;
  readonly timeoutMs: number;
}

export interface GoogleChatTextWidget {
  readonly textParagraph: { readonly text: string };
}

export interface GoogleChatButtonWidget {
  readonly buttonList: {
    readonly buttons: readonly [{ readonly text: string; readonly onClick: { readonly openLink: { readonly url: string } } }];
  };
}

/** The body, then the links of the notice's media when it has some, then the button to the cockpit. */
export interface GoogleChatMessage {
  readonly text: string;
  readonly cardsV2: readonly [
    {
      readonly cardId: string;
      readonly card: {
        readonly header: { readonly title: string };
        readonly sections: readonly [
          {
            readonly widgets: readonly [GoogleChatTextWidget, GoogleChatButtonWidget] | readonly [GoogleChatTextWidget, GoogleChatTextWidget, GoogleChatButtonWidget];
          },
        ];
      };
    },
  ];
}

export function escapeGoogleChatMarkup(text: string): string {
  return text.replace(MARKUP_CHARACTERS, (character) => MARKUP_ENTITIES[character] ?? character);
}

function linksWidget(media: readonly NoticeLink[]): GoogleChatTextWidget {
  const { shown, hidden } = renderedMediaLinks(media);
  const lines = [...shown.map((link) => `<a href="${escapeGoogleChatMarkup(link.url)}">${escapeGoogleChatMarkup(link.label)}</a>`), ...(hidden === 0 ? [] : [hiddenLinksText(hidden)])];
  return { textParagraph: { text: lines.join(LINE_BREAK) } };
}

export function buildGoogleChatMessage(title: string, body: string, link: string, media: readonly NoticeLink[] = []): GoogleChatMessage {
  const text: GoogleChatTextWidget = { textParagraph: { text: body } };
  const button: GoogleChatButtonWidget = { buttonList: { buttons: [{ text: OPEN_IN_COCKPIT_LABEL, onClick: { openLink: { url: link } } }] } };
  return {
    text: title,
    cardsV2: [{ cardId: GOOGLE_CHAT_CARD_ID, card: { header: { title }, sections: [{ widgets: media.length === 0 ? [text, button] : [text, linksWidget(media), button] }] } }],
  };
}

export class GoogleChatNotifier implements Notifier {
  private readonly settings: GoogleChatNotifierSettings;

  constructor(settings: GoogleChatNotifierSettings) {
    this.settings = settings;
  }

  notify(title: string, body: string, link: string, media: readonly NoticeLink[] = []): Promise<void> {
    const endpoint = { url: this.settings.webhookUrl, headers: NO_EXTRA_HEADERS, fetch: this.settings.fetch, timeoutMs: this.settings.timeoutMs };
    return postJson(GOOGLE_CHAT_CHANNEL, endpoint, buildGoogleChatMessage(title, body, link, media));
  }
}
