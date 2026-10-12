import type {
  AgentRole,
  AuditReason,
  AuditState,
  BaseExpectation,
  BaseTestResult,
  BeforeProofKind,
  BillingMode,
  BranchTestResult,
  DelegableGesture,
  EffortLevel,
  GateStepOutcome,
  IssueState,
  PauseCause,
  PromotionPolicy,
  ProofStrategy,
  ReferenceSnapshotStatus,
  ReleaseModelKind,
  ReleaseState,
  RequestState,
  ReviewCategory,
  ReviewSeverity,
  TestRunner,
  UsageFreshness,
  UsageLimitKind,
  UsageSource,
} from '@agent-factory/domain';
import type {
  AgentRunOutcome,
  AttemptKind,
  AttemptOutcome,
  AuditFindingLevel,
  BeforeResult,
  ChallengeVerdict,
  CheckConclusion,
  CheckRunOutcome,
  CommitAttribution,
  CostBasisView,
  DeploymentOutcome,
  EnvironmentStatus,
  EvidenceKind,
  ForgeKind,
  InstallationMode,
  KnowledgeSourceKind,
  MemoryPressure,
  NotificationChannelKind,
  PauseScope,
  PullRequestState,
  ReleaseSource,
  RunStatus,
  RunSubjectKind,
  SubagentStatus,
  ToolScope,
  ToolSessionView,
  ToolStatus,
  WorkflowStatus,
} from '../contract/index.ts';
import { useMemo } from 'react';
import type { MessageKey } from './catalog/index.ts';
import type { I18n } from './create-i18n.ts';
import { useI18n } from './I18nProvider.tsx';

export type RemoteAccess = 'none' | 'tailscale';

/** Turns the enumerations of the contract and of the domain into words in the active language. */
export interface Vocabulary {
  issueState(value: IssueState): string;
  requestState(value: RequestState): string;
  releaseState(value: ReleaseState): string;
  releaseSource(value: ReleaseSource): string;
  auditState(value: AuditState): string;
  auditReason(value: AuditReason): string;
  auditFindingLevel(value: AuditFindingLevel): string;
  commitAttribution(value: CommitAttribution): string;
  challengeVerdict(value: ChallengeVerdict): string;
  runStatus(value: RunStatus): string;
  runOutcome(value: AgentRunOutcome): string;
  runSubjectKind(value: RunSubjectKind): string;
  subagentStatus(value: SubagentStatus): string;
  role(value: AgentRole): string;
  effort(value: EffortLevel): string;
  reviewSeverity(value: ReviewSeverity): string;
  reviewCategory(value: ReviewCategory): string;
  checkConclusion(value: CheckConclusion): string;
  checkRunOutcome(value: CheckRunOutcome): string;
  gateStepOutcome(value: GateStepOutcome): string;
  pullRequestState(value: PullRequestState): string;
  environmentStatus(value: EnvironmentStatus): string;
  deploymentOutcome(value: DeploymentOutcome): string;
  workflowStatus(value: WorkflowStatus): string;
  promotionPolicy(value: PromotionPolicy): string;
  releaseModel(value: ReleaseModelKind): string;
  memoryPressure(value: MemoryPressure): string;
  toolStatus(value: ToolStatus): string;
  toolScope(value: ToolScope): string;
  toolSessionOutcome(value: ToolSessionView['outcome']): string;
  usageLimitKind(value: UsageLimitKind): string;
  usageFreshness(value: UsageFreshness): string;
  usageSource(value: UsageSource): string;
  billing(value: BillingMode): string;
  costBasis(value: CostBasisView): string;
  pauseCause(value: PauseCause): string;
  pauseScope(value: PauseScope): string;
  attemptKind(value: AttemptKind): string;
  attemptOutcome(value: AttemptOutcome): string;
  beforeResult(value: BeforeResult): string;
  beforeProofKind(value: BeforeProofKind): string;
  baseExpectation(value: BaseExpectation): string;
  baseTestResult(value: BaseTestResult): string;
  branchTestResult(value: BranchTestResult): string;
  proofStrategy(value: ProofStrategy): string;
  testRunner(value: TestRunner): string;
  evidenceKind(value: EvidenceKind): string;
  forgeKind(value: ForgeKind): string;
  delegableGesture(value: DelegableGesture): string;
  installationMode(value: InstallationMode): string;
  notificationChannel(value: NotificationChannelKind): string;
  remoteAccess(value: RemoteAccess): string;
  knowledgeSourceKind(value: KnowledgeSourceKind): string;
  referenceSnapshotStatus(value: ReferenceSnapshotStatus): string;
  /** The name of an issue type: translated for the preset types, the id itself for a type a project adds. */
  issueType(id: string): string;
}

