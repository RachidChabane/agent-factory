import type { CommandResult, CommandRunner } from '@agent-factory/application';
import { describe, expect, it } from 'vitest';
import { OperatorSecretInventory, decodeKeychainValue, environmentSecrets } from './operator-secret-inventory.ts';

const HOME = '/Users/operator';

class KeychainStub implements CommandRunner {
  readonly calls: (readonly string[])[] = [];
  private readonly items: Readonly<Record<string, string>>;

  constructor(items: Readonly<Record<string, string>>) {
    this.items = items;
  }

  run(command: readonly string[]): Promise<CommandResult> {
    this.calls.push(command);
    const value = this.items[command[3] ?? ''];
    return Promise.resolve({ exitCode: value === undefined ? 44 : 0, stdout: value === undefined ? '' : `${value}\n`, stderr: '', durationMs: 1, timedOut: false });
  }
}

describe('environmentSecrets', () => {
  it('keeps the values of credential-like variables only', () => {
    expect(
      environmentSecrets({
        GH_TOKEN: 'a',
        KCP_PROD_APIKEY: 'b',
        AWS_SECRET_ACCESS_KEY: 'c',
        GOOGLE_CLOUD_PROJECT: 'project',
        SSH_AUTH_SOCK: '/private/tmp/agent.sock',
        NPM_REGISTRY_SECRET_NAME: 'registry-credentials',
        PATH: '/bin',
        EMPTY_TOKEN: '',
      }),
    ).toEqual([
      { source: 'environment variable GH_TOKEN', value: 'a' },
      { source: 'environment variable KCP_PROD_APIKEY', value: 'b' },
      { source: 'environment variable AWS_SECRET_ACCESS_KEY', value: 'c' },
    ]);
  });
});

describe('OperatorSecretInventory', () => {
  it('reads the configured keychain items and decodes the gh keyring encoding', async () => {
    const encoded = `go-keyring-base64:${Buffer.from('gh-value-123').toString('base64')}`;
    const runner = new KeychainStub({ 'figma-pat': 'figma-value-456', 'gh:github.com': encoded });
    const inventory = new OperatorSecretInventory(runner, { environment: { NPM_TOKEN: 'npm-value' }, keychainServices: ['figma-pat', 'gh:github.com', 'absent'], home: HOME });
    expect(await inventory.knownSecrets()).toEqual([
      { source: 'environment variable NPM_TOKEN', value: 'npm-value' },
      { source: 'keychain item figma-pat', value: 'figma-value-456' },
      { source: 'keychain item gh:github.com', value: 'gh-value-123' },
    ]);
    expect(runner.calls[0]).toEqual(['/usr/bin/security', 'find-generic-password', '-s', 'figma-pat', '-w']);
  });

  it('treats an unreadable keychain as holding nothing', async () => {
    const failing: CommandRunner = { run: () => Promise.reject(new Error('spawn EPERM')) };
    expect(await new OperatorSecretInventory(failing, { environment: {}, keychainServices: ['figma-pat'], home: HOME }).knownSecrets()).toEqual([]);
  });

  it('leaves plain keychain values untouched', () => {
    expect(decodeKeychainValue('plain')).toBe('plain');
  });
});
