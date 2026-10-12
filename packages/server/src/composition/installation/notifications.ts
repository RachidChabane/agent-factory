import {
  CompositeNotifier,
  GoogleChatNotifier,
  NoopNotifier,
  SlackNotifier,
  SystemNotifier,
  WebhookNotifier,
  type NotificationChannel,
  type NotifyFetchFunction,
} from '@agent-factory/adapters';
import { DedupingNotifier, type Clock, type CommandRunner, type Notifier } from '@agent-factory/application';
import type { AgentFactoryConfig, HeaderValue, NotificationChannelConfig } from '../../config/agent-factory-config.ts';
import type { SourceEnvironment } from './installation-context.ts';

export const NOTIFICATION_TIMEOUT_MS = 10_000;

export interface NotificationSettings {
  readonly platform: string;
  readonly runner: CommandRunner;
  readonly environment: SourceEnvironment;
  readonly fetch: NotifyFetchFunction;
  readonly clock: Clock;
}

function variable(environment: SourceEnvironment, name: string): string | null {
  const value = environment[name];
  return value === undefined || value === '' ? null : value;
}

function definedEnvironment(environment: SourceEnvironment): Record<string, string> {
  return Object.fromEntries(Object.entries(environment).flatMap(([name, value]) => (value === undefined ? [] : [[name, value]])));
}

function headerValues(headers: Readonly<Record<string, HeaderValue>>, environment: SourceEnvironment): Readonly<Record<string, string>> | null {
  const resolved: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const text = value.kind === 'literal' ? value.value : variable(environment, value.variable);
    if (text === null) return null;
    resolved[name] = text;
  }
  return resolved;
}

/** Whether a channel has what it needs: the environment variables that hold its secrets are set. */
export function isChannelConfigured(channel: NotificationChannelConfig, environment: SourceEnvironment): boolean {
  switch (channel.kind) {
    case 'system':
      return true;
    case 'google-chat':
    case 'slack':
      return variable(environment, channel.webhookVariable) !== null;
    case 'webhook':
      return variable(environment, channel.urlVariable) !== null && headerValues(channel.headers, environment) !== null;
  }
}

function channelNotifier(channel: NotificationChannelConfig, settings: NotificationSettings): Notifier | null {
  const { environment, fetch } = settings;
  const timeoutMs = NOTIFICATION_TIMEOUT_MS;
  switch (channel.kind) {
    case 'system':
      return new SystemNotifier({ platform: settings.platform, runner: settings.runner, environment: definedEnvironment(environment), timeoutMs });
    case 'google-chat': {
      const webhookUrl = variable(environment, channel.webhookVariable);
      return webhookUrl === null ? null : new GoogleChatNotifier({ webhookUrl, fetch, timeoutMs });
    }
    case 'slack': {
      const webhookUrl = variable(environment, channel.webhookVariable);
      return webhookUrl === null ? null : new SlackNotifier({ webhookUrl, fetch, timeoutMs });
    }
    case 'webhook': {
      const url = variable(environment, channel.urlVariable);
      const headers = headerValues(channel.headers, environment);
      return url === null || headers === null ? null : new WebhookNotifier({ url, headers, fetch, timeoutMs });
    }
  }
}

/** Every configured channel that has its secrets, behind one notifier that sends a notice once per window. */
export function installationNotifier(config: AgentFactoryConfig, settings: NotificationSettings): Notifier {
  const channels: NotificationChannel[] = config.notifications.channels.flatMap((channel) => {
    const notifier = channelNotifier(channel, settings);
    return notifier === null ? [] : [{ name: channel.kind, notifier }];
  });
  const delivered: Notifier = channels.length === 0 ? new NoopNotifier() : new CompositeNotifier(channels);
  return new DedupingNotifier(delivered, settings.clock, config.notifications.dedupeWindowMs);
}
