import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { parseAgentFactoryConfig, projectOf, type ProjectConfig } from '../../config/agent-factory-config.ts';
import { filmsOutcome, projectChecks } from './validation-checks.ts';

const USER_HOME = '/Users/operator';
const HOME = `${USER_HOME}/.agent-factory`;

function projectWith(films: Record<string, unknown> | null, workingDirectory: string): ProjectConfig {
  const evidence = films === null ? {} : { films: { command: ['node', 'record.mjs', '{ref}', '{output}', '{scenario}'], workingDirectory, ...films } };
  const text = stringify({
    version: 1,
    projects: [{ id: 'storefront', name: 'Storefront', forge: { kind: 'local', repository: 'example-org/storefront' }, commitIdentity: { name: 'Bot', email: 'bot@example.invalid' }, evidence }],
  });
  return projectOf(parseAgentFactoryConfig(text, HOME, `${HOME}/config.yaml`, USER_HOME), 'storefront');
}

describe('the films line of validate', () => {
  let directory = '';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'films-outcome-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('says plainly that the film command runs outside the sandbox, with the operator\'s environment and sessions', async () => {
    const outcome = await filmsOutcome(projectWith({ timeoutMinutes: 15 }, directory));
    expect(outcome.ok).toBe(true);
    expect(outcome.detail).toContain('node record.mjs {ref} {output} {scenario} runs outside the sandbox, with your environment and your sessions, like one of your own scripts');
    expect(outcome.detail).toContain('declare only a command you trust');
    expect(outcome.detail).toContain(`it runs from ${directory} and stops after 15 minutes`);
  });

  it('fails when the working directory does not exist', async () => {
    const outcome = await filmsOutcome(projectWith({}, join(directory, 'missing')));
    expect(outcome).toEqual({ ok: false, detail: `the working directory ${join(directory, 'missing')} does not exist` });
  });

  it('has nothing to say about a project that declares no film command', async () => {
    expect(await filmsOutcome(projectWith(null, directory))).toEqual({ ok: true, detail: 'no film command declared' });
  });

  it('adds the films line and the ffmpeg warning to the checks of a project that films, and nothing to the others', () => {
    const settings = { runner: { run: () => Promise.reject(new Error('not used')) }, environment: {}, platform: 'darwin', home: USER_HOME };
    const config = parseAgentFactoryConfig(
      stringify({
        version: 1,
        projects: [
          { id: 'storefront', name: 'Storefront', forge: { kind: 'local', repository: 'example-org/storefront' }, commitIdentity: { name: 'Bot', email: 'bot@example.invalid' }, evidence: { films: { command: ['node', '{ref}', '{output}', '{scenario}'], workingDirectory: directory } } },
          { id: 'ledger', name: 'Ledger', forge: { kind: 'local', repository: 'example-org/ledger' }, commitIdentity: { name: 'Bot', email: 'bot@example.invalid' } },
        ],
      }),
      HOME,
      `${HOME}/config.yaml`,
      USER_HOME,
    );
    const names = (id: string) => projectChecks(config, projectOf(config, id), settings).map((check) => [check.name, check.severity]);
    expect(names('storefront')).toEqual(expect.arrayContaining([['films', 'required'], ['films ffmpeg', 'optional']]));
    expect(names('ledger').map(([name]) => name)).not.toContain('films');
  });
});
