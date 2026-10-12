import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { configProblems, parseAgentFactoryConfig, projectOf, UnknownProjectError } from './agent-factory-config.ts';

const HOME = '/home/operator/.agent-factory';
const USER_HOME = '/home/operator';
const CONFIG_PATH = `${HOME}/config.yaml`;

function minimalProject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'storefront',
    name: 'Storefront',
    forge: { kind: 'github', repository: 'example-org/storefront' },
    commitIdentity: { name: 'Example Factory', email: 'factory@example.invalid' },
    ...overrides,
  };
}

function document(overrides: Record<string, unknown> = {}, projects: readonly Record<string, unknown>[] = [minimalProject()]): Record<string, unknown> {
  return { version: 1, ...overrides, projects };
}

function parse(value: Record<string, unknown>) {
  return parseAgentFactoryConfig(stringify(value), HOME, CONFIG_PATH, USER_HOME);
}

describe('the configuration of an installation', () => {
  it('fills every installation default for a minimal file', () => {
    const config = parse(document());
    expect(config.server).toEqual({ host: '127.0.0.1', port: 7430, publicUrl: 'http://127.0.0.1:7430', remoteAccess: { kind: 'none' } });
    expect(config.budget).toEqual({
      thresholds: { session: 0.9, weekly_all: 0.85, weekly_scoped: 0.85 },
      dailyCap: { kind: 'none' },
      perRunCapUsd: null,
    });
    expect(config.resources).toEqual({ minimumFreeMemoryPercent: 40, pauseAbovePressure: 'normal', maxConcurrentRuns: 1 });
    expect(config.claude.usage).toEqual({ refreshMs: 600_000, staleAfterMs: 1_800_000 });
    expect(config.directories).toEqual({
      state: `${HOME}/state`,
      runs: `${HOME}/runs`,
      logs: `${HOME}/logs`,
      runLogs: `${HOME}/logs/runs`,
      cache: `${HOME}/cache`,
    });
  });

  it('reads a daily cap as an amount, and none as no cap', () => {
    expect(parse(document({ budget: { dailyCapUsd: 150 } })).budget.dailyCap).toEqual({ kind: 'usd', amount: 150 });
    expect(parse(document({ budget: { dailyCapUsd: 'none' } })).budget.dailyCap).toEqual({ kind: 'none' });
  });

  it('refuses a daily cap of zero, which would be ambiguous', () => {
    expect(configProblems(document({ budget: { dailyCapUsd: 0 } }))).toEqual([expect.stringMatching(/^budget\.dailyCapUsd: /)]);
  });

  it('resolves account directories against the home directory and keeps their billing', () => {
    const config = parse(document({ claude: { accounts: [{ name: 'primary', configDir: '~/.claude-primary' }, { name: 'api', configDir: '/opt/claude', billing: 'api-key' }] } }));
    expect(config.claude.accounts).toEqual([
      { name: 'primary', configDir: '/home/operator/.claude-primary', billing: 'subscription' },
      { name: 'api', configDir: '/opt/claude', billing: 'api-key' },
    ]);
  });

  it('turns notification channels into the environment variables that hold their secrets', () => {
    const config = parse(
      document({
        notifications: {
          channels: [
            { kind: 'system' },
            { kind: 'slack', webhookUrl: { fromEnvironment: 'TEAM_SLACK_HOOK' } },
            { kind: 'webhook', url: { fromEnvironment: 'HOOK_URL' }, headers: { 'X-Team': 'factory', Authorization: { fromEnvironment: 'HOOK_AUTH' } } },
          ],
        },
      }),
    );
    expect(config.notifications.channels).toEqual([
      { kind: 'system' },
      { kind: 'slack', webhookVariable: 'TEAM_SLACK_HOOK' },
      { kind: 'webhook', urlVariable: 'HOOK_URL', headers: { 'X-Team': { kind: 'literal', value: 'factory' }, Authorization: { kind: 'environment', variable: 'HOOK_AUTH' } } },
    ]);
  });

  it('names the key and the problem of every invalid value', () => {
    const problems = configProblems(
      document({ server: { port: 70_000 } }, [minimalProject({ id: 'Store Front', concurrency: { issues: 4, ceiling: 3 } })]),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^server\.port: /),
        expect.stringMatching(/^projects\.0\.id: must be lowercase letters, digits and dashes/),
        'projects.0.concurrency.issues: must not exceed concurrency.ceiling',
      ]),
    );
  });

  it('refuses two projects with the same id', () => {
    expect(configProblems(document({}, [minimalProject(), minimalProject()]))).toContain('projects: project storefront is declared twice');
  });

  it('refuses a secret written in the file instead of an environment variable reference', () => {
    expect(configProblems(document({ notifications: { channels: [{ kind: 'slack', webhookUrl: 'https://hooks.example.com/x' }] } }))).toEqual([
      expect.stringMatching(/^notifications\.channels\.0\.webhookUrl: /),
    ]);
  });

  it('refuses a credential-looking variable in the check environment', () => {
    expect(configProblems(document({ defaults: { environment: { set: { NPM_TOKEN: 'x' } } } }))).toEqual([
      expect.stringMatching(/^defaults\.environment\.set\.NPM_TOKEN: looks like a credential/),
    ]);
  });
});

