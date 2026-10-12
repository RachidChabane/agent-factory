import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DELEGABLE_GESTURES,
  DEFAULT_DELEGATE_ACTOR,
  MERGE_CONDITIONS,
  NO_AUTONOMY,
  decideGesture,
  describeAutonomy,
  isDelegateActor,
  unknownMergeTypes,
  unrecordedFilms,
  type AutonomyPolicy,
  type FilmFacts,
  type GestureRequest,
  type MergeFacts,
  type MergeRule,
} from './autonomy-policy.ts';

const ACTOR = DEFAULT_DELEGATE_ACTOR;
const NO_FILMS: FilmFacts = { declared: [], recorded: [], failed: [], pending: [] };
const RECORDED: FilmFacts = { declared: ['checkout-flow'], recorded: ['checkout-flow'], failed: [], pending: [] };
const TYPES = ['docs', 'fix', 'ui', 'feature'] as const;

const typeArbitrary = fc.constantFrom(...TYPES);
const scenarioArbitrary = fc.constantFrom('checkout-flow', 'cart-badge', 'refund');
const scenariosArbitrary = fc.uniqueArray(scenarioArbitrary);
const filmFactsArbitrary: fc.Arbitrary<FilmFacts> = fc.record({
  declared: scenariosArbitrary,
  recorded: scenariosArbitrary,
  failed: scenariosArbitrary,
  pending: scenariosArbitrary,
});
const mergeFactsArbitrary: fc.Arbitrary<MergeFacts> = fc.record({ issueType: typeArbitrary, films: filmFactsArbitrary });
const ruleArbitrary: fc.Arbitrary<MergeRule> = fc.record({
  types: fc.uniqueArray(typeArbitrary, { minLength: 1 }),
  requires: fc.uniqueArray(fc.constantFrom(...MERGE_CONDITIONS)),
});
const policyArbitrary: fc.Arbitrary<AutonomyPolicy> = fc.record({
  actor: fc.constant(ACTOR),
  validateSpecs: fc.boolean(),
  answerDecisions: fc.boolean(),
  resume: fc.boolean(),
  merge: fc.array(ruleArbitrary, { maxLength: 4 }),
});
const requestArbitrary: fc.Arbitrary<GestureRequest> = fc.oneof(
  fc.constant<GestureRequest>({ gesture: 'validate-spec' }),
  fc.constant<GestureRequest>({ gesture: 'answer-decision' }),
  fc.constant<GestureRequest>({ gesture: 'resume' }),
  mergeFactsArbitrary.map((facts): GestureRequest => ({ gesture: 'merge', facts })),
);

function merge(facts: MergeFacts): GestureRequest {
  return { gesture: 'merge', facts };
}

describe('the policy of a project that delegates nothing', () => {
  it('allows no gesture to anyone', () => {
    fc.assert(
      fc.property(fc.constantFrom(ACTOR, 'operator', 'someone-else'), requestArbitrary, (actor, request) => !decideGesture(NO_AUTONOMY, actor, request).allowed),
    );
  });

  it('names the flag a simple gesture lacks', () => {
    expect(decideGesture(NO_AUTONOMY, ACTOR, { gesture: 'validate-spec' })).toEqual({ allowed: false, missing: 'autonomy.validateSpecs is not set' });
    expect(decideGesture(NO_AUTONOMY, ACTOR, { gesture: 'answer-decision' })).toEqual({ allowed: false, missing: 'autonomy.answerDecisions is not set' });
    expect(decideGesture(NO_AUTONOMY, ACTOR, { gesture: 'resume' })).toEqual({ allowed: false, missing: 'autonomy.resume is not set' });
  });

  it('says that no merge rule exists', () => {
    expect(decideGesture(NO_AUTONOMY, ACTOR, merge({ issueType: 'docs', films: NO_FILMS }))).toEqual({ allowed: false, missing: 'autonomy.merge lists no rule' });
  });
});

describe('the gestures a policy delegates', () => {
  const everything: AutonomyPolicy = { actor: ACTOR, validateSpecs: true, answerDecisions: true, resume: true, merge: [{ types: ['docs'], requires: [] }] };

  it('allows each simple gesture its policy names, and only that one', () => {
    for (const gesture of DELEGABLE_GESTURES.filter((candidate) => candidate !== 'merge')) {
      const alone: AutonomyPolicy = { ...NO_AUTONOMY, validateSpecs: gesture === 'validate-spec', answerDecisions: gesture === 'answer-decision', resume: gesture === 'resume' };
      const allowed = DELEGABLE_GESTURES.filter((candidate) => candidate !== 'merge' && decideGesture(alone, ACTOR, { gesture: candidate }).allowed);
      expect(allowed).toEqual([gesture]);
    }
  });

  it('refuses an actor that is not the delegate of the project, whatever the policy says', () => {
    fc.assert(
      fc.property(
        policyArbitrary,
        requestArbitrary,
        fc.constantFrom('operator', 'intern', 'orchestrator-2'),
        (policy, request, actor) => {
          const decision = decideGesture(policy, actor, request);
          return !decision.allowed && decision.missing.includes(`"${policy.actor}"`);
        },
      ),
    );
  });

  it('says which rule allowed a gesture', () => {
    expect(decideGesture(everything, ACTOR, { gesture: 'resume' })).toEqual({ allowed: true, rule: 'autonomy.resume' });
    expect(decideGesture(everything, ACTOR, merge({ issueType: 'docs', films: NO_FILMS }))).toEqual({ allowed: true, rule: 'autonomy.merge for docs' });
  });
});

