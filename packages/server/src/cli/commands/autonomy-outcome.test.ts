import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { parseAgentFactoryConfig, projectOf, type AgentFactoryConfig } from '../../config/agent-factory-config.ts';
import { notificationsOutcome, projectChecks } from './validation-checks.ts';

const USER_HOME = '/Users/operator';
const HOME = `${USER_HOME}/.agent-factory`;
const SETTINGS = { runner: { run: () => Promise.reject(new Error('not used')) }, environment: {}, platform: 'darwin', home: USER_HOME };

function configWith(project: Record<string, unknown>, installation: Record<string, unknown> = {}): AgentFactoryConfig {
  return parseAgentFactoryConfig(
    stringify({
      version: 1,
      ...installation,
      projects: [{ id: 'storefront', name: 'Storefront', forge: { kind: 'local', repository: 'example-org/storefront' }, commitIdentity: { name: 'Bot', email: 'bot@example.invalid' }, ...project }],
    }),
    HOME,
    `${HOME}/config.yaml`,
    USER_HOME,
  );
}

async function autonomyLine(config: AgentFactoryConfig) {
  const check = projectChecks(config, projectOf(config, 'storefront'), SETTINGS).find((candidate) => candidate.name === 'autonomy');
  if (check === undefined) throw new Error('validate has no autonomy line');
  return { severity: check.severity, runsCommands: check.runsCommands, outcome: await check.run() };
}

describe('the autonomy line of validate', () => {
  it('says that nothing is delegated when the project declares no autonomy', async () => {
    expect(await autonomyLine(configWith({}))).toEqual({
      severity: 'optional',
      runsCommands: false,
      outcome: { ok: true, detail: `nothing is delegated: every gesture stays the operator's (the delegate would be "orchestrator")` },
    });
  });

  it('says in one sentence what is delegated to whom', async () => {
    const config = configWith({ autonomy: { actor: 'release-bot', validateSpecs: true, merge: [{ types: ['docs'], requires: ['films-recorded'] }] } });
    expect((await autonomyLine(config)).outcome.detail).toBe(
      "release-bot may validate specs and merge the pull requests of docs issues once films-recorded holds; every other gesture stays the operator's",
    );
  });

  it('runs offline, since it reads the file alone', async () => {
    expect((await autonomyLine(configWith({}))).runsCommands).toBe(false);
  });
});

describe('the notifications line of validate', () => {
  const environment = { HOOK: 'https://hooks.example.invalid/abc' };

  it('says that the upload command runs outside the sandbox, with the operator\'s environment', () => {
    const config = configWith({}, { notifications: { channels: [{ kind: 'slack', webhookUrl: { fromEnvironment: 'HOOK' } }], media: { upload: ['share-file', '--public', '{file}'], timeoutSeconds: 90 } } });
    expect(notificationsOutcome(config, environment)).toEqual({
      ok: true,
      detail:
        'slack; the upload command share-file --public {file} runs outside the sandbox, with your environment and your sessions, like one of your own scripts: declare only a command you trust; it stops after 90 seconds',
    });
  });

  it('keeps the line as it was without an upload command', () => {
    const config = configWith({}, { notifications: { channels: [{ kind: 'slack', webhookUrl: { fromEnvironment: 'HOOK' } }] } });
    expect(notificationsOutcome(config, environment)).toEqual({ ok: true, detail: 'slack' });
  });

  it('still says what the upload command may do when no channel is configured', () => {
    const config = configWith({}, { notifications: { media: { upload: ['share-file', '{file}'] } } });
    expect(notificationsOutcome(config, {}).detail).toBe(
      'no channel configured; notices appear only in the cockpit; the upload command share-file {file} runs outside the sandbox, with your environment and your sessions, like one of your own scripts: declare only a command you trust; it stops after 120 seconds',
    );
  });

  it('keeps reporting a channel whose secret is missing', () => {
    const config = configWith({}, { notifications: { channels: [{ kind: 'slack', webhookUrl: { fromEnvironment: 'HOOK' } }], media: { upload: ['share-file', '{file}'] } } });
    const outcome = notificationsOutcome(config, {});
    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toContain('slack: HOOK is not set');
    expect(outcome.detail).toContain('notices would not be sent');
  });
});
