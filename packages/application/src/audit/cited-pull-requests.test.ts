import { describe, expect, it } from 'vitest';
import { citedPullRequests, renderCitedPullRequests } from './cited-pull-requests.ts';

describe('citedPullRequests', () => {
  it.each([
    ['Merge pull request #271 from example-org/roadmap\n\nbody mentioning #5', [271]],
    ['feat(skills): add go-to-market (#275)', [275]],
    ['fix: one (#1), refs #2 and #1', [1, 2]],
    ['Direct fix', []],
    ['', []],
  ])('reads the subject of %j', (message, expected) => {
    expect(citedPullRequests(message)).toEqual(expected);
  });

  it('renders the numbers as references', () => {
    expect(renderCitedPullRequests([1, 2])).toBe('#1, #2');
  });
});
