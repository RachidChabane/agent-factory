import { describe, expect, it } from 'vitest';
import type { WorkflowRun } from '../../contract/index.ts';
import { createI18n } from '../../i18n/create-i18n.ts';
import { createVocabulary } from '../../i18n/vocabulary.ts';
import { durationOf, filterWorkflows, isFailed, isRunning, newestFirst, triggerLabel, workflowCounts, workflowStatusLabel } from './workflow-model.ts';

function run(id: string, patch: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id,
    workflow: 'CI',
    title: `Run ${id}`,
    branch: 'main',
    sha: 'a'.repeat(40),
    trigger: 'push',
    status: 'completed',
    conclusion: 'success',
    actor: 'amorgan',
    startedAt: '2026-10-12T09:00:00.000Z',
    durationMs: 60_000,
    url: `https://github.example.com/example-org/storefront/actions/runs/${id}`,
    ...patch,
  };
}

const QUEUED = run('queued', { status: 'queued', conclusion: null, durationMs: null });
const RUNNING = run('running', { status: 'in_progress', conclusion: null, durationMs: null });
const FAILED = run('failed', { conclusion: 'failure' });
const CANCELLED = run('cancelled', { conclusion: 'cancelled' });
const PASSED = run('passed');

describe('isRunning and isFailed', () => {
  it('count a run that is queued or executing as running, and only a failure as failed', () => {
    expect([QUEUED, RUNNING, FAILED, CANCELLED, PASSED].map(isRunning)).toEqual([true, true, false, false, false]);
    expect([QUEUED, RUNNING, FAILED, CANCELLED, PASSED].map(isFailed)).toEqual([false, false, true, false, false]);
  });
});

describe('filterWorkflows and workflowCounts', () => {
  const runs = [QUEUED, RUNNING, FAILED, CANCELLED, PASSED];

  it('keeps the runs a filter names', () => {
    expect(filterWorkflows(runs, 'all')).toEqual(runs);
    expect(filterWorkflows(runs, 'running')).toEqual([QUEUED, RUNNING]);
    expect(filterWorkflows(runs, 'failed')).toEqual([FAILED]);
  });

  it('counts the runs of each filter', () => {
    expect(workflowCounts(runs)).toEqual({ all: 5, running: 2, failed: 1 });
    expect(workflowCounts([])).toEqual({ all: 0, running: 0, failed: 0 });
  });
});

describe('newestFirst', () => {
  it('orders runs by the time they started without touching the list it was given', () => {
    const older = run('older', { startedAt: '2026-10-12T08:00:00.000Z' });
    const newer = run('newer', { startedAt: '2026-10-12T09:30:00.000Z' });
    const runs = [older, newer];
    expect(newestFirst(runs)).toEqual([newer, older]);
    expect(runs).toEqual([older, newer]);
  });
});

describe('durationOf', () => {
  it('is the measured duration when the forge reports one', () => {
    expect(durationOf(PASSED)).toEqual({ kind: 'measured', milliseconds: 60_000 });
  });

  it('is running for a run that has not finished, and unreported for a finished run without a duration', () => {
    expect(durationOf(RUNNING)).toEqual({ kind: 'running' });
    expect(durationOf(QUEUED)).toEqual({ kind: 'running' });
    expect(durationOf(run('silent', { durationMs: null }))).toEqual({ kind: 'unreported' });
  });
});

describe('workflowStatusLabel', () => {
  const vocabulary = createVocabulary(createI18n('en'));

  it('names a finished run by its conclusion and a run still going by where it is', () => {
    expect(workflowStatusLabel(PASSED, vocabulary)).toBe('Passed');
    expect(workflowStatusLabel(FAILED, vocabulary)).toBe('Failed');
    expect(workflowStatusLabel(CANCELLED, vocabulary)).toBe('Cancelled');
    expect(workflowStatusLabel(RUNNING, vocabulary)).toBe('In progress');
    expect(workflowStatusLabel(QUEUED, vocabulary)).toBe('Queued');
  });

  it('says completed for a finished run whose conclusion the forge did not report', () => {
    expect(workflowStatusLabel(run('open-ended', { conclusion: null }), vocabulary)).toBe('Completed');
  });
});

describe('triggerLabel', () => {
  const english = createI18n('en').t;
  const french = createI18n('fr').t;

  it.each([
    ['push', 'Push', 'Push'],
    ['pull_request', 'Pull request', 'Pull request'],
    ['schedule', 'Schedule', 'Planification'],
    ['workflow_dispatch', 'Manual run', 'Lancement manuel'],
    ['workflow_run', 'Another workflow', 'Autre workflow'],
    ['release', 'Release', 'Release'],
  ])('puts the event %s in words in both languages', (trigger, inEnglish, inFrench) => {
    expect(triggerLabel(trigger, english)).toBe(inEnglish);
    expect(triggerLabel(trigger, french)).toBe(inFrench);
  });

  it('shows an event it has no words for as the forge names it', () => {
    expect(triggerLabel('merge_group', english)).toBe('merge_group');
    expect(triggerLabel('constructor', english)).toBe('constructor');
  });
});
