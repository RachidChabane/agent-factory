import { singleLine, slugOf } from '@agent-factory/application';
import type { DemoProject } from '../../demo-world.ts';
import type { ProjectStory, StoryAttempt, StoryIssue, StoryOutsideChange, StoryProposedIssue, StorySpec, StoryWork } from '../story-types.ts';
import { StoryWorkspace } from './story-workspace.ts';

/** Where an issue starts: from the base alone, or from the base after what the story lands before it. */
export type BaseKind = 'starting' | 'landed';

export type LandedChange = { readonly kind: 'issue'; readonly issue: StoryIssue } | { readonly kind: 'outside'; readonly change: StoryOutsideChange };

export class ProposedSpecMissingError extends Error {
  constructor(title: string) {
    super(`no challenge of the story proposes a spec titled "${title}"`);
    this.name = 'ProposedSpecMissingError';
  }
}

function proposedSpecOf(story: ProjectStory, proposed: StoryProposedIssue): StorySpec {
  const spec = story.requests.flatMap((request) => request.challenge?.specs ?? []).find((candidate) => singleLine(candidate.title) === proposed.title);
  if (spec === undefined) throw new ProposedSpecMissingError(proposed.title);
  return { title: proposed.title, type: spec.type, need: spec.need, acceptanceCriteria: spec.acceptanceCriteria, outOfScope: spec.outOfScope, expectedProof: spec.expectedProof };
}

/** The issue a proposed spec becomes once the operator accepts and validates it: its spec comes from the challenge that proposes it. */
export function issueOfProposed(story: ProjectStory, proposed: StoryProposedIssue): StoryIssue {
  const { checks, decision, attempts, review } = proposed;
  return { key: slugOf(proposed.title), spec: proposedSpecOf(story, proposed), dependsOn: [], validate: true, checks, decision, attempts, review };
}

function issueByKey(story: ProjectStory, key: string): StoryIssue {
  const issue = story.issues.find((candidate) => candidate.key === key);
  if (issue === undefined) throw new Error(`no issue ${key} in the story of ${story.project}`);
  return issue;
}

/** The issues this one waits on, directly or not, in the order the story lists them. */
export function dependenciesOf(story: ProjectStory, issue: StoryIssue): readonly StoryIssue[] {
  const wanted = new Set<string>();
  const visit = (current: StoryIssue): void => {
    for (const key of current.dependsOn) {
      wanted.add(key);
      visit(issueByKey(story, key));
    }
  };
  visit(issue);
  return story.issues.filter((candidate) => wanted.has(candidate.key));
}

function issueChanges(issues: readonly StoryIssue[]): readonly LandedChange[] {
  return issues.map((issue) => ({ kind: 'issue', issue }));
}

/** What has reached the base branch when the issue starts, in the order it landed. */
export function changesBefore(story: ProjectStory, issue: StoryIssue, kind: BaseKind): readonly LandedChange[] {
  const dependencies = dependenciesOf(story, issue);
  if (kind === 'starting') return issueChanges(dependencies);
  const merged = story.issues.filter((candidate) => story.merges.includes(candidate.key) && candidate.key !== issue.key && !dependencies.includes(candidate));
  const outside: readonly LandedChange[] = story.outsideChanges.map((change) => ({ kind: 'outside', change }));
  return [...issueChanges(dependencies), ...issueChanges(merged), ...outside];
}

/** The bases worth replaying an issue on: the landed base only differs when something lands besides its dependencies. */
export function baseKindsOf(story: ProjectStory, issue: StoryIssue): readonly BaseKind[] {
  const starting = changesBefore(story, issue, 'starting');
  return changesBefore(story, issue, 'landed').length === starting.length ? ['starting'] : ['starting', 'landed'];
}

export function applyAttempt(workspace: StoryWorkspace, attempt: StoryAttempt): void {
  workspace.write(attempt.writes);
  workspace.remove(attempt.deletes);
}

/** The work of an issue as it merges: its checks, then every attempt in turn. */
export function applyWork(workspace: StoryWorkspace, work: StoryWork): void {
  workspace.write(work.checks.files);
  for (const attempt of work.attempts) applyAttempt(workspace, attempt);
}

export function applyChange(workspace: StoryWorkspace, change: LandedChange): void {
  if (change.kind === 'issue') applyWork(workspace, change.issue);
  else workspace.write(change.change.files);
}

export function prepareBase(demo: DemoProject, story: ProjectStory, issue: StoryIssue, kind: BaseKind): StoryWorkspace {
  const workspace = StoryWorkspace.create(demo);
  for (const change of changesBefore(story, issue, kind)) applyChange(workspace, change);
  return workspace;
}

/** The base after every issue and every proposed issue merged, and every outside change landed. */
export function prepareEverything(demo: DemoProject, story: ProjectStory): StoryWorkspace {
  const workspace = StoryWorkspace.create(demo);
  for (const work of [...story.issues, ...story.proposedIssues]) applyWork(workspace, work);
  for (const change of story.outsideChanges) workspace.write(change.files);
  return workspace;
}

export function inWorkspace<Result>(workspace: StoryWorkspace, body: (workspace: StoryWorkspace) => Result): Result {
  try {
    return body(workspace);
  } finally {
    workspace.dispose();
  }
}
