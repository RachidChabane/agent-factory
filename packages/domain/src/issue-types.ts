import { touchesAny } from './glob.ts';
import type { BeforeProofKind, CommitKind } from './model.ts';

/**
 * What the frozen acceptance checks of an issue must show on the base branch, chosen per
 * issue type by the project. The domain implements every strategy; projects only pick one.
 */
export const PROOF_STRATEGIES = ['fails-on-base', 'fails-on-base-when-expressible', 'base-score', 'none'] as const;
export type ProofStrategy = (typeof PROOF_STRATEGIES)[number];

/** What the pull request of an issue type puts in front of the operator. */
export const EVIDENCE_KINDS = ['acceptance-tests', 'screenshots', 'score', 'diff-stat'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** Extra angles the reviewer takes for an issue type, on top of correctness and scope. */
export const REVIEW_FOCUSES = ['security'] as const;
export type ReviewFocus = (typeof REVIEW_FOCUSES)[number];

export const ISSUE_TYPE_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
export const DEFAULT_TYPE_LABEL_PREFIX = 'type:';

export interface CommitPathRule {
  readonly paths: readonly string[];
  readonly type: CommitKind;
}

export interface CommitRule {
  readonly type: CommitKind;
  readonly scope: string | null;
  /** The first rule whose globs match a changed path decides the commit type instead of `type`. */
  readonly whenChanged: readonly CommitPathRule[];
}

export interface IssueTypeDefinition {
  readonly id: string;
  readonly label: string;
  readonly proof: ProofStrategy;
  /** The kind of acceptance check the acceptance-author writes for this type. */
  readonly checks: string;
  readonly commit: CommitRule;
  readonly evidence: readonly EvidenceKind[];
  readonly review: readonly ReviewFocus[];
  /** Globs of the files whose change suggests this type when an outside change is audited. */
  readonly paths: readonly string[];
}

export interface ProofExpectation {
  readonly kind: BeforeProofKind;
  readonly mandatoryFailingBase: boolean;
  readonly failingBaseWhenExpressible: boolean;
}

const PROOF_EXPECTATIONS: Readonly<Record<ProofStrategy, ProofExpectation>> = {
  'fails-on-base': { kind: 'fails-on-base', mandatoryFailingBase: true, failingBaseWhenExpressible: true },
  'fails-on-base-when-expressible': { kind: 'fails-on-base', mandatoryFailingBase: false, failingBaseWhenExpressible: true },
  'base-score': { kind: 'base-score', mandatoryFailingBase: false, failingBaseWhenExpressible: false },
  none: { kind: 'none', mandatoryFailingBase: false, failingBaseWhenExpressible: false },
};

export function proofExpectation(strategy: ProofStrategy): ProofExpectation {
  return PROOF_EXPECTATIONS[strategy];
}

export function typeLabel(id: string, prefix: string = DEFAULT_TYPE_LABEL_PREFIX): string {
  return `${prefix}${id}`;
}

export class UnknownIssueTypeError extends Error {
  readonly type: string;

  constructor(type: string, known: readonly string[]) {
    super(`unknown issue type "${type}"; this project knows ${known.join(', ')}`);
    this.name = 'UnknownIssueTypeError';
    this.type = type;
  }
}

export class InvalidTypologyError extends Error {
  constructor(reason: string) {
    super(`invalid issue typology: ${reason}`);
    this.name = 'InvalidTypologyError';
  }
}

function duplicatesOf(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

/** The issue types of one project, looked up by id or by forge label. */
export class IssueTypology {
  readonly definitions: readonly IssueTypeDefinition[];
  private readonly byId: ReadonlyMap<string, IssueTypeDefinition>;
  private readonly byLabel: ReadonlyMap<string, IssueTypeDefinition>;

  constructor(definitions: readonly IssueTypeDefinition[]) {
    if (definitions.length === 0) throw new InvalidTypologyError('a project declares at least one issue type');
    const badIds = definitions.map((definition) => definition.id).filter((id) => !ISSUE_TYPE_ID_PATTERN.test(id));
    if (badIds.length > 0) throw new InvalidTypologyError(`ids must be lowercase words joined by dashes: ${badIds.join(', ')}`);
    const repeatedIds = duplicatesOf(definitions.map((definition) => definition.id));
    if (repeatedIds.length > 0) throw new InvalidTypologyError(`ids are declared twice: ${repeatedIds.join(', ')}`);
    const repeatedLabels = duplicatesOf(definitions.map((definition) => definition.label));
    if (repeatedLabels.length > 0) throw new InvalidTypologyError(`labels are declared twice: ${repeatedLabels.join(', ')}`);
    this.definitions = definitions;
    this.byId = new Map(definitions.map((definition) => [definition.id, definition]));
    this.byLabel = new Map(definitions.map((definition) => [definition.label, definition]));
  }

  ids(): readonly string[] {
    return this.definitions.map((definition) => definition.id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get(id: string): IssueTypeDefinition {
    const definition = this.byId.get(id);
    if (definition === undefined) throw new UnknownIssueTypeError(id, this.ids());
    return definition;
  }

  fromLabels(labels: readonly string[]): IssueTypeDefinition | null {
    for (const label of labels) {
      const definition = this.byLabel.get(label);
      if (definition !== undefined) return definition;
    }
    return null;
  }
}

/** The first type, in the project's order, whose paths an outside change touches; null when none does. */
export function suggestTypeForPaths(typology: IssueTypology, changedPaths: readonly string[]): IssueTypeDefinition | null {
  return typology.definitions.find((definition) => definition.paths.length > 0 && touchesAny(changedPaths, definition.paths)) ?? null;
}
