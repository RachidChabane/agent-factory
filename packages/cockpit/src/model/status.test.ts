import { describe, expect, it } from 'vitest';
import { checksSummaryMark, environmentMark, freshnessMark, issueMark, releaseMark, toolMark, workflowMark } from './status.ts';

describe('status marks', () => {
  it('shows a release another version has overtaken as settled, whatever state it was left in', () => {
    expect(releaseMark('open')).toBe('idle');
    expect(releaseMark('blocked')).toBe('blocked');
    expect(releaseMark('promotable')).toBe('waiting');
    expect(releaseMark('blocked', '1.8.0')).toBe('idle');
    expect(releaseMark('promotable', '1.8.0')).toBe('idle');
  });

  it('shows a tool that was never checked as idle, not broken', () => {
    expect(toolMark(null)).toBe('idle');
    expect(toolMark('connected')).toBe('success');
    expect(toolMark('unauthenticated')).toBe('waiting');
    expect(toolMark('missing')).toBe('blocked');
    expect(toolMark('error')).toBe('failed');
  });

  it('knows an environment about which nothing was read', () => {
    expect(environmentMark('unknown')).toBe('idle');
    expect(environmentMark('down')).toBe('failed');
    expect(environmentMark('degraded')).toBe('waiting');
  });

  it('marks the issues that need the operator', () => {
    expect(issueMark('needs-human')).toBe('failed');
    expect(issueMark('spec-draft')).toBe('waiting');
    expect(issueMark('ready-to-merge')).toBe('waiting');
    expect(issueMark('implementing')).toBe('running');
    expect(issueMark('in-prod')).toBe('success');
    expect(issueMark('abandoned')).toBe('blocked');
  });

  it('summarises the checks of a pull request by its worst one', () => {
    expect(checksSummaryMark([])).toBe('idle');
    expect(checksSummaryMark(['success', 'neutral'])).toBe('success');
    expect(checksSummaryMark(['success', 'pending'])).toBe('running');
    expect(checksSummaryMark(['pending', 'failure'])).toBe('failed');
  });

  it('marks a workflow run by its conclusion once it is completed', () => {
    expect(workflowMark({ status: 'queued', conclusion: null })).toBe('running');
    expect(workflowMark({ status: 'completed', conclusion: 'cancelled' })).toBe('blocked');
    expect(workflowMark({ status: 'completed', conclusion: null })).toBe('idle');
  });

  it('marks the freshness of a usage reading', () => {
    expect(freshnessMark('fresh')).toBe('success');
    expect(freshnessMark('stale')).toBe('waiting');
    expect(freshnessMark('window-reset')).toBe('idle');
  });
});
