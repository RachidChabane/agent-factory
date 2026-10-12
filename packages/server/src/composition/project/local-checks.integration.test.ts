import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CheckRunSummary } from '@agent-factory/application';
import { createRehearsal, FIRST_PROJECT, waitFor, type RehearsalEnvironment } from '../../testing/rehearsal-environment.ts';
import { openInstallation, type InstallationRuntime } from '../installation/installation-runtime.ts';
import { SILENT_LOG } from '../operation-log.ts';

const TIMEOUT_MS = 60_000;
const BASE_BRANCH = 'main';
const GATED_PROJECT = {
  forge: { kind: 'local', repository: 'acme/widgets', checks: 'gate' },
  gate: {
    niceness: null,
    beforeAcceptance: [{ name: 'readme', run: 'test -f README.md' }],
    afterAcceptance: [{ name: 'changelog', run: 'test -f CHANGELOG.md' }],
  },
};

describe('the checks of a local forge that runs the project gate', () => {
  let rehearsal: RehearsalEnvironment;
  let installation: InstallationRuntime;

  beforeEach(async () => {
    rehearsal = await createRehearsal({ projectSettings: { [FIRST_PROJECT]: GATED_PROJECT } });
    installation = await openInstallation(rehearsal.config, rehearsal.environment, { log: SILENT_LOG, userHome: rehearsal.root });
  });

  afterEach(async () => {
    installation.close();
    await rehearsal.cleanup();
  });

  it('runs each gate step on a clean checkout of the commit and reports it as a check, with the log the checks link to', async () => {
    const forge = installation.project(FIRST_PROJECT).forge;
    const first = await forge.checks(BASE_BRANCH);
    expect(first).toEqual([expect.objectContaining({ name: 'gate', conclusion: 'pending' })]);
    const finished = await waitFor(async () => {
      const checks: readonly CheckRunSummary[] = await forge.checks(BASE_BRANCH);
      return checks.some((check) => check.conclusion === 'pending') ? null : checks;
    }, TIMEOUT_MS, 'the gate to finish');
    expect(finished.map((check) => [check.name, check.conclusion])).toEqual([
      ['readme', 'success'],
      ['changelog', 'failure'],
    ]);
    const log = await readFile(fileURLToPath(finished[0]?.url ?? ''), 'utf8');
    expect(log).toContain('$ test -f CHANGELOG.md');
    expect(log).toContain('[exit code 1]');
    expect(await forge.baseBranchChecks()).toEqual(finished);
  });
});
