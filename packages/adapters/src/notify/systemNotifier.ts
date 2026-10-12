import type { CommandResult, CommandRunner, Notifier } from '@agent-factory/application';
import { isMissingExecutable } from '../process/errors.ts';
import { forPlatform, type PlatformTable } from '../platform/supported-platform.ts';
import { NotificationDeliveryError } from './errors.ts';

export const OSASCRIPT_EXECUTABLE = 'osascript';
export const NOTIFY_SEND_EXECUTABLE = 'notify-send';
export const NOTIFICATION_APPLICATION_NAME = 'agent-factory';
export const MAX_NOTIFICATION_TITLE_CHARACTERS = 200;
export const MAX_NOTIFICATION_BODY_CHARACTERS = 1_000;

const SCRIPT_FLAG = '-e';
const OPTIONS_END = '--';
const APPLICATION_NAME_OPTION = '--app-name';
const WORKING_DIRECTORY = '/';
const EXIT_CODE_OK = 0;
const ELLIPSIS = '…';
const LINE_BREAK = /\r\n|\r|\n/g;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const APPLESCRIPT_SPECIAL_CHARACTERS = /[\\"]/g;
const MARKUP_CHARACTERS = /[&<>]/g;
const MARKUP_ENTITIES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

interface NotificationTool {
  readonly executable: string;
  argumentsFor(title: string, body: string): readonly string[];
}

export interface SystemNotifierSettings {
  readonly platform: string;
  readonly runner: CommandRunner;
  readonly environment: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
}

function limited(text: string, limit: number): string {
  const characters = Array.from(text.replace(CONTROL_CHARACTERS, ''));
  return characters.length <= limit ? characters.join('') : `${characters.slice(0, limit - ELLIPSIS.length).join('')}${ELLIPSIS}`;
}

function onOneLine(text: string): string {
  return text.replace(LINE_BREAK, ' ');
}

export function escapeAppleScriptString(text: string): string {
  return text.replace(APPLESCRIPT_SPECIAL_CHARACTERS, '\\$&').replace(LINE_BREAK, '\\n');
}

export function appleScriptNotification(title: string, body: string): string {
  const text = escapeAppleScriptString(limited(body, MAX_NOTIFICATION_BODY_CHARACTERS));
  const heading = escapeAppleScriptString(onOneLine(limited(title, MAX_NOTIFICATION_TITLE_CHARACTERS)));
  return `display notification "${text}" with title "${heading}"`;
}

export function escapeNotificationMarkup(text: string): string {
  return text.replace(MARKUP_CHARACTERS, (character) => MARKUP_ENTITIES[character] ?? character);
}

const OSASCRIPT: NotificationTool = {
  executable: OSASCRIPT_EXECUTABLE,
  argumentsFor: (title, body) => [SCRIPT_FLAG, appleScriptNotification(title, body)],
};

const NOTIFY_SEND: NotificationTool = {
  executable: NOTIFY_SEND_EXECUTABLE,
  argumentsFor: (title, body) => [
    `${APPLICATION_NAME_OPTION}=${NOTIFICATION_APPLICATION_NAME}`,
    OPTIONS_END,
    onOneLine(limited(title, MAX_NOTIFICATION_TITLE_CHARACTERS)),
    escapeNotificationMarkup(limited(body, MAX_NOTIFICATION_BODY_CHARACTERS)),
  ],
};

const NOTIFICATION_TOOLS: PlatformTable<NotificationTool> = { darwin: OSASCRIPT, linux: NOTIFY_SEND };

/** Desktop toasts carry no link, neither to the cockpit nor to a notice's media: neither osascript nor notify-send can attach a click action to a notification. */
export class SystemNotifier implements Notifier {
  private readonly settings: SystemNotifierSettings;
  private readonly tool: NotificationTool;

  constructor(settings: SystemNotifierSettings) {
    this.settings = settings;
    this.tool = forPlatform(NOTIFICATION_TOOLS, settings.platform);
  }

  async notify(title: string, body: string): Promise<void> {
    const { executable } = this.tool;
    const result = await this.execute([executable, ...this.tool.argumentsFor(title, body)]);
    if (result.timedOut) throw new NotificationDeliveryError(`System notification failed: ${executable} did not finish within ${this.settings.timeoutMs} ms`);
    if (result.exitCode !== EXIT_CODE_OK) throw new NotificationDeliveryError(`System notification failed: ${executable} exited with code ${result.exitCode}`);
  }

  private async execute(command: readonly string[]): Promise<CommandResult> {
    try {
      return await this.settings.runner.run(command, WORKING_DIRECTORY, this.settings.timeoutMs, this.settings.environment);
    } catch (error) {
      const reason = isMissingExecutable(error) ? 'is not installed or not on the PATH' : 'could not be started';
      throw new NotificationDeliveryError(`System notification failed: ${this.tool.executable} ${reason}`);
    }
  }
}
