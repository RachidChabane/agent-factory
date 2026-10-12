import type { NoticeLink, Notifier } from '@agent-factory/application';
import { hiddenLinksText, renderedMediaLinks } from './mediaLinks.ts';
import { OPEN_IN_COCKPIT_LABEL, postJson, type NotifyFetchFunction } from './webhookDelivery.ts';

export const SLACK_SECTION_TEXT_LIMIT = 3_000;

const SLACK_CHANNEL = 'Slack webhook';
const NO_EXTRA_HEADERS: Readonly<Record<string, string>> = {};
const ELLIPSIS = '…';
const INCOMPLETE_ENTITY = /&(?:amp|am|a|lt|l|gt|g)?$/;
const SLACK_CONTROL_CHARACTERS = /[&<>]/g;
const LINK_UNSAFE_CHARACTERS = /[|\s]/g;
const LINE_SEPARATOR = '\n';
const BULLET = '• ';
const SLACK_ENTITIES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

export interface SlackNotifierSettings {
  readonly webhookUrl: string;
  readonly fetch: NotifyFetchFunction;
  readonly timeoutMs: number;
}

export interface SlackSection {
  readonly type: 'section';
  readonly text: { readonly type: 'mrkdwn'; readonly text: string };
}

export interface SlackActions {
  readonly type: 'actions';
  readonly elements: readonly [{ readonly type: 'button'; readonly text: { readonly type: 'plain_text'; readonly text: string }; readonly url: string }];
}

/** The body, then the links of the notice's media when it has some, then the button to the cockpit. */
export interface SlackMessage {
  readonly text: string;
  readonly blocks: readonly [SlackSection, SlackActions] | readonly [SlackSection, SlackSection, SlackActions];
}

export function escapeSlackText(text: string): string {
  return text.replace(SLACK_CONTROL_CHARACTERS, (character) => SLACK_ENTITIES[character] ?? character);
}

function truncated(text: string, limit: number): string {
  const characters = Array.from(text);
  if (characters.length <= limit) return text;
  return `${characters.slice(0, limit - ELLIPSIS.length).join('').replace(INCOMPLETE_ENTITY, '')}${ELLIPSIS}`;
}

function slackLink(link: NoticeLink): string {
  const address = escapeSlackText(link.url.replace(LINK_UNSAFE_CHARACTERS, encodeURIComponent));
  return `${BULLET}<${address}|${escapeSlackText(link.label)}>`;
}

function linksSection(media: readonly NoticeLink[]): SlackSection {
  const { shown, hidden } = renderedMediaLinks(media);
  const lines = [...shown.map(slackLink), ...(hidden === 0 ? [] : [`${BULLET}${hiddenLinksText(hidden)}`])];
  return { type: 'section', text: { type: 'mrkdwn', text: truncated(lines.join(LINE_SEPARATOR), SLACK_SECTION_TEXT_LIMIT) } };
}

export function buildSlackMessage(title: string, body: string, link: string, media: readonly NoticeLink[] = []): SlackMessage {
  const heading = escapeSlackText(title);
  const section: SlackSection = { type: 'section', text: { type: 'mrkdwn', text: truncated(`*${heading}*\n${escapeSlackText(body)}`, SLACK_SECTION_TEXT_LIMIT) } };
  const actions: SlackActions = { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: OPEN_IN_COCKPIT_LABEL }, url: link }] };
  return { text: heading, blocks: media.length === 0 ? [section, actions] : [section, linksSection(media), actions] };
}

export class SlackNotifier implements Notifier {
  private readonly settings: SlackNotifierSettings;

  constructor(settings: SlackNotifierSettings) {
    this.settings = settings;
  }

  notify(title: string, body: string, link: string, media: readonly NoticeLink[] = []): Promise<void> {
    const endpoint = { url: this.settings.webhookUrl, headers: NO_EXTRA_HEADERS, fetch: this.settings.fetch, timeoutMs: this.settings.timeoutMs };
    return postJson(SLACK_CHANNEL, endpoint, buildSlackMessage(title, body, link, media));
  }
}
