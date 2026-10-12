import { DEFAULT_ISSUE_TYPES, IssueTypology, type AttributionRules, type AutomationPattern, type IssueTypeDefinition } from '@agent-factory/domain';

export const DEFAULT_FACTORY_LABEL = 'factory';
export const DEFAULT_VALIDATED_LABEL = 'spec:validated';
export const DEFAULT_AUDIT_LABEL = 'audit';
export const DEFAULT_KIND_LABEL_PREFIX = 'kind:';
export const DEFAULT_BRANCH_PREFIX = 'factory/';
export const DEFAULT_COMMIT_SCOPE = 'repo';

/** How one project names things on its forge and in its history. */
export interface ProjectConventions {
  readonly typology: IssueTypology;
  readonly labels: {
    /** Marks the factory's pull requests and audit issues. */
    readonly factory: string;
    /** Marks an issue whose specification the operator validated. */
    readonly validated: string;
    readonly audit: string;
    /** `<prefix><conventional type>` on an issue overrides the commit type of its issue type. */
    readonly kindPrefix: string;
  };
  readonly branchPrefix: string;
  readonly defaultScope: string;
  /** The repository's other automations: their changes are recorded, never audited. */
  readonly automations: readonly AutomationPattern[];
}

export const DEFAULT_PROJECT_CONVENTIONS: ProjectConventions = {
  typology: new IssueTypology(DEFAULT_ISSUE_TYPES),
  labels: { factory: DEFAULT_FACTORY_LABEL, validated: DEFAULT_VALIDATED_LABEL, audit: DEFAULT_AUDIT_LABEL, kindPrefix: DEFAULT_KIND_LABEL_PREFIX },
  branchPrefix: DEFAULT_BRANCH_PREFIX,
  defaultScope: DEFAULT_COMMIT_SCOPE,
  automations: [],
};

export function issueTypeOf(conventions: ProjectConventions, type: string): IssueTypeDefinition {
  return conventions.typology.get(type);
}

/** The labels the project's forge must offer: the factory's own and one per issue type. */
export function requiredLabels(conventions: ProjectConventions): readonly string[] {
  const { factory, validated, audit } = conventions.labels;
  return [factory, validated, audit, ...conventions.typology.definitions.map((type) => type.label)];
}

export function attributionRules(conventions: ProjectConventions): AttributionRules {
  return { branchPrefix: conventions.branchPrefix, factoryLabel: conventions.labels.factory, automations: conventions.automations };
}
