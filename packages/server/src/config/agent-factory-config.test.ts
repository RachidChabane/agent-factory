import fc from 'fast-check';
import { isReferenceName, isReferenceRevision } from '@agent-factory/domain';
import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { configProblems, parseAgentFactoryConfig, projectOf, serverClientUrl, UnknownProjectError, UnknownServerPortError } from './agent-factory-config.ts';

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
    expect(project.worktreePool).toEqual({ directory: `${HOME}/projects/storefront/worktrees`, size: 5 });
    expect(project.directories.evidence).toBe(`${HOME}/projects/storefront/evidence`);
    expect(project.repository).toEqual({ owner: 'example-org', name: 'storefront' });
  });

  it('merges on GitHub without the administrator bypass unless the project asks for it', () => {
    expect(projectOf(parse(document()), 'storefront').forge).toEqual({ kind: 'github', mergeWithBypass: false });
    const bypassing = minimalProject({ forge: { kind: 'github', repository: 'example-org/storefront', mergeWithBypass: true } });
    expect(projectOf(parse(document({}, [bypassing])), 'storefront').forge).toEqual({ kind: 'github', mergeWithBypass: true });
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

  it('reads the stack the checks of a project need, with its defaults', () => {
    const stack = {
      setup: [{ name: 'database', run: 'docker compose up -d --wait db', network: 'pulls the database image' }],
      services: [{ name: 'web', run: 'npm run dev', ready: 'curl -fsS http://127.0.0.1:3000/healthz' }],
      teardown: [{ name: 'database', run: 'docker compose down --volumes' }],
      issueTypes: ['ui'],
    };
    expect(projectOf(parse(document({}, [minimalProject({ stack })])), 'storefront').stack).toEqual({
      setup: [{ name: 'database', run: 'docker compose up -d --wait db', network: { reason: 'pulls the database image' } }],
      services: [{ name: 'web', run: 'npm run dev', ready: { run: 'curl -fsS http://127.0.0.1:3000/healthz', timeoutMs: 120_000 } }],
      teardown: [{ name: 'database', run: 'docker compose down --volumes' }],
      environment: {},
      issueTypes: ['ui'],
      stopGraceMs: 10_000,
    });
    expect(projectOf(parse(document()), 'storefront').stack).toBeNull();
  });

  it('refuses a stack for an issue type the project does not have, or two services of one name', () => {
    const service = { name: 'web', run: 'npm run dev', ready: 'true' };
    expect(configProblems(document({}, [minimalProject({ stack: { issueTypes: ['mobile'] } })]))).toContain('projects.0.stack.issueTypes: issue type mobile is not an issue type of the project');
    expect(configProblems(document({}, [minimalProject({ stack: { services: [service, service] } })]))).toContain('projects.0.stack.services: service web is declared twice');
  });

  describe('the film command of a project', () => {
    const FILMS = {
      command: ['node', 'record-film.mjs', '--ref', '{ref}', '--out', '{output}', '--scenario', '{scenario}', '--replay', '{replay}'],
      workingDirectory: '~/tools/storefront-films',
    };

    function films(extra: Record<string, unknown> = {}): Record<string, unknown> {
      return minimalProject({ evidence: { films: { ...FILMS, ...extra } } });
    }

    it('is absent unless the project declares one', () => {
      expect(projectOf(parse(document()), 'storefront').evidence).toEqual({ maxFileBytes: 5_000_000, maxTotalBytes: 40_000_000, films: null });
    });

    it('reads the command with its defaults, the machine zone and a working directory resolved from the home of the operator', () => {
      const declared = projectOf(parse(document({}, [films()])), 'storefront').evidence.films;
      expect(declared).toEqual({
        command: FILMS.command,
        workingDirectory: '/home/operator/tools/storefront-films',
        environment: {},
        timeoutMs: 20 * 60_000,
        replayFile: 'replay.json',
        timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    });

    it('reads every key it is given', () => {
      const declared = projectOf(parse(document({}, [films({ workingDirectory: 'tools/films', environment: { FILMS_ACCOUNT: 'sandbox-shopper', FILMS_API_KEY: 'sandbox-key' }, timeoutMinutes: 45, replayFile: 'choices.json', timeZone: 'Europe/Paris' })])), 'storefront').evidence.films;
      expect(declared).toMatchObject({
        workingDirectory: '/home/operator/.agent-factory/projects/storefront/tools/films',
        environment: { FILMS_ACCOUNT: 'sandbox-shopper', FILMS_API_KEY: 'sandbox-key' },
        timeoutMs: 45 * 60_000,
        replayFile: 'choices.json',
        timeZone: 'Europe/Paris',
      });
    });

    it('lets the environment of the command hold names that look like credentials, which check commands refuse', () => {
      expect(configProblems(document({}, [films({ environment: { SANDBOX_API_TOKEN: 'sandbox-token' } })]))).toEqual([]);
      expect(configProblems(document({}, [minimalProject({ environment: { set: { SANDBOX_API_TOKEN: 'x' } } })]))).toEqual([
        expect.stringContaining('looks like a credential'),
      ]);
    });

    it('refuses a command without the placeholders that name what to record', () => {
      expect(configProblems(document({}, [films({ command: ['node', 'record-film.mjs', '{ref}'] })]))).toEqual([
        'projects.0.evidence.films.command: the command must contain {output}',
        'projects.0.evidence.films.command: the command must contain {scenario}',
      ]);
    });

    it('refuses a replay placeholder that follows no option', () => {
      const command = ['node', 'record-film.mjs', '{ref}', '{output}', '{scenario}', '{replay}'];
      expect(configProblems(document({}, [films({ command })]))).toEqual(['projects.0.evidence.films.command: {replay} must follow an option such as --replay']);
    });

    it('refuses a time zone that does not exist, a replay file that is a path, and an unknown key', () => {
      expect(configProblems(document({}, [films({ timeZone: 'Mars/Olympus' })]))).toEqual([expect.stringContaining('projects.0.evidence.films.timeZone: is not a time zone name')]);
      expect(configProblems(document({}, [films({ replayFile: '../replay.json' })]))).toEqual([expect.stringContaining('projects.0.evidence.films.replayFile: must be a file name')]);
      expect(configProblems(document({}, [films({ resolution: '720p' })]))).toEqual([expect.stringContaining('projects.0.evidence.films')]);
    });
  });
});

describe('the reference repositories of a project', () => {
  const TOKENS = { name: 'design-tokens', repository: 'example-org/design-tokens', ref: 'v1.0.0', source: '~/src/design-tokens' };

  function withReferences(...references: readonly Record<string, unknown>[]): Record<string, unknown> {
    return document({}, [minimalProject({ references })]);
  }

  it('defaults to no reference and keeps the snapshots in the project directory', () => {
    const project = projectOf(parse(document()), 'storefront');
    expect(project.references).toEqual([]);
    expect(project.directories.references).toBe(`${HOME}/projects/storefront/references`);
  });

  it('reads each reference and resolves the clone it is taken from like any other path of the project', () => {
    const project = projectOf(parse(withReferences(TOKENS, { ...TOKENS, name: 'icons', repository: 'example-org/icons', ref: 'v2', source: 'sources/icons' })), 'storefront');
    expect(project.references).toEqual([
      { name: 'design-tokens', repository: 'example-org/design-tokens', ref: 'v1.0.0', source: '/home/operator/src/design-tokens' },
      { name: 'icons', repository: 'example-org/icons', ref: 'v2', source: `${HOME}/projects/storefront/sources/icons` },
    ]);
  });

  it('accepts a commit id as the ref', () => {
    const commit = '1d3e4a9ce003af09489551fd6398fc44c24069cc';
    expect(projectOf(parse(withReferences({ ...TOKENS, ref: commit })), 'storefront').references[0]?.ref).toBe(commit);
  });

  it('refuses a name that is not a lowercase slug', () => {
    for (const name of ['Tokens', 'tokens/assets', '../tokens', 'tokens assets', 'tokens_assets', '']) {
      expect(configProblems(withReferences({ ...TOKENS, name })), name).toEqual([expect.stringMatching(/^projects\.0\.references\.0\.name: /)]);
    }
    expect(configProblems(withReferences({ ...TOKENS, name: 'Tokens' }))[0]).toContain('lowercase letters and digits');
  });

  it('refuses a repository that is not owner/name', () => {
    for (const repository of ['design-tokens', 'a/b/c', 'example-org/', 'example org/tokens']) {
      expect(configProblems(withReferences({ ...TOKENS, repository })), repository).toEqual([expect.stringMatching(/^projects\.0\.references\.0\.repository: must be owner\/name/)]);
    }
  });

  it('refuses a ref that could pass for an option, leave its directory or widen a rule', () => {
    for (const ref of ['-rf', '--output=x', '../x', 'a/b', 'a b', 'a*', 'a?', '.hidden', 'a..b']) {
      expect(configProblems(withReferences({ ...TOKENS, ref })), ref).toEqual([expect.stringMatching(/^projects\.0\.references\.0\.ref: must be a tag or commit/)]);
    }
  });

  it('refuses a missing key, an unknown key, and a source that is empty', () => {
    expect(configProblems(withReferences({ name: 'design-tokens', repository: 'example-org/design-tokens', ref: 'v1.0.0' }))).toEqual([expect.stringMatching(/references\.0\.source/)]);
    expect(configProblems(withReferences({ ...TOKENS, fetch: true }))).toHaveLength(1);
    expect(configProblems(withReferences({ ...TOKENS, source: ' ' }))).toEqual([expect.stringMatching(/references\.0\.source/)]);
  });

  it('refuses two references of one project with the same name, and allows the same name in two projects', () => {
    expect(configProblems(withReferences(TOKENS, { ...TOKENS, ref: 'v2.0.0' }))).toEqual(['projects.0.references: reference design-tokens is declared twice']);
    const ledger = minimalProject({ id: 'ledger', name: 'Ledger', forge: { kind: 'github', repository: 'example-org/ledger' }, references: [TOKENS] });
    expect(configProblems(document({}, [minimalProject({ references: [TOKENS] }), ledger]))).toEqual([]);
  });

  it('keeps the references of one project out of the other', () => {
    const ledger = minimalProject({ id: 'ledger', name: 'Ledger', forge: { kind: 'github', repository: 'example-org/ledger' } });
    const config = parse(document({}, [minimalProject({ references: [TOKENS] }), ledger]));
    expect(projectOf(config, 'storefront').references).toHaveLength(1);
    expect(projectOf(config, 'ledger').references).toEqual([]);
  });

  it('only accepts names and refs the domain rules accept', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (name, ref) => {
        const accepted = configProblems(withReferences({ ...TOKENS, name, ref })).length === 0;
        return !accepted || (isReferenceName(name) && isReferenceRevision(ref));
      }),
      { numRuns: 300 },
    );
  });
});

describe('the address a client reaches the server at', () => {
  it('is the configured host and port', () => {
    expect(serverClientUrl({ host: '127.0.0.1', port: 7430 })).toBe('http://127.0.0.1:7430');
    expect(serverClientUrl({ host: 'factory.example.com', port: 8080 })).toBe('http://factory.example.com:8080');
  });

  it('goes through the loopback when the server listens on every address, and brackets an IPv6 host', () => {
    expect(serverClientUrl({ host: '0.0.0.0', port: 7430 })).toBe('http://127.0.0.1:7430');
    expect(serverClientUrl({ host: '::', port: 7430 })).toBe('http://[::1]:7430');
    expect(serverClientUrl({ host: '::1', port: 7430 })).toBe('http://[::1]:7430');
  });

  it('cannot be known for a server that picks a free port at each start', () => {
    expect(() => serverClientUrl({ host: '127.0.0.1', port: 0 })).toThrow(UnknownServerPortError);
    expect(() => serverClientUrl({ host: '127.0.0.1', port: 0 })).toThrow(/give the port with --port/);
  });
});
