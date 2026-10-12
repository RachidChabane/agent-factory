import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { FactoryEventRecord } from '@agent-factory/application';
import { FAILURE_KINDS, TEST_OUTCOMES } from '@agent-factory/domain';
import issue7 from './__fixtures__/issue-7-proof.json' with { type: 'json' };
import { projectSnapshot } from './snapshot.ts';
import { fixtureContext, fixtureEvents } from './snapshot-fixture.ts';
import { withoutLocalPaths } from './local-paths.ts';

const ISSUE_SUBJECT = 'issue/42';
const ISSUE_NUMBER = 42;
const OPERATOR_HOME = '/home/operator';

const AcceptanceTestOnBaseSchema = z.object({
  id: z.string(),
  file: z.string(),
  criteria: z.array(z.number()),
  outcome: z.enum(TEST_OUTCOMES),
  failureKind: z.enum(FAILURE_KINDS).nullable(),
  failureMessage: z.string().nullable(),
});
const AcceptanceTestOnBranchSchema = z.object({ id: z.string(), outcome: z.enum([...TEST_OUTCOMES, 'missing']) });

const Issue7Schema = z.object({
  worktree: z.object({ path: z.string(), branch: z.string(), baseSha: z.string() }),
  spec: z.object({ acceptanceCriteria: z.array(z.string()) }).passthrough(),
  manifest: z.unknown(),
  beforeProof: z.object({ tests: z.array(AcceptanceTestOnBaseSchema) }).passthrough(),
  gateTests: z.array(AcceptanceTestOnBranchSchema),
  beforeLog: z.string(),
  gateLog: z.string(),
});
const real = Issue7Schema.parse(issue7);

function payloadOf(record: FactoryEventRecord): Record<string, unknown> {
  return typeof record.payload === 'object' && record.payload !== null ? { ...record.payload } : {};
}

function issue7Events(): readonly FactoryEventRecord[] {
  return fixtureEvents().map((record) => {
    if (record.subject !== ISSUE_SUBJECT) return record;
    const payload = payloadOf(record);
    switch (record.type) {
      case 'pipeline.spec-captured':
        return { ...record, payload: { ...payload, spec: { ...real.spec, number: ISSUE_NUMBER } } };
      case 'pipeline.worktree-acquired':
        return { ...record, payload: real.worktree };
      case 'pipeline.acceptance-authored':
        return { ...record, payload: { manifest: real.manifest } };
      case 'pipeline.before-proof-recorded':
        return { ...record, payload: real.beforeProof };
      case 'pipeline.gate-completed':
        return { ...record, payload: { ...payload, tests: real.gateTests } };
      default:
        return record;
    }
  });
}

function issue7PullRequest() {
  const context = { ...fixtureContext(), logs: new Map([[`${ISSUE_NUMBER}/before-proof.log`, real.beforeLog], [`${ISSUE_NUMBER}/gate-attempt-1.log`, real.gateLog]]) };
  const pullRequest = projectSnapshot(issue7Events(), context).pullRequests[0];
  if (pullRequest === undefined) throw new Error('the projection has no pull request');
  return pullRequest;
}

function acceptanceTestsEvidence() {
  for (const entry of issue7PullRequest().evidence) if (entry.kind === 'acceptance-tests') return entry;
  throw new Error('no acceptance-tests evidence');
}

function redGreenEvidence() {
  for (const entry of issue7PullRequest().evidence) if (entry.kind === 'red-green') return entry;
  throw new Error('no red-green evidence');
}

