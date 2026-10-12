import type { CommandRunner, KnownSecretSource } from '@agent-factory/application';
import type { KnownSecret } from '@agent-factory/domain';
import { KEYCHAIN_EXECUTABLE } from '../sandbox/credential-paths.ts';

export const CREDENTIAL_NAME_PATTERN =
  /(?:^|_)(?:TOKEN|SECRET|PASSWORD|PASSWD|PASSPHRASE|PAT|CREDENTIALS?|APIKEY|(?:API|APP|ACCESS|PRIVATE|SECRET|TOKEN|SIGNING|ENCRYPTION|MASTER)_?KEY)$/i;
export const GO_KEYRING_PREFIX = 'go-keyring-base64:';
export const DEFAULT_KEYCHAIN_SERVICES: readonly string[] = ['figma-pat', 'gh:github.com'];
export const KEYCHAIN_READ_TIMEOUT_MS = 5_000;
const FIND_GENERIC_PASSWORD = 'find-generic-password';
const SERVICE_FLAG = '-s';
const PASSWORD_ONLY_FLAG = '-w';
const SUCCESS_EXIT_CODE = 0;
const KEYCHAIN_PATH = '/usr/bin:/bin';
const BASE64 = 'base64';
const UTF8 = 'utf8';

export interface OperatorSecretInventorySettings {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly keychainServices: readonly string[];
  readonly home: string;
}

export function decodeKeychainValue(value: string): string {
  return value.startsWith(GO_KEYRING_PREFIX) ? Buffer.from(value.slice(GO_KEYRING_PREFIX.length), BASE64).toString(UTF8) : value;
}

export function environmentSecrets(environment: Readonly<Record<string, string | undefined>>): readonly KnownSecret[] {
  return Object.entries(environment).flatMap(([name, value]) =>
    value === undefined || value === '' || !CREDENTIAL_NAME_PATTERN.test(name) ? [] : [{ source: `environment variable ${name}`, value }],
  );
}

export class OperatorSecretInventory implements KnownSecretSource {
  private readonly runner: CommandRunner;
  private readonly settings: OperatorSecretInventorySettings;

  constructor(runner: CommandRunner, settings: OperatorSecretInventorySettings) {
    this.runner = runner;
    this.settings = settings;
  }

  async knownSecrets(): Promise<readonly KnownSecret[]> {
    const keychain = await Promise.all(this.settings.keychainServices.map((service) => this.keychainItem(service)));
    return [...environmentSecrets(this.settings.environment), ...keychain.flat()];
  }

  private async keychainItem(service: string): Promise<readonly KnownSecret[]> {
    try {
      const result = await this.runner.run(
        [KEYCHAIN_EXECUTABLE, FIND_GENERIC_PASSWORD, SERVICE_FLAG, service, PASSWORD_ONLY_FLAG],
        this.settings.home,
        KEYCHAIN_READ_TIMEOUT_MS,
        { PATH: KEYCHAIN_PATH, HOME: this.settings.home },
      );
      const value = result.stdout.trim();
      if (result.timedOut || result.exitCode !== SUCCESS_EXIT_CODE || value === '') return [];
      return [{ source: `keychain item ${service}`, value: decodeKeychainValue(value) }];
    } catch {
      return [];
    }
  }
}
