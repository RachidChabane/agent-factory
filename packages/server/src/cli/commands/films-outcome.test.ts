import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { parseAgentFactoryConfig, projectOf, type ProjectConfig } from '../../config/agent-factory-config.ts';
import { filmsOutcome, projectChecks } from './validation-checks.ts';

const USER_HOME = '/Users/operator';
const HOME = `${USER_HOME}/.agent-factory`;
const EXECUTABLE_MODE = 0o755;
const PLAIN_MODE = 0o644;
const PROGRAM = 'record-film';

function projectWith(films: Record<string, unknown> | null, workingDirectory: string, tools: readonly Record<string, unknown>[] = []): ProjectConfig {
  const evidence = films === null ? {} : { films: { workingDirectory, ...films } };
  const text = stringify({
    version: 1,
    projects: [{ id: 'storefront', name: 'Storefront', forge: { kind: 'local', repository: 'example-org/storefront' }, commitIdentity: { name: 'Bot', email: 'bot@example.invalid' }, tools, evidence }],
  });
  return projectOf(parseAgentFactoryConfig(text, HOME, `${HOME}/config.yaml`, USER_HOME), 'storefront');
}

async function writeProgram(path: string, mode: number = EXECUTABLE_MODE): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, '#!/bin/sh\nexit 0\n');
  await chmod(path, mode);
}

describe('the films line of validate', () => {
  let directory = '';
  let binaries = '';
  let environment: Record<string, string> = {};

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'films-outcome-'));
    binaries = join(directory, 'bin');
    await writeProgram(join(binaries, PROGRAM));
    environment = { PATH: binaries };
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const filmCommand = (...tokens: readonly string[]) => ({ command: [...tokens, '{ref}', '{output}', '{scenario}'] });

  it('says plainly that the film command runs outside the sandbox, with the operator\'s environment and sessions', async () => {
    const outcome = await filmsOutcome(projectWith({ ...filmCommand(PROGRAM, 'record.mjs'), timeoutMinutes: 15 }, directory), environment);
    expect(outcome.ok).toBe(true);
    expect(outcome.detail).toContain(`${PROGRAM} record.mjs {ref} {output} {scenario} runs outside the sandbox, with your environment and your sessions, like one of your own scripts`);
    expect(outcome.detail).toContain('declare only a command you trust');
    expect(outcome.detail).toContain(`it runs from ${directory} and stops after 15 minutes`);
  });

  it('fails when the working directory does not exist', async () => {
    const outcome = await filmsOutcome(projectWith(filmCommand(PROGRAM), join(directory, 'missing')), environment);
    expect(outcome).toEqual({ ok: false, detail: `the working directory ${join(directory, 'missing')} does not exist` });
  });

  it('has nothing to say about a project that declares no film command', async () => {
    expect(await filmsOutcome(projectWith(null, directory), environment)).toEqual({ ok: true, detail: 'no film command declared' });
  });

  describe('the tools the films wait for', () => {
    const VAULT = { name: 'vault', check: ['vault', 'token', 'lookup'] };
    const CLOUD = { name: 'cloud', check: ['cloud', 'auth', 'status'] };

    it('are named, with what the factory does with them', async () => {
      const outcome = await filmsOutcome(projectWith({ ...filmCommand(PROGRAM), tools: ['vault', 'cloud'] }, directory, [VAULT, CLOUD]), environment);
      expect(outcome.ok).toBe(true);
      expect(outcome.detail).toContain('before a film starts it checks vault, cloud and keeps the films queued while one fails, reading it again every 5 minutes');
    });

    it('are not mentioned when the films need none', async () => {
      expect((await filmsOutcome(projectWith(filmCommand(PROGRAM), directory), environment)).detail).not.toContain('before a film starts');
    });
  });

  describe('the program of the command', () => {
    it('is found along the PATH when it is a bare name, and the line says which file it is', async () => {
      const outcome = await filmsOutcome(projectWith(filmCommand(PROGRAM), directory), environment);
      expect(outcome.ok).toBe(true);
      expect(outcome.detail).toContain(`the program is ${join(binaries, PROGRAM)}`);
    });

    it('is looked up along the PATH of the film environment, which comes on top of the factory\'s', async () => {
      const other = join(directory, 'tools');
      await writeProgram(join(other, 'only-in-film-path'));
      const films = { ...filmCommand('only-in-film-path'), environment: { PATH: other } };
      expect((await filmsOutcome(projectWith(films, directory), environment)).ok).toBe(true);
      expect((await filmsOutcome(projectWith(filmCommand('only-in-film-path'), directory), environment)).ok).toBe(false);
    });

    it('is found against the working directory when its name has a slash', async () => {
      await writeProgram(join(directory, 'scripts', 'film.sh'));
      const outcome = await filmsOutcome(projectWith(filmCommand('./scripts/film.sh'), directory), {});
      expect(outcome).toMatchObject({ ok: true });
      expect(outcome.detail).toContain(`the program is ${join(directory, 'scripts', 'film.sh')}`);
    });

    it('is found when its path is absolute', async () => {
      const outcome = await filmsOutcome(projectWith(filmCommand(join(binaries, PROGRAM)), directory), {});
      expect(outcome.ok).toBe(true);
    });

    it('is searched in /usr/bin and /bin when the environment sets no PATH', async () => {
      expect((await filmsOutcome(projectWith(filmCommand('sh'), directory), {})).ok).toBe(true);
      expect((await filmsOutcome(projectWith(filmCommand(PROGRAM), directory), {})).ok).toBe(false);
    });

    it('fails, naming the PATH, when a bare name is on none of its directories', async () => {
      const outcome = await filmsOutcome(projectWith(filmCommand('missing-film-tool'), directory), environment);
      expect(outcome.ok).toBe(false);
      expect(outcome.detail).toContain('the program missing-film-tool is not on the PATH of the film command');
      expect(outcome.detail).toContain('evidence.films.environment');
    });

    it('fails, naming the file looked for, when a path with a slash is no executable file', async () => {
      await writeProgram(join(directory, 'scripts', 'plain.sh'), PLAIN_MODE);
      await mkdir(join(directory, 'scripts', 'folder'), { recursive: true });
      for (const program of ['./scripts/plain.sh', './scripts/folder', './scripts/absent.sh']) {
        const outcome = await filmsOutcome(projectWith(filmCommand(program), directory), environment);
        expect(outcome).toEqual({ ok: false, detail: `the program ${program} is not an executable file (looked for ${join(directory, program)}, relative to the working directory)` });
      }
    });

    it('fails, saying that no shell expands it, when it starts with a tilde', async () => {
      const outcome = await filmsOutcome(projectWith(filmCommand('~/tools/record-film'), directory), environment);
      expect(outcome.ok).toBe(false);
      expect(outcome.detail).toContain('the program ~/tools/record-film starts with ~, which no shell expands');
      expect(outcome.detail).toContain('write the absolute path');
    });
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
