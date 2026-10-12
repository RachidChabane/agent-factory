import { describe, expect, it } from 'vitest';
import { createdIssueNumber, mergedPullRequest, openedPullRequest, STATUS_FIELDS, statusFields, validationFailures } from './cli-output.ts';
import { ExpectationFailed } from './expectations.ts';

const MERGE_SHA = 'df637812051096691237f75e5b028ada0db51917';

const CREATED = 'storefront#1 created on the local forge of example-org/storefront (/work/projects/storefront/forge) [factory, type:feature] and validated: the factory takes it at its next tick';
const OPENED = 'storefront#1: pull request #2 is open: file:///work/projects/storefront/forge/pulls/2.md';
const MERGED = `Pull request #2 of storefront#1 merged as ${MERGE_SHA}`;
const STATUS = [
  'storefront#1: Filter the catalogue by category',
  'State: merged',
  'Branch: factory/1-filter-the-catalogue-by-category',
  'Before proof: valid (fails-on-base)',
  'Last gate: attempt 1 passed',
  'Pull request: #2 file:///work/projects/storefront/forge/pulls/2.md',
  `Merged as: ${MERGE_SHA}`,
].join('\n');

describe('the output of the factory commands', () => {
  it('names the issue a command created', () => {
    expect(createdIssueNumber(CREATED)).toBe(1);
  });

  it('names the issue and the pull request a run opened', () => {
    expect(openedPullRequest(OPENED)).toEqual({ issue: 1, pullRequest: 2 });
  });

  it('names the pull request, the issue and the commit of a merge', () => {
    expect(mergedPullRequest(MERGED)).toEqual({ issue: 1, pullRequest: 2, mergeSha: MERGE_SHA });
  });

  it('rejects an output that does not say what it should, and shows it', () => {
    const refusal = 'Merge of pull request #2 refused: checks still running: gate (pending)';
    expect(() => mergedPullRequest(refusal)).toThrow(ExpectationFailed);
    expect(() => mergedPullRequest(refusal)).toThrow(refusal);
    expect(() => createdIssueNumber(OPENED)).toThrow(ExpectationFailed);
  });

  it('rejects a merge commit that is not a full sha', () => {
    expect(() => mergedPullRequest('Pull request #2 of storefront#1 merged as df63781')).toThrow(ExpectationFailed);
  });

  it('lists the required checks a validation reports as failed', () => {
    const output = ['ok   configuration: /work/config.yaml: storefront', 'FAIL git: not found', 'warn notifications: none', 'skip claude: not run with --offline'].join('\n');
    expect(validationFailures(output)).toEqual(['FAIL git: not found']);
    expect(validationFailures('ok   configuration: /work/config.yaml: storefront')).toEqual([]);
  });

  it('reads the labelled fields of a status', () => {
    const fields = statusFields(STATUS);
    expect(fields.get(STATUS_FIELDS.state)).toBe('merged');
    expect(fields.get(STATUS_FIELDS.beforeProof)).toBe('valid (fails-on-base)');
    expect(fields.get(STATUS_FIELDS.lastGate)).toBe('attempt 1 passed');
    expect(fields.get(STATUS_FIELDS.mergedAs)).toBe(MERGE_SHA);
  });
});
