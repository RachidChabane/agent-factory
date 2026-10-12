import { describe, expect, it } from 'vitest';
import { ISSUE_NUMBER, PipelineScenario, SCENARIO_CONVENTIONS } from '../pipeline/testing/pipeline-scenario.ts';
import { ISSUE_SPEC_VALIDATED_EVENT } from './issue-events.ts';
import { validateSpec } from './validate-spec.ts';

const labelled: (readonly string[])[] = [];

function labelling(scenario: PipelineScenario) {
  return {
    getIssue: (number: number) => scenario.github.getIssue(number),
    setLabels: (_number: number, add: readonly string[]) => {
      labelled.push(add);
      return Promise.resolve();
    },
  };
}

async function validatedPayload(scenario: PipelineScenario, delegation?: { actor: string; reason: string }): Promise<unknown> {
  await validateSpec({ github: labelling(scenario), events: scenario.events }, ISSUE_NUMBER, 'alex', SCENARIO_CONVENTIONS, delegation ?? null);
  const records = await scenario.events.read(`issue/${ISSUE_NUMBER}`, 0);
  return records.findLast((record) => record.type === ISSUE_SPEC_VALIDATED_EVENT)?.payload;
}

describe('validateSpec', () => {
  it('records the operator who validated the spec', async () => {
    expect(await validatedPayload(new PipelineScenario())).toEqual({ operator: 'alex' });
  });

  it('records the delegate and the reason beside the operator when the delegate validated it', async () => {
    const scenario = new PipelineScenario();
    expect(await validatedPayload(scenario, { actor: 'orchestrator', reason: 'the spec follows the template' })).toEqual({
      operator: 'alex',
      actor: 'orchestrator',
      reason: 'the spec follows the template',
    });
    expect(labelled.at(-1)).toEqual(['spec:validated']);
  });
});