describe('the configuration of a project', () => {
  it('places every project directory under projects/<id> and resolves relative paths there', () => {
    const project = projectOf(parse(document()), 'storefront');
    expect(project.directory).toBe(`${HOME}/projects/storefront`);
    expect(project.clonePath).toBe(`${HOME}/projects/storefront/clone`);
    expect(project.worktreePool).toEqual({ directory: `${HOME}/projects/storefront/worktrees`, size: 3 });
    expect(project.directories.evidence).toBe(`${HOME}/projects/storefront/evidence`);
    expect(project.repository).toEqual({ owner: 'example-org', name: 'storefront' });
  });

  it('locates the bare repository of a local forge inside the project', () => {
    const project = projectOf(parse(document({}, [minimalProject({ forge: { kind: 'local', repository: 'example-org/storefront' } })])), 'storefront');
    expect(project.forge).toEqual({ kind: 'local', directory: `${HOME}/projects/storefront/forge`, bareRepositoryPath: `${HOME}/projects/storefront/forge/storefront.git`, checks: 'none' });
  });

  it('merges role overrides field by field over the installation defaults', () => {
    const project = projectOf(parse(document({}, [minimalProject({ roles: { implementer: { model: 'sonnet', maxTurns: 200 } } })])), 'storefront');
    expect(project.roles.implementer).toEqual({ model: 'sonnet', effort: 'low', maxBudgetUsd: 10, maxTurns: 200, timeoutMs: 3_600_000, escalation: { model: 'opus', effort: 'high' } });
    expect(project.roles.reviewer.model).toBe('opus');
  });

  it('starts from the preset typology, labelled with the project prefix', () => {
    const project = projectOf(parse(document({}, [minimalProject({ conventions: { labels: { typePrefix: 'kind/' } } })])), 'storefront');
    expect(project.issueTypes.map((type) => type.label).slice(0, 3)).toEqual(['kind/feature', 'kind/fix', 'kind/ui']);
  });

  it('reads declared issue types with their defaults', () => {
    const project = projectOf(
      parse(document({}, [minimalProject({ issueTypes: [{ id: 'feature', proof: 'fails-on-base', commit: { type: 'feat' } }, { id: 'docs', label: 'documentation', proof: 'none', commit: { type: 'docs', scope: 'docs' } }] })])),
      'storefront',
    );
    expect(project.issueTypes).toEqual([
      {
        id: 'feature',
        label: 'type:feature',
        proof: 'fails-on-base',
        checks: "tests in the repository's existing test layout and framework that assert the new behaviour",
        commit: { type: 'feat', scope: null, whenChanged: [] },
        evidence: ['acceptance-tests', 'diff-stat'],
        review: [],
        paths: [],
      },
      {
        id: 'docs',
        label: 'documentation',
        proof: 'none',
        checks: 'none: the existing tests and the gate steps are the proof',
        commit: { type: 'docs', scope: 'docs', whenChanged: [] },
        evidence: ['acceptance-tests', 'diff-stat'],
        review: [],
        paths: [],
      },
    ]);
  });

  it('refuses a redeploy of a production environment, declared or named so', () => {
    const redeploy = { workflow: 'deploy.yml' };
    const problems = configProblems(
      document({}, [
        minimalProject({
          delivery: {
            environments: [
              { name: 'live', production: true, promotion: 'manual', redeploy },
              { name: 'production', promotion: 'manual', redeploy },
              { name: 'staging', promotion: 'automatic', redeploy },
            ],
          },
        }),
      ]),
    );
    expect(problems).toEqual([
      'projects.0.delivery.environments.0.redeploy: production is never deployed by the factory: remove redeploy from this environment',
      'projects.0.delivery.environments.1.redeploy: production is never deployed by the factory: remove redeploy from this environment',
    ]);
  });

  it('refuses two issue types that share a label', () => {
    const types = [
      { id: 'feature', proof: 'fails-on-base', commit: { type: 'feat' } },
      { id: 'story', label: 'type:feature', proof: 'fails-on-base', commit: { type: 'feat' } },
    ];
    expect(configProblems(document({}, [minimalProject({ issueTypes: types })]))).toContain('projects.0.issueTypes: label type:feature marks two issue types');
  });

  it('names the known projects when an unknown one is asked for', () => {
    expect(() => projectOf(parse(document()), 'billing')).toThrow(new UnknownProjectError('billing', ['storefront']));
  });
});
