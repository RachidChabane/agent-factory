/** The gestures of the operator that a project can delegate: what the cycle waits on. */
export const DELEGABLE_GESTURES = ['validate-spec', 'answer-decision', 'resume', 'merge'] as const;
export type DelegableGesture = (typeof DELEGABLE_GESTURES)[number];

/** The gestures of the operator that no policy delegates: they stay the operator's whatever a project declares. */
export const OPERATOR_ONLY_GESTURES = ['review-again'] as const;
export type OperatorOnlyGesture = (typeof OPERATOR_ONLY_GESTURES)[number];

/** Every gesture a delegate can ask for, whether a policy can allow it or not. */
export type RequestedGesture = DelegableGesture | OperatorOnlyGesture;

/** What a merge rule can require besides the issue type. */
export const MERGE_CONDITIONS = ['films-recorded'] as const;
export type MergeCondition = (typeof MERGE_CONDITIONS)[number];

/** Who the person running the factory is in the record; the delegate is never named so. */
export const OPERATOR_ACTOR = 'operator';
export const DEFAULT_DELEGATE_ACTOR = 'orchestrator';
export const DELEGATE_ACTOR_PATTERN = /^[a-z][a-z0-9-]*$/;
export const DELEGATE_ACTOR_RULE = `lowercase letters, digits and dashes, starting with a letter, and not "${OPERATOR_ACTOR}"`;

const GESTURE_PHRASES: Readonly<Record<RequestedGesture, string>> = {
  'validate-spec': 'validate a spec',
  'answer-decision': 'answer a decision',
  resume: 'resume an issue',
  merge: 'merge a pull request',
  'review-again': 'order a new review of the same implementation',
};

const OPERATOR_ONLY_REASONS: Readonly<Record<OperatorOnlyGesture, string>> = {
  'review-again': 'the autonomy policy cannot delegate a new review of the same implementation; only the operator orders it',
};

const LIST_SEPARATOR = ', ';
const FINAL_LIST_WORD = ' and ';

/** A rule that lets the delegate merge the pull requests of some issue types once its conditions hold. */
export interface MergeRule {
  readonly types: readonly string[];
  readonly requires: readonly MergeCondition[];
}

/** What a project delegates, and to whom. Anything the policy does not name stays the operator's. */
export interface AutonomyPolicy {
  readonly actor: string;
  readonly validateSpecs: boolean;
  readonly answerDecisions: boolean;
  readonly resume: boolean;
  readonly merge: readonly MergeRule[];
}

/** The policy of a project that declares none: nothing is delegated. */
export const NO_AUTONOMY: AutonomyPolicy = { actor: DEFAULT_DELEGATE_ACTOR, validateSpecs: false, answerDecisions: false, resume: false, merge: [] };

export function isDelegateActor(actor: string): boolean {
  return actor !== OPERATOR_ACTOR && DELEGATE_ACTOR_PATTERN.test(actor);
}

export function gesturePhrase(gesture: RequestedGesture): string {
  return GESTURE_PHRASES[gesture];
}

/** The films of a pull request as the journal knows them, by scenario. */
export interface FilmFacts {
  /** The scenarios the spec declares. */
  readonly declared: readonly string[];
  /** The scenarios whose film was recorded for the pull request as it is now. */
  readonly recorded: readonly string[];
  readonly failed: readonly string[];
  /** The scenarios whose film is queued or recording. */
  readonly pending: readonly string[];
}

export interface MergeFacts {
  readonly issueType: string;
  readonly films: FilmFacts;
}

/** A gesture no policy delegates, asked for by a delegate. */
interface OperatorOnlyRequest {
  readonly gesture: OperatorOnlyGesture;
}

/** A gesture the delegate wants to make, with the facts a decision about it needs. */
export type GestureRequest =
  | { readonly gesture: 'validate-spec' }
  | { readonly gesture: 'answer-decision' }
  | { readonly gesture: 'resume' }
  | { readonly gesture: 'merge'; readonly facts: MergeFacts }
  | OperatorOnlyRequest;

/** Allowed, with the gesture and the rule of the policy that allows it; or refused, with what the policy lacks. */
export type GestureDecision =
  | { readonly allowed: true; readonly gesture: DelegableGesture; readonly rule: string }
  | { readonly allowed: false; readonly missing: string };

function isOperatorOnly(request: GestureRequest): request is OperatorOnlyRequest {
  return OPERATOR_ONLY_GESTURES.some((gesture) => gesture === request.gesture);
}

function words(items: readonly string[]): string {
  const last = items.at(-1);
  if (items.length < 2 || last === undefined) return items.join(LIST_SEPARATOR);
  return `${items.slice(0, -1).join(LIST_SEPARATOR)}${FINAL_LIST_WORD}${last}`;
}

