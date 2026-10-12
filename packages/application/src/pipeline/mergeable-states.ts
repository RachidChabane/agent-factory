import type { IssueState } from '@agent-factory/domain';

/** The states in which an issue's pull request is open and may be merged on the operator's order. */
export const MERGEABLE_STATES: readonly IssueState[] = ['pr-open', 'ci', 'ready-to-merge'];
