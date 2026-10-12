import { describe, expect, it } from 'vitest';
import * as adapters from './index.ts';

const NEW_EXPORTS: readonly string[] = [
  'BubblewrapCommandSandbox',
  'createCommandSandbox',
  'defaultWritableCacheDirectories',
  'UnsupportedPlatformError',
  'LinuxResourceGuard',
  'NodeProcFileReader',
  'createResourceGuard',
  'SlackNotifier',
  'WebhookNotifier',
  'SystemNotifier',
  'CompositeNotifier',
  'NotificationChannelsFailedError',
  'DeclarativeToolProber',
  'RoutingToolProber',
  'InvalidToolDeclarationError',
  'LayeredRolePromptCatalog',
  'RolePromptOverrideMissingError',
  'SourcesKnowledgePack',
];

const KEPT_EXPORTS: readonly string[] = [
  'SeatbeltCommandSandbox',
  'MacosResourceGuard',
  'ResourceProbeError',
  'GoogleChatNotifier',
  'NotificationDeliveryError',
  'CliToolProber',
  'DEFAULT_TOOL_PROBE_TIMEOUT_MS',
  'FileRolePromptCatalog',
  'FileKnowledgePack',
  'canonicalDirectory',
  'userTemporaryDirectories',
  'UnsafeSandboxPathError',
  'BUILT_IN_CREDENTIAL_PATHS',
];

describe('adapters public API', () => {
  it.each(NEW_EXPORTS)('exports %s', (name) => {
    expect(adapters).toHaveProperty(name);
  });

  it.each(KEPT_EXPORTS)('keeps exporting %s', (name) => {
    expect(adapters).toHaveProperty(name);
  });

  it('exports no keychain item for a vendor tool probe', () => {
    expect(adapters).not.toHaveProperty('FIGMA_KEYCHAIN_SERVICE');
  });
});