/** Why every film a spec declares is not recorded on the pull request, or null when it is: pending and failed films count, an undeclared one does not. */
export function unrecordedFilms(films: FilmFacts): string | null {
  if (films.pending.length > 0) return `a film is still queued or recording (${films.pending.join(LIST_SEPARATOR)})`;
  if (films.failed.length > 0) return `a film failed (${films.failed.join(LIST_SEPARATOR)})`;
  const absent = films.declared.filter((scenario) => !films.recorded.includes(scenario));
  return absent.length === 0 ? null : `no film is recorded for ${absent.join(LIST_SEPARATOR)}`;
}

/** The problem with a condition of a merge rule, or null when it holds. */
function conditionProblem(condition: MergeCondition, facts: MergeFacts): string | null {
  switch (condition) {
    case 'films-recorded':
      return unrecordedFilms(facts.films);
  }
}

function ruleProblems(rule: MergeRule, facts: MergeFacts): readonly string[] {
  return rule.requires.flatMap((condition) => {
    const problem = conditionProblem(condition, facts);
    return problem === null ? [] : [`${condition} does not hold: ${problem}`];
  });
}

/** How a merge rule reads in a record: the types it covers and what it requires. */
export function describeMergeRule(rule: MergeRule): string {
  const requirement = rule.requires.length === 0 ? '' : `, requiring ${rule.requires.join(LIST_SEPARATOR)}`;
  return `autonomy.merge for ${rule.types.join(LIST_SEPARATOR)}${requirement}`;
}

function decideMerge(policy: AutonomyPolicy, facts: MergeFacts): GestureDecision {
  const covering = policy.merge.filter((rule) => rule.types.includes(facts.issueType));
  if (covering.length === 0) {
    const covered = [...new Set(policy.merge.flatMap((rule) => rule.types))];
    const listed = covered.length === 0 ? 'autonomy.merge lists no rule' : `no autonomy.merge rule lists the issue type "${facts.issueType}" (it lists ${covered.join(LIST_SEPARATOR)})`;
    return { allowed: false, missing: listed };
  }
  const outcomes = covering.map((rule) => ({ rule, problems: ruleProblems(rule, facts) }));
  const allowing = outcomes.find((outcome) => outcome.problems.length === 0);
  if (allowing !== undefined) return { allowed: true, gesture: 'merge', rule: describeMergeRule(allowing.rule) };
  const unmet = outcomes.flatMap((outcome) => outcome.problems);
  return { allowed: false, missing: `the autonomy.merge rule for "${facts.issueType}" is not met: ${[...new Set(unmet)].join('; ')}` };
}

const FLAG_RULES = {
  'validate-spec': { flag: 'validateSpecs', allowedBy: 'autonomy.validateSpecs' },
  'answer-decision': { flag: 'answerDecisions', allowedBy: 'autonomy.answerDecisions' },
  resume: { flag: 'resume', allowedBy: 'autonomy.resume' },
} as const satisfies Readonly<Record<Exclude<DelegableGesture, 'merge'>, { readonly flag: keyof AutonomyPolicy; readonly allowedBy: string }>>;

/**
 * Whether the policy lets `actor` make the gesture. Only the policy's own delegate is ever allowed, and
 * only for a gesture the policy names: an empty policy allows nothing, and a gesture no policy delegates
 * is refused to everyone.
 */
export function decideGesture(policy: AutonomyPolicy, actor: string, request: GestureRequest): GestureDecision {
  if (isOperatorOnly(request)) return { allowed: false, missing: OPERATOR_ONLY_REASONS[request.gesture] };
  if (actor !== policy.actor) return { allowed: false, missing: `the delegate of the project is "${policy.actor}", not "${actor}"` };
  if (request.gesture === 'merge') return decideMerge(policy, request.facts);
  const { flag, allowedBy } = FLAG_RULES[request.gesture];
  return policy[flag] === true ? { allowed: true, gesture: request.gesture, rule: allowedBy } : { allowed: false, missing: `${allowedBy} is not set` };
}

/** The merge rules that cover a type the project does not have, for a configuration to refuse. */
export function unknownMergeTypes(policy: AutonomyPolicy, knownTypes: readonly string[]): readonly string[] {
  return [...new Set(policy.merge.flatMap((rule) => rule.types).filter((type) => !knownTypes.includes(type)))];
}

/** One sentence saying what is delegated to whom, or that nothing is. */
export function describeAutonomy(policy: AutonomyPolicy): string {
  const merges = policy.merge.map((rule) => {
    const requirement = rule.requires.length === 0 ? '' : ` once ${words(rule.requires)} holds`;
    return `merge the pull requests of ${words(rule.types)} issues${requirement}`;
  });
  const abilities = [
    ...(policy.validateSpecs ? ['validate specs'] : []),
    ...(policy.answerDecisions ? ['answer decisions'] : []),
    ...(policy.resume ? ['resume issues'] : []),
    ...merges,
  ];
  if (abilities.length === 0) return `nothing is delegated: every gesture stays the operator's (the delegate would be "${policy.actor}")`;
  return `${policy.actor} may ${words(abilities)}; every other gesture stays the operator's`;
}
