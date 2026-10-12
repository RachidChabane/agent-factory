import { describe, expect, it } from 'vitest';
import { NO_AUTONOMY, type AutonomyPolicy } from '@agent-factory/domain';
import { PullRequestNotFromFactoryError } from '../pipeline/pipeline-errors.ts';
import { ISSUE_NUMBER } from '../pipeline/testing/pipeline-scenario.ts';
import { FINAL_SCREENSHOT, SCENARIO } from '../film/testing/film-fakes.ts';
import { openPullRequest, type Film } from '../film/testing/film-world.ts';
import type { FilmOrder } from '../film/film-order.ts';
import { GESTURE_MADE_EVENT } from './autonomy-events.ts';
import { AutonomyGate, GestureRefusedError } from './autonomy-gate.ts';
import { delegatedDecisionsOf } from './delegated-decisions.ts';
import type { Delegation } from './delegation.ts';
import { describeGestureMade } from './gesture-sentence.ts';

const ORDER: FilmOrder = { issueNumber: ISSUE_NUMBER, scenario: SCENARIO, operator: 'Alex Morgan' };
const SIGNAL = new AbortController().signal;
const PULL_REQUEST = 100;
const DELEGATION: Delegation = { actor: 'orchestrator', reason: 'the change only touches documentation' };
const POLICY: AutonomyPolicy = { ...NO_AUTONOMY, validateSpecs: true, merge: [{ types: ['ui'], requires: ['films-recorded'] }] };

function gateOf(world: Film, policy: AutonomyPolicy = POLICY): AutonomyGate {
  return new AutonomyGate(world.scenario.events, { project: 'storefront', policy });
}

async function film(world: Film): Promise<void> {
  world.recorder.screenshots = [FINAL_SCREENSHOT];
  await world.behaviour.film(ORDER, SIGNAL);
}

describe('AutonomyGate', () => {
  it('allows a gesture the policy delegates and says which rule allowed it', async () => {
    const world = await openPullRequest();
    expect(gateOf(world).authorise(DELEGATION, 'validate-spec')).toEqual({ gesture: 'validate-spec', rule: 'autonomy.validateSpecs' });
  });

  it('refuses a gesture the policy lacks, naming the actor, the gesture, the project and the missing rule', async () => {
    const world = await openPullRequest();
    const attempt = (): unknown => gateOf(world).authorise(DELEGATION, 'resume');
    expect(attempt).toThrow(GestureRefusedError);
    expect(attempt).toThrow('Refused: orchestrator may not resume an issue in project storefront: autonomy.resume is not set');
  });

  it('refuses an actor that is not the delegate of the project', async () => {
    const world = await openPullRequest();
    expect(() => gateOf(world).authorise({ actor: 'intern', reason: 'because' }, 'validate-spec')).toThrow('the delegate of the project is "orchestrator", not "intern"');
  });

  it('allows a merge for a listed issue type whose films are recorded', async () => {
    const world = await openPullRequest();
    expect(await gateOf(world).authoriseMerge(DELEGATION, PULL_REQUEST)).toEqual({ gesture: 'merge', rule: 'autonomy.merge for ui, requiring films-recorded' });
  });

  it('refuses a merge for an issue type no rule lists', async () => {
    const world = await openPullRequest();
    const docsOnly: AutonomyPolicy = { ...NO_AUTONOMY, merge: [{ types: ['docs'], requires: [] }] };
    await expect(gateOf(world, docsOnly).authoriseMerge(DELEGATION, PULL_REQUEST)).rejects.toThrow(
      'Refused: orchestrator may not merge a pull request in project storefront: no autonomy.merge rule lists the issue type "ui" (it lists docs)',
    );
  });

  it('refuses a merge while a declared film is not recorded, and allows it once it is', async () => {
    const world = await openPullRequest([SCENARIO]);
    await expect(gateOf(world).authoriseMerge(DELEGATION, PULL_REQUEST)).rejects.toThrow(`films-recorded does not hold: a film is still queued or recording (${SCENARIO})`);
    await film(world);
    expect((await gateOf(world).authoriseMerge(DELEGATION, PULL_REQUEST)).gesture).toBe('merge');
  });

  it('refuses a merge after a film failed, even though the merge itself would not wait for it', async () => {
    const world = await openPullRequest([SCENARIO]);
    await world.services.queue.order(ORDER);
    await world.services.queue.fail(ORDER, 'the browser crashed');
    await expect(gateOf(world).authoriseMerge(DELEGATION, PULL_REQUEST)).rejects.toThrow(`a film failed (${SCENARIO})`);
  });

  it('refuses a pull request the factory did not open before it reads anything else', async () => {
    const world = await openPullRequest();
    await expect(gateOf(world).authoriseMerge(DELEGATION, 999)).rejects.toBeInstanceOf(PullRequestNotFromFactoryError);
  });

  it('records the gesture on the issue, with the actor, the reason and the rule, and lists it newest first', async () => {
    const world = await openPullRequest();
    const gate = gateOf(world);
    const validated = gate.authorise(DELEGATION, 'validate-spec');
    await gate.record(DELEGATION, validated, { kind: 'issue', number: ISSUE_NUMBER, issueNumber: ISSUE_NUMBER });
    const merged = await gate.authoriseMerge(DELEGATION, PULL_REQUEST);
    const payload = await gate.record({ actor: 'orchestrator', reason: 'every criterion is proven' }, merged, { kind: 'pull-request', number: PULL_REQUEST, issueNumber: ISSUE_NUMBER });

    expect(payload).toEqual({
      actor: 'orchestrator',
      gesture: 'merge',
      target: { kind: 'pull-request', number: PULL_REQUEST },
      issueNumber: ISSUE_NUMBER,
      reason: 'every criterion is proven',
      rule: 'autonomy.merge for ui, requiring films-recorded',
    });
    const records = await world.scenario.events.read(`issue/${ISSUE_NUMBER}`, 0);
    expect(records.filter((record) => record.type === GESTURE_MADE_EVENT)).toHaveLength(2);
    const decisions = delegatedDecisionsOf(records);
    expect(decisions.map((decision) => describeGestureMade(decision))).toEqual([`orchestrator merged pull request #${PULL_REQUEST}`, `orchestrator validated the spec of issue #${ISSUE_NUMBER}`]);
  });

  it('leaves out of the list a record that does not parse', async () => {
    const world = await openPullRequest();
    await world.scenario.events.append(GESTURE_MADE_EVENT, `issue/${ISSUE_NUMBER}`, { actor: 'orchestrator' });
    expect(delegatedDecisionsOf(await world.scenario.events.read(`issue/${ISSUE_NUMBER}`, 0))).toEqual([]);
  });
});
