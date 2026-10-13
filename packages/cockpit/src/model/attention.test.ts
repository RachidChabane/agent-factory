import { describe, expect, it } from 'vitest';
import { mapProject, mapRuns } from '../test/fixtures/mutate.ts';
import { fixtureSnapshot } from '../test/render.tsx';
import { ATTENTION_PRIORITIES, awaitsMergeOrder, deriveAttention } from './attention.ts';

describe('deriveAttention', () => {
  it('lists what waits for the operator across projects, most urgent first', () => {
    const items = deriveAttention(fixtureSnapshot());
    const ranks = items.map((item) => ATTENTION_PRIORITIES.indexOf(item.kind));
    expect(ranks).toEqual(ranks.toSorted((left, right) => left - right));
    expect(items).toHaveLength(15);
    expect(new Set(items.map((item) => item.key)).size).toBe(15);
  });

  it('narrows to one project, keeping the questions of its runs', () => {
    const storefront = deriveAttention(fixtureSnapshot(), 'storefront');
    expect(storefront).toHaveLength(10);
    expect(storefront.every((item) => item.project === 'storefront')).toBe(true);
    expect(storefront.some((item) => item.kind === 'question')).toBe(true);
    expect(deriveAttention(fixtureSnapshot(), 'ledger')).toHaveLength(5);
  });

  it('refers to the question of an agent by what its run works on, not by the identifier of the run', () => {
    const snapshot = fixtureSnapshot();
    const questions = deriveAttention(snapshot).filter((item) => item.kind === 'question');
    expect(questions.length).toBeGreaterThan(0);
    for (const question of questions) {
      const run = snapshot.runs.find((candidate) => `run:${candidate.id}` === question.key);
      expect(run, `the run of ${question.key}`).toBeDefined();
      expect(question.reference).toBe(run?.subject.kind === 'issue' ? `#${run.subject.id}` : run?.subject.id);
      expect(question.reference).not.toBe(run?.id);
    }
  });

  it('keeps the same number of an issue apart in two projects', () => {
    const keys = deriveAttention(fixtureSnapshot()).map((item) => item.key);
    expect(keys.filter((key) => key.endsWith('request:R-13'))).toEqual(expect.arrayContaining(['storefront:request:R-13', 'ledger:request:R-13']));
  });

  it('never asks for a release another version has overtaken', () => {
    const snapshot = mapProject(fixtureSnapshot(), 'storefront', (project) => ({
      ...project,
      releases: project.releases.map((release) => ({ ...release, state: 'blocked' as const, supersededBy: '9.9.9' })),
    }));
    expect(deriveAttention(snapshot, 'storefront').some((item) => item.kind === 'release')).toBe(false);
  });

  it('asks for an answer only while the run that asks it is alive', () => {
    const snapshot = mapRuns(fixtureSnapshot(), (runs) => runs.map((run) => (run.id === 'run_5d0911' ? { ...run, status: 'stopped' as const } : run)));
    expect(deriveAttention(snapshot).some((item) => item.kind === 'question')).toBe(false);
  });

  it('asks for a merge only once the pull request can be merged and no agent is working on it', () => {
    const snapshot = fixtureSnapshot();
    const project = snapshot.projects.find((candidate) => candidate.id === 'storefront');
    const issue = project?.issues.find((candidate) => candidate.number === 58);
    const pullRequest = project?.pullRequests.find((candidate) => candidate.number === 62);
    if (issue === undefined || pullRequest === undefined) throw new Error('the world lacks issue 58');
    expect(awaitsMergeOrder(issue, pullRequest, false)).toBe(false);
    expect(awaitsMergeOrder(issue, { ...pullRequest, mergeable: true }, false)).toBe(true);
    expect(awaitsMergeOrder(issue, { ...pullRequest, mergeable: true }, true)).toBe(false);
    expect(awaitsMergeOrder({ ...issue, state: 'ready-to-merge' }, undefined, true)).toBe(true);
  });
});