export function createVocabulary(i18n: Pick<I18n, 't' | 'has'>): Vocabulary {
  const { t, has } = i18n;
  return {
    issueState: (value) => t(`vocab.issueState.${value}`),
    requestState: (value) => t(`vocab.requestState.${value}`),
    releaseState: (value) => t(`vocab.releaseState.${value}`),
    releaseSource: (value) => t(`vocab.releaseSource.${value}`),
    auditState: (value) => t(`vocab.auditState.${value}`),
    auditReason: (value) => t(`vocab.auditReason.${value}`),
    auditFindingLevel: (value) => t(`vocab.auditFindingLevel.${value}`),
    commitAttribution: (value) => t(`vocab.commitAttribution.${value}`),
    challengeVerdict: (value) => t(`vocab.challengeVerdict.${value}`),
    runStatus: (value) => t(`vocab.runStatus.${value}`),
    runOutcome: (value) => t(`vocab.runOutcome.${value}`),
    runSubjectKind: (value) => t(`vocab.runSubjectKind.${value}`),
    subagentStatus: (value) => t(`vocab.subagentStatus.${value}`),
    role: (value) => t(`vocab.role.${value}`),
    effort: (value) => t(`vocab.effort.${value}`),
    reviewSeverity: (value) => t(`vocab.reviewSeverity.${value}`),
    reviewCategory: (value) => t(`vocab.reviewCategory.${value}`),
    checkConclusion: (value) => t(`vocab.checkConclusion.${value}`),
    checkRunOutcome: (value) => t(`vocab.checkRunOutcome.${value}`),
    gateStepOutcome: (value) => t(`vocab.gateStepOutcome.${value}`),
    pullRequestState: (value) => t(`vocab.pullRequestState.${value}`),
    environmentStatus: (value) => t(`vocab.environmentStatus.${value}`),
    deploymentOutcome: (value) => t(`vocab.deploymentOutcome.${value}`),
    workflowStatus: (value) => t(`vocab.workflowStatus.${value}`),
    promotionPolicy: (value) => t(`vocab.promotionPolicy.${value}`),
    releaseModel: (value) => t(`vocab.releaseModel.${value}`),
    memoryPressure: (value) => t(`vocab.memoryPressure.${value}`),
    toolStatus: (value) => t(`vocab.toolStatus.${value}`),
    toolScope: (value) => t(`vocab.toolScope.${value}`),
    toolSessionOutcome: (value) => t(`vocab.toolSessionOutcome.${value}`),
    usageLimitKind: (value) => t(`vocab.usageLimitKind.${value}`),
    usageFreshness: (value) => t(`vocab.usageFreshness.${value}`),
    usageSource: (value) => t(`vocab.usageSource.${value}`),
    billing: (value) => t(`vocab.billing.${value}`),
    costBasis: (value) => t(`vocab.costBasis.${value}`),
    pauseCause: (value) => t(`vocab.pauseCause.${value}`),
    pauseScope: (value) => t(`vocab.pauseScope.${value}`),
    attemptKind: (value) => t(`vocab.attemptKind.${value}`),
    attemptOutcome: (value) => t(`vocab.attemptOutcome.${value}`),
    beforeResult: (value) => t(`vocab.beforeResult.${value}`),
    beforeProofKind: (value) => t(`vocab.beforeProofKind.${value}`),
    baseExpectation: (value) => t(`vocab.baseExpectation.${value}`),
    baseTestResult: (value) => t(`vocab.baseTestResult.${value}`),
    branchTestResult: (value) => t(`vocab.branchTestResult.${value}`),
    proofStrategy: (value) => t(`vocab.proofStrategy.${value}`),
    testRunner: (value) => t(`vocab.testRunner.${value}`),
    evidenceKind: (value) => t(`vocab.evidenceKind.${value}`),
    forgeKind: (value) => t(`vocab.forgeKind.${value}`),
    delegableGesture: (value) => t(`vocab.gesture.${value}`),
    installationMode: (value) => t(`vocab.installationMode.${value}`),
    notificationChannel: (value) => t(`vocab.notificationChannel.${value}`),
    remoteAccess: (value) => t(`vocab.remoteAccess.${value}`),
    knowledgeSourceKind: (value) => t(`vocab.knowledgeSourceKind.${value}`),
    referenceSnapshotStatus: (value) => t(`vocab.referenceSnapshotStatus.${value}`),
    issueType: (id) => {
      const key = `vocab.issueType.${id}`;
      return has(key) ? t(key as MessageKey) : id;
    },
  };
}

export function useVocabulary(): Vocabulary {
  const i18n = useI18n();
  return useMemo(() => createVocabulary(i18n), [i18n]);
}