describe('the merge rules', () => {
  const films: MergeRule = { types: ['fix', 'docs'], requires: ['films-recorded'] };
  const policy: AutonomyPolicy = { ...NO_AUTONOMY, merge: [films, { types: ['ui'], requires: [] }] };

  it('allows a merge only for a listed type whose conditions hold', () => {
    fc.assert(
      fc.property(policyArbitrary, mergeFactsArbitrary, (generated, facts) => {
        const rules = generated.merge.filter((rule) => rule.types.includes(facts.issueType));
        const holds = (rule: MergeRule): boolean => rule.requires.every(() => unrecordedFilms(facts.films) === null);
        const expected = rules.some(holds);
        return decideGesture(generated, ACTOR, merge(facts)).allowed === expected;
      }),
    );
  });

  it('never allows a type no rule lists', () => {
    fc.assert(
      fc.property(policyArbitrary, mergeFactsArbitrary, (generated, facts) => {
        const listed = generated.merge.some((rule) => rule.types.includes(facts.issueType));
        return listed || !decideGesture(generated, ACTOR, merge(facts)).allowed;
      }),
    );
  });

  it('names the types the policy lists when the type is not one of them', () => {
    expect(decideGesture(policy, ACTOR, merge({ issueType: 'feature', films: NO_FILMS }))).toEqual({
      allowed: false,
      missing: 'no autonomy.merge rule lists the issue type "feature" (it lists fix, docs, ui)',
    });
  });

  it('allows a type whose rule requires nothing, with or without films', () => {
    expect(decideGesture(policy, ACTOR, merge({ issueType: 'ui', films: { ...RECORDED, failed: ['x'] } })).allowed).toBe(true);
  });

  it('allows a type whose rule requires films once every declared film is recorded', () => {
    expect(decideGesture(policy, ACTOR, merge({ issueType: 'fix', films: RECORDED }))).toEqual({ allowed: true, rule: 'autonomy.merge for fix, docs, requiring films-recorded' });
  });

  it('allows a type whose rule requires films when the spec declares none', () => {
    expect(decideGesture(policy, ACTOR, merge({ issueType: 'docs', films: NO_FILMS })).allowed).toBe(true);
  });

  it('refuses a type whose declared film is not recorded, and says which', () => {
    const decision = decideGesture(policy, ACTOR, merge({ issueType: 'fix', films: { ...NO_FILMS, declared: ['checkout-flow'] } }));
    expect(decision).toEqual({
      allowed: false,
      missing: 'the autonomy.merge rule for "fix" is not met: films-recorded does not hold: no film is recorded for checkout-flow',
    });
  });

  it('refuses while a film is queued or recording, and after one failed', () => {
    expect(decideGesture(policy, ACTOR, merge({ issueType: 'fix', films: { ...RECORDED, pending: ['checkout-flow'] } }))).toMatchObject({
      allowed: false,
      missing: expect.stringContaining('a film is still queued or recording (checkout-flow)') as string,
    });
    expect(decideGesture(policy, ACTOR, merge({ issueType: 'fix', films: { ...RECORDED, failed: ['cart-badge'] } }))).toMatchObject({
      allowed: false,
      missing: expect.stringContaining('a film failed (cart-badge)') as string,
    });
  });

  it('lets a second rule for the same type allow what the first refuses', () => {
    const both: AutonomyPolicy = { ...NO_AUTONOMY, merge: [{ types: ['fix'], requires: ['films-recorded'] }, { types: ['fix'], requires: [] }] };
    expect(decideGesture(both, ACTOR, merge({ issueType: 'fix', films: { ...NO_FILMS, pending: ['checkout-flow'] } }))).toEqual({ allowed: true, rule: 'autonomy.merge for fix' });
  });
});

describe('the films of a pull request', () => {
  it('count as recorded when every declared scenario is, and none is pending or failed', () => {
    fc.assert(
      fc.property(filmFactsArbitrary, (films) => {
        const everyDeclaredRecorded = films.declared.every((scenario) => films.recorded.includes(scenario));
        return (unrecordedFilms(films) === null) === (everyDeclaredRecorded && films.pending.length === 0 && films.failed.length === 0);
      }),
    );
  });
});

describe('the actor of a policy', () => {
  it('is lowercase letters, digits and dashes, and never the operator', () => {
    for (const actor of ['orchestrator', 'release-bot', 'agent2']) expect(isDelegateActor(actor)).toBe(true);
    for (const actor of ['operator', 'Orchestrator', '', '-x', '2fast', 'a b', 'a_b']) expect(isDelegateActor(actor)).toBe(false);
  });
});

describe('the merge types of a policy', () => {
  it('lists the ones the project does not have, once each', () => {
    const policy: AutonomyPolicy = { ...NO_AUTONOMY, merge: [{ types: ['fix', 'chore'], requires: [] }, { types: ['chore', 'wiki'], requires: [] }] };
    expect(unknownMergeTypes(policy, ['fix', 'docs'])).toEqual(['chore', 'wiki']);
    expect(unknownMergeTypes(NO_AUTONOMY, [])).toEqual([]);
  });
});

describe('the sentence that describes a policy', () => {
  it('says that nothing is delegated', () => {
    expect(describeAutonomy(NO_AUTONOMY)).toBe(`nothing is delegated: every gesture stays the operator's (the delegate would be "orchestrator")`);
  });

  it('says what is delegated to whom', () => {
    const policy: AutonomyPolicy = {
      actor: 'release-bot',
      validateSpecs: true,
      answerDecisions: false,
      resume: true,
      merge: [{ types: ['docs', 'fix'], requires: ['films-recorded'] }, { types: ['ui'], requires: [] }],
    };
    expect(describeAutonomy(policy)).toBe(
      "release-bot may validate specs, resume issues, merge the pull requests of docs and fix issues once films-recorded holds and merge the pull requests of ui issues; every other gesture stays the operator's",
    );
  });
});
