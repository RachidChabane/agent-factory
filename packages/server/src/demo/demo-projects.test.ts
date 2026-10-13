import { access } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { filmCommandProblems } from '@agent-factory/application';
import { projectOf } from '../config/agent-factory-config.ts';
import { filmsOutcome } from '../cli/commands/validation-checks.ts';
import { DEMO_FILM_COMMAND_MAIN, DEMO_FILMS_DIRECTORY } from './demo-paths.ts';
import { LEDGER_ID, STOREFRONT_ID } from './demo-projects.ts';
import { DEMO_REPLAY_FILE } from './films/demo-film-request.ts';
import { resolvedConfiguration } from './story/testing/demo-configuration.ts';

const MILLISECONDS_PER_MINUTE = 60_000;

describe('the films of the demonstration', () => {
  const configuration = resolvedConfiguration();
  const storefront = projectOf(configuration, STOREFRONT_ID);

  it('are recorded for the storefront by a command that is a complete film command', () => {
    const films = storefront.evidence.films;
    expect(films).not.toBeNull();
    expect(filmCommandProblems(films?.command ?? [])).toEqual([]);
    expect(films?.command.slice(0, 2)).toEqual([process.execPath, DEMO_FILM_COMMAND_MAIN]);
    expect(films?.workingDirectory).toBe(DEMO_FILMS_DIRECTORY);
    expect(films?.replayFile).toBe(DEMO_REPLAY_FILE);
    expect(films?.timeoutMs).toBeGreaterThan(MILLISECONDS_PER_MINUTE);
  });

  it('leave the ledger without a film command', () => {
    expect(projectOf(configuration, LEDGER_ID).evidence.films).toBeNull();
  });

  it('name a command and a working directory that exist, and pass the films check of validate', async () => {
    await expect(access(DEMO_FILM_COMMAND_MAIN)).resolves.toBeUndefined();
    await expect(filmsOutcome(storefront, process.env)).resolves.toMatchObject({ ok: true });
  });
});
