import { describe, expect, it } from 'vitest';
import type { FilmOutcome, FilmPhaseRecord } from '@agent-factory/application';
import { parseAgentFactoryConfig, projectOf } from '../../config/agent-factory-config.ts';
import { stringify } from 'yaml';
import { reportFilm } from './film-command.ts';

const HOME = '/Users/operator/.agent-factory';
const PROJECT = projectOf(
  parseAgentFactoryConfig(
    stringify({ version: 1, projects: [{ id: 'storefront', name: 'Storefront', forge: { kind: 'local', repository: 'example-org/storefront' }, commitIdentity: { name: 'Bot', email: 'bot@example.invalid' } }] }),
    HOME,
    `${HOME}/config.yaml`,
    '/Users/operator',
  ),
  'storefront',
);

function phase(name: string, omitted: FilmPhaseRecord['omitted'] = []): FilmPhaseRecord {
  return { video: `.evidence/7/films/checkout-flow/${name}.mp4`, report: 'r', screenshots: [], facts: [], storeVideo: 's', storeScreenshots: [], omitted };
}

function finished(before: FilmPhaseRecord, after: FilmPhaseRecord): FilmOutcome {
  return { kind: 'finished', issueNumber: 7, pullRequestNumber: 31, scenario: 'checkout-flow', commitSha: 'abc1234', before, after };
}

function reported(outcome: FilmOutcome) {
  const lines: string[] = [];
  const errors: string[] = [];
  const code = reportFilm(PROJECT, outcome, { line: (text) => lines.push(text), error: (text) => errors.push(text) });
  return { code, lines, errors };
}

describe('what the film command says of a film', () => {
  it('names the video of each recording on the branch', () => {
    const { code, lines } = reported(finished(phase('before'), phase('after')));
    expect(code).toBe(0);
    expect(lines.slice(1)).toEqual(['Before: .evidence/7/films/checkout-flow/before.mp4', 'After: .evidence/7/films/checkout-flow/after.mp4']);
  });

  it('says that a video is left out of the pull request, with its size and the limit', () => {
    const left = { path: '.evidence/7/films/checkout-flow/after.mp4', bytes: 12_400_000, reason: 'file-limit' as const, limitBytes: 5_000_000 };
    const { lines } = reported(finished(phase('before'), phase('after', [left])));
    expect(lines.slice(1)).toEqual([
      'Before: .evidence/7/films/checkout-flow/before.mp4',
      'After: left out of the pull request, 12.4 MB, over the limit of 5 MB per file (evidence.maxFileBytes)',
    ]);
  });

  it('does not call a left-out screenshot a left-out video', () => {
    const screenshot = { path: '.evidence/7/films/checkout-flow/after.png', bytes: 6_000_000, reason: 'file-limit' as const, limitBytes: 5_000_000 };
    expect(reported(finished(phase('before'), phase('after', [screenshot]))).lines[2]).toBe('After: .evidence/7/films/checkout-flow/after.mp4');
  });

  it('reports a failed film with its reason', () => {
    const { code, errors } = reported({ kind: 'failed', issueNumber: 7, scenario: 'checkout-flow', reason: 'the session expired' });
    expect(code).toBe(1);
    expect(errors).toEqual(['The film of scenario checkout-flow for storefront#7 failed: the session expired']);
  });
});
