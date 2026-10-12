import type { AuditVerdictReport, ChallengeAnswer } from '@agent-factory/application';
import type { ReviewFinding } from '@agent-factory/domain';

/** A file an agent or a person writes, by its path from the repository root. */
export interface StoryFile {
  readonly path: string;
  readonly content: string;
}

export interface StoryPerson {
  readonly name: string;
  readonly email: string;
  /** The login the forge shows for the person. */
  readonly login: string;
}

/** One attempt of the implementer: what it says while it works, the files it writes and removes, and its closing message. */
export interface StoryAttempt {
  readonly says: readonly string[];
  readonly writes: readonly StoryFile[];
  readonly deletes: readonly string[];
  readonly final: string;
}

/** The acceptance checks the acceptance author writes for an issue, run by Node's test runner. */
export interface StoryChecks {
  readonly says: readonly string[];
  /** The check files, with any helper they import. */
  readonly files: readonly StoryFile[];
  readonly checks: readonly { readonly criterion: number; readonly paths: readonly string[]; readonly description: string }[];
  /** The command that runs the check files, such as ["node", "--test", "test/acceptance/category-filter.test.js"]. */
  readonly command: readonly string[];
  /** The files the command writes for the pull request to show, such as an image drawn by a check; the factory keeps them from the run on the base and from the run on the branch. Empty when the checks only assert. */
  readonly evidence: readonly string[];
  readonly final: string;
}

export interface StorySpec {
  readonly title: string;
  readonly type: string;
  readonly need: string;
  readonly acceptanceCriteria: readonly string[];
  readonly outOfScope: readonly string[];
  readonly expectedProof: string;
  /** The scenarios the pull request must show on video, written as the spec file's `Films:` header; none when absent. */
  readonly films?: readonly string[];
}

/** What the reviewer says about the change, and the findings it reports. */
export interface StoryReview {
  readonly says: string;
  readonly findings: readonly ReviewFinding[];
}

/** What the scripted agents do for an issue once the factory takes it: the checks, the implementer's attempts and the review. */
export interface StoryWork {
  readonly checks: StoryChecks;
  /** The decision the implementer asks the operator for before it writes anything, when the issue needs one. */
  readonly decision: string | null;
  /** The implementer's attempts, each one played after the gate refused the previous one. */
  readonly attempts: readonly StoryAttempt[];
  readonly review: StoryReview;
}

export interface StoryIssue extends StoryWork {
  /** How the story refers to the issue; the forge gives its number. */
  readonly key: string;
  readonly spec: StorySpec;
  /** Keys of the issues of the same project this one waits on. */
  readonly dependsOn: readonly string[];
  /** Whether the operator validates the spec, so the factory takes the issue; otherwise it stays a draft. */
  readonly validate: boolean;
  /** The reason the project's orchestrator gives for validating the spec in the operator's place, under the project's autonomy; absent when the operator validates it. */
  readonly delegatedValidation?: string;
}

/** The work of a spec that a challenge proposes, played when the operator accepts the spec and validates the issue it becomes. */
export interface StoryProposedIssue extends StoryWork {
  /** The exact title of the proposed spec: the scripted agents are selected by it. */
  readonly title: string;
}

export interface StoryRequest {
  readonly key: string;
  readonly title: string;
  readonly requester: string;
  /** The request as it reached the team, in Markdown. */
  readonly body: string;
  /** The challenger's answer when the story asks for a challenge; the operator can challenge the others from the cockpit. */
  readonly challenge: ChallengeAnswer | null;
  /** The positions of the proposed specs the operator accepts, which become issues. */
  readonly accept: readonly number[];
}

/** A change that reaches the base branch without the factory: pushed by a person, or merged by another automation. */
export interface StoryOutsideChange {
  readonly key: string;
  readonly author: StoryPerson;
  readonly message: string;
  readonly files: readonly StoryFile[];
  /** The branch another automation merged the change from; null for a direct push. */
  readonly branch: string | null;
  /** The auditor's verdict when the factory audits the change; null for a change it does not audit. */
  readonly verdict: AuditVerdictReport | null;
}

export interface ProjectStory {
  readonly project: string;
  readonly requests: readonly StoryRequest[];
  readonly issues: readonly StoryIssue[];
  /** The work of every spec the challenges of the requests propose, whether or not the story accepts it; the story never opens these issues. */
  readonly proposedIssues: readonly StoryProposedIssue[];
  readonly outsideChanges: readonly StoryOutsideChange[];
  /** The issues whose pull request the operator merges once it is open. */
  readonly merges: readonly string[];
  /** The tag published once those merges and the outside changes are in; null when the project releases nothing. */
  readonly release: string | null;
}
