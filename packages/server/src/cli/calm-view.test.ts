import { describe, expect, it } from 'vitest';
import type { RestartHazard } from '@agent-factory/application';
import { renderCalm } from './calm-view.ts';

const NOW = new Date('2026-10-12T12:00:00.000Z');
const AGENT_RUN: RestartHazard = { kind: 'agent-run', project: 'storefront', role: 'implementer', subject: 'issue 12', startedAt: new Date('2026-10-12T11:56:00.000Z') };
const FILM: RestartHazard = { kind: 'film-recording', project: 'storefront', issueNumber: 12, scenario: 'checkout-flow', stage: 'recording-head' };
const STAGE: RestartHazard = { kind: 'deterministic-stage', project: 'ledger', issueNumber: 7, state: 'gating' };

describe('the calm line of the status', () => {
  it('says the moment is calm when a running factory has no work in flight', () => {
    expect(renderCalm(true, [], NOW)).toEqual(['Calm: yes']);
  });

  it('says it is not, and what a restart would cut short, one line each', () => {
    expect(renderCalm(true, [AGENT_RUN, FILM, STAGE], NOW)).toEqual([
      'Calm: no',
      '  agent run (implementer) for storefront issue 12, started 4 min ago',
      '  film recording: checkout-flow for storefront#12 (recording the head)',
      '  issue in a stage the factory runs by itself: ledger#7 is gating',
    ]);
  });

  it('names the installation for an agent run that belongs to no project', () => {
    expect(renderCalm(true, [{ ...AGENT_RUN, project: null, subject: 'audit abc1234' }], NOW)[1]).toBe('  agent run (implementer) for the installation audit abc1234, started 4 min ago');
  });

  it('tells a film whose stage is not known without a stage', () => {
    expect(renderCalm(true, [{ ...FILM, stage: null }], NOW)[1]).toBe('  film recording: checkout-flow for storefront#12');
  });

  it('is calm for a factory that is not running, whatever the log still shows of the process it died in', () => {
    expect(renderCalm(false, [AGENT_RUN, FILM, STAGE], NOW)).toEqual(['Calm: yes (the factory is not running)']);
  });
});
