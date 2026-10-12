import { describe, expect, it } from 'vitest';
import type { DeploymentRecord, DeploymentState } from '../ports.ts';
import { deploymentRanges } from './deployment-ranges.ts';

function record(id: string, sha: string, state: DeploymentState): DeploymentRecord {
  return {
    id,
    environment: 'storefront-staging',
    ref: 'main',
    sha,
    createdAt: new Date('2026-10-12T08:00:00.000Z'),
    creator: null,
    state,
    logUrl: null,
    environmentUrl: null,
  };
}

describe('deploymentRanges', () => {
  it('returns no range for no deployments', () => {
    expect(deploymentRanges([]).size).toBe(0);
  });

  it('has no base for the only deployment', () => {
    expect(deploymentRanges([record('1', 'a', 'success')]).get('1')).toEqual({ baseSha: null, headSha: 'a' });
  });

  it('takes the nearest older landed deployment as the base', () => {
    const ranges = deploymentRanges([record('3', 'c', 'success'), record('2', 'b', 'inactive'), record('1', 'a', 'success')]);
    expect(ranges.get('3')).toEqual({ baseSha: 'b', headSha: 'c' });
    expect(ranges.get('2')).toEqual({ baseSha: 'a', headSha: 'b' });
    expect(ranges.get('1')).toEqual({ baseSha: null, headSha: 'a' });
  });

  it('skips failed and in-progress deployments when looking for the base', () => {
    const ranges = deploymentRanges([record('4', 'd', 'success'), record('3', 'c', 'failure'), record('2', 'b', 'in-progress'), record('1', 'a', 'success')]);
    expect(ranges.get('4')).toEqual({ baseSha: 'a', headSha: 'd' });
    expect(ranges.get('3')).toEqual({ baseSha: 'a', headSha: 'c' });
  });

  it('keeps the same base and head sha when a commit is deployed twice', () => {
    const ranges = deploymentRanges([record('2', 'a', 'success'), record('1', 'a', 'inactive')]);
    expect(ranges.get('2')).toEqual({ baseSha: 'a', headSha: 'a' });
  });

  it('has no base when every older deployment failed', () => {
    expect(deploymentRanges([record('2', 'b', 'success'), record('1', 'a', 'failure')]).get('2')).toEqual({ baseSha: null, headSha: 'b' });
  });
});
