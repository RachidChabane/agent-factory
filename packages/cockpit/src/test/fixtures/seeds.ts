import type {
  AuditView,
  EnvironmentView,
  IssueView,
  PullRequestView,
  ReleaseView,
  RequestView,
} from '../../contract/index.ts';
import type { ForgeLinks } from './forge-links.ts';
import { NEVER_READ } from './readings.ts';

type WithDefaults<View, Defaulted extends keyof View> = Omit<View, Defaulted> & Partial<Pick<View, Defaulted>>;

export type IssueSeed = WithDefaults<
  IssueView,
  | 'resumeTarget'
  | 'paused'
  | 'dependsOn'
  | 'requestId'
  | 'branch'
  | 'pullRequestNumber'
  | 'beforeProofKind'
  | 'checks'
  | 'checksFrozenAt'
  | 'attempts'
  | 'escalation'
  | 'costUsd'
  | 'delegated'
>;

export function issueView(seed: IssueSeed): IssueView {
  return {
    resumeTarget: null,
    paused: false,
    dependsOn: [],
    requestId: null,
    branch: null,
    pullRequestNumber: null,
    beforeProofKind: 'fails-on-base',
    checks: [],
    checksFrozenAt: null,
    attempts: [],
    escalation: null,
    costUsd: 0,
    delegated: [],
    ...seed,
  };
}

export type RequestSeed = WithDefaults<
  RequestView,
  'attachments' | 'challenge' | 'lastChallengeFailure' | 'issueNumbers' | 'declineReason'
>;

export function requestView(seed: RequestSeed): RequestView {
  return { attachments: [], challenge: null, lastChallengeFailure: null, issueNumbers: [], declineReason: null, ...seed };
}

export type PullRequestSeed = WithDefaults<
  PullRequestView,
  | 'mergedAt'
  | 'checks'
  | 'evidenceComplete'
  | 'missingEvidence'
  | 'evidence'
  | 'films'
  | 'filmOrders'
  | 'readyNotice'
  | 'delegated'
  | 'reviewRounds'
  | 'externalFeedback'
  | 'files'
  | 'mergeable'
  | 'mergeBlockers'
>;

export function pullRequestView(seed: PullRequestSeed): PullRequestView {
  return {
    mergedAt: null,
    checks: NEVER_READ,
    evidenceComplete: true,
    missingEvidence: [],
    evidence: [],
    films: [],
    filmOrders: [],
    readyNotice: { status: 'none' },
    delegated: [],
    reviewRounds: [],
    externalFeedback: [],
    files: [],
    mergeable: false,
    mergeBlockers: [],
    ...seed,
  };
}

export type ReleaseSeed = WithDefaults<
  ReleaseView,
  | 'pullRequestNumber'
  | 'createdAt'
  | 'cutAt'
  | 'promotedAt'
  | 'verifiedAt'
  | 'supersededBy'
  | 'commits'
  | 'gate'
  | 'health'
  | 'productionWorkflowUrl'
  | 'report'
>;

export function releaseView(seed: ReleaseSeed): ReleaseView {
  return {
    pullRequestNumber: null,
    createdAt: null,
    cutAt: null,
    promotedAt: null,
    verifiedAt: null,
    supersededBy: null,
    commits: [],
    gate: { promotable: false, blockingReasons: [], evaluatedAt: null },
    health: [],
    productionWorkflowUrl: null,
    report: '',
    ...seed,
  };
}

export type AuditSeed = WithDefaults<
  Omit<AuditView, 'pullRequestUrl'>,
  | 'authorLogin'
  | 'pullRequestNumber'
  | 'branch'
  | 'releaseId'
  | 'conclusion'
  | 'failureCount'
  | 'lastFailure'
  | 'draft'
  | 'publishedIssueNumber'
  | 'resolved'
  | 'resolutionNote'
>;

/** An audit; the address of its pull request is the one the forge of the project gives that number. */
export function auditView(seed: AuditSeed, links: Pick<ForgeLinks, 'pullRequest'>): AuditView {
  return {
    authorLogin: null,
    pullRequestNumber: null,
    branch: null,
    releaseId: null,
    conclusion: null,
    failureCount: 0,
    lastFailure: null,
    draft: null,
    publishedIssueNumber: null,
    resolved: false,
    resolutionNote: null,
    ...seed,
    pullRequestUrl: seed.pullRequestNumber === undefined || seed.pullRequestNumber === null ? null : links.pullRequest(seed.pullRequestNumber),
  };
}

export type EnvironmentSeed = WithDefaults<EnvironmentView, 'production' | 'health' | 'redeployable' | 'workflowUrl'>;

export function environmentView(seed: EnvironmentSeed): EnvironmentView {
  return { production: false, health: [], redeployable: false, workflowUrl: null, ...seed };
}
