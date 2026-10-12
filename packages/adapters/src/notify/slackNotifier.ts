import type { Notifier } from '@agent-factory/application';
import { OPEN_IN_COCKPIT_LABEL, postJson, type NotifyFetchFunction } from './webhookDelivery.ts';

export const SLACK_SECTION_TEXT_LIMIT = 3_000;

const SLACK_CHANNEL = 'Slack webhook';
const NO_EXTRA_HEADERS: Readonly<Record<string, string>> = {};
const ELLIPSIS = '…';
const INCOMPLETE_ENTITY = /&(?:amp|am|a|lt|l|gt|g)?$/;
const SLACK_CONTROL_CHARACTERS = /[&<>]/g;
const SLACK_ENTITIES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

export interface SlackNotifierSettings {
  readonly webhookUrl: string;
  readonly fetch: NotifyFetchFunction;
  readonly timeoutMs: number;
}

export interface SlackMessage {
  readonly text: string;
  readonly blocks: readonly [
    { readonly type: 'section'; readonly text: { readonly type: 'mrkdwn'; readonly text: string } },
    {
      readonly type: 'actions';
      readonly elements: readonly [
        { readonly type: 'button'; readonly text: { readonly type: 'plain_text'; readonly text: string }; readonly url: string },
      ];
    },
  ];
}

export function escapeSlackText(text: string): string {
  return text.replace(SLACK_CONTROL_CHARACTERS, (character) => SLACK_ENTITIES[character] ?? character);
}

function truncated(text: string, limit: number): string {
  const characters = Array.from(text);
  if (characters.length <= limit) return text;
  return `${characters.slice(0, limit - ELLIPSIS.length).join('').replace(INCOMPLETE_ENTITY, '')}${ELLIPSIS}`;
}

export function buildSlackMessage(title: string, body: string, link: string): SlackMessage {
  const heading = escapeSlackText(title);
  return {
    text: heading,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: truncated(`*${heading}*\n${escapeSlackText(body)}`, SLACK_SECTION_TEXT_LIMIT) } },
      { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: OPEN_IN_COCKPIT_LABEL }, url: link }] },
    ],
  };
}

export class SlackNotifier implements Notifier {
  private readonly settings: SlackNotifierSettings;

  constructor(settings: SlackNotifierSettings) {
    this.settings = settings;
  }

  notify(title: string, body: string, link: string): Promise<void> {
    const endpoint = { url: this.settings.webhookUrl, headers: NO_EXTRA_HEADERS, fetch: this.settings.fetch, timeoutMs: this.settings.timeoutMs };
    return postJson(SLACK_CHANNEL, endpoint, buildSlackMessage(title, body, link));
  }
}