describe('acceptance tests of a pull request whose before proof stored file-level criteria', () => {
  const evidence = acceptanceTestsEvidence();

  it('lists each test once, under the criterion its name gives', () => {
    expect(evidence.rows.map((row) => [row.criterion, row.name.slice(0, 22)])).toEqual([
      [1, 'test_criterion_1_unrea'],
      [1, 'test_criterion_1_unrea'],
      [2, 'test_criterion_2_the_r'],
      [2, 'test_criterion_2_the_r'],
      [3, 'test_criterion_3_enfor'],
      [3, 'test_criterion_3_enfor'],
      [3, 'test_criterion_3_enfor'],
      [3, 'test_criterion_3_enfor'],
      [4, 'test_criterion_4_a_che'],
    ]);
    expect(new Set(evidence.rows.map((row) => row.test)).size).toBe(evidence.rows.length);
  });

  it('carries the criterion texts of the spec to head each group', () => {
    expect(evidence.criteria.map((entry) => entry.criterion)).toEqual([1, 2, 3, 4]);
    expect(evidence.criteria[2]?.text).toBe('With stock enforcement off, an inventory service error does not block checkouts.');
  });
});

describe('acceptance checks of a pull request', () => {
  const evidence = redGreenEvidence();

  it('summarises the base run by its failing tests and their assertion messages', () => {
    expect(evidence.before.summary).toMatchObject({ passed: 5, failed: 4, skipped: 0, missing: [] });
    expect(evidence.before.summary?.failures).toHaveLength(4);
    expect(evidence.before.summary?.failures[0]).toEqual({
      test: expect.stringMatching(/^test_criterion_1_unreadable_stock_refuses_the_checkout/),
      message: ['AssertionError: the checkout was accepted', 'assert False', '+  where False = isinstance(None, <class \'storefront_api.checkout.Refusal\'>)'].join('\n'),
    });
  });

  it('summarises the branch run by its pass count', () => {
    expect(evidence.after.summary).toEqual({ passed: 9, failed: 0, skipped: 0, failures: [], missing: [] });
  });

  it('reports a branch test that is failing or missing', () => {
    const [first, second] = real.gateTests;
    if (first === undefined || second === undefined) throw new Error('the fixture has no gate tests');
    const events = issue7Events().map((record) =>
      record.type === 'pipeline.gate-completed' && record.subject === ISSUE_SUBJECT
        ? { ...record, payload: { ...payloadOf(record), tests: [{ ...first, outcome: 'failed' }, ...real.gateTests.slice(2)] } }
        : record,
    );
    const context = { ...fixtureContext(), logs: new Map([[`${ISSUE_NUMBER}/before-proof.log`, real.beforeLog], [`${ISSUE_NUMBER}/gate-attempt-1.log`, real.gateLog]]) };
    const redGreen = projectSnapshot(events, context).pullRequests[0]?.evidence.find((entry) => entry.kind === 'red-green');
    expect(redGreen?.kind === 'red-green' ? redGreen.after.summary : null).toMatchObject({ passed: 7, failed: 1, missing: [expect.stringContaining('test_criterion_1_unreadable')] });
  });

  it('shows neither the operator home directory nor the worktree path', () => {
    const shown = JSON.stringify(evidence);
    expect(shown).not.toContain(real.worktree.path);
    expect(shown).not.toContain(OPERATOR_HOME);
    expect(evidence.before.log).toContain('--junitxml=./.factory/reports/pytest.xml');
    expect(evidence.before.log).toContain('rootdir: ./api');
  });
});

describe('withoutLocalPaths', () => {
  it('turns a worktree path into a relative one and a home directory into a tilde', () => {
    expect(withoutLocalPaths('/srv/slot-1/.factory/r.xml in /srv/slot-1 and /Users/ada/dev/x', ['/srv/slot-1'])).toBe('./.factory/r.xml in . and ~/dev/x');
  });

  it('keeps a sibling directory that merely shares the worktree prefix', () => {
    expect(withoutLocalPaths('/srv/slot-10/a', ['/srv/slot-1'])).toBe('/srv/slot-10/a');
  });

  it('leaves text without local paths unchanged', () => {
    expect(withoutLocalPaths('2 failed, 5 passed', ['/srv/slot-1'])).toBe('2 failed, 5 passed');
  });
});
