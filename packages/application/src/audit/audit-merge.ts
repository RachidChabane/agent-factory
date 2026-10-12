import type { AgentRunRequest, AgentRunResult, AgentHarness, EventStore, GitHubGateway, RolePromptCatalog } from '../ports.ts';
import { OPEN_AUDIT_STATES, UNRESOLVED_VERDICT_STATES, assertAuditTransition, type AuditVerdict, type EffortLevel } from '@agent-factory/domain';
import type { AuditRecord } from './audit-projection.ts';
import { loadAudit, loadAudits } from './audit-projection.ts';
import type { AuditIssueRenderer } from './audit-issue-renderer.ts';
import { parseAuditVerdict } from './audit-verdict.ts';
import { gatherChangeContext, renderChangeDescription } from './change-context.ts';
import { AuditNotFoundError } from './errors.ts';
import {
  AUDIT_CONCLUDED_EVENT,
  AUDIT_FAILED_EVENT,
  AUDIT_ISSUE_DRAFTED_EVENT,
  AUDIT_STARTED_EVENT,
  auditSubject,
  type AuditConcludedPayload,
  type AuditFailedPayload,
  type AuditIssueDraftedPayload,
  type AuditStartedPayload,
} from './events.ts';

export const AUDITOR_ROLE = 'auditor';

export interface AuditRunSettings {
  readonly repository: string;
  readonly model: string;
  readonly effort: EffortLevel;
  readonly workingDirectory: string;
  readonly maxBudgetUsd: number;
  readonly maxTurns: number;
  readonly timeoutMs: number;
  readonly appendSystemPrompt: string;
}

export interface AuditDependencies {
  readonly events: EventStore;
  readonly github: GitHubGateway;
  readonly harness: AgentHarness;
  readonly prompts: RolePromptCatalog;
  readonly issueRenderer: AuditIssueRenderer;
  readonly nextRunId: () => string;
  readonly settings: AuditRunSettings;
}

export type AuditOutcome =
  | { readonly status: 'concluded'; readonly auditId: string; readonly verdict: AuditVerdict; readonly issueDrafted: boolean }
  | { readonly status: 'failed'; readonly auditId: string; readonly reason: string }
  | { readonly status: 'skipped'; readonly auditId: string };

const AUDIT_RUN_SUBJECT = 'audit';

function runRequest(dependencies: AuditDependencies, audit: AuditRecord, runId: string, prompt: string): AgentRunRequest {
  const { settings } = dependencies;
  return {
    runId,
    context: { subject: { kind: AUDIT_RUN_SUBJECT, id: audit.id }, attempt: audit.failureCount, branch: null },
    account: null,
    role: AUDITOR_ROLE,
    model: settings.model,
    effort: settings.effort,
    workingDirectory: settings.workingDirectory,
    prompt,
    appendSystemPrompt: settings.appendSystemPrompt,
    allowedTools: [],
    mcpServers: {},
    resumeSessionId: null,
    maxBudgetUsd: settings.maxBudgetUsd,
    maxTurns: settings.maxTurns,
    frozenChecks: [],
    gateCommand: null,
    decisionRequestPath: null,
    timeoutMs: settings.timeoutMs,
  };
}

async function recordFailure(events: EventStore, auditId: string, runId: string, reason: string): Promise<AuditOutcome> {
  const payload: AuditFailedPayload = { runId, reason };
  await events.append(AUDIT_FAILED_EVENT, auditSubject(auditId), payload);
  return { status: 'failed', auditId, reason };
}

function ignoreRunEvent(): void {
  return;
}

async function execute(dependencies: AuditDependencies, request: AgentRunRequest, signal: AbortSignal): Promise<AgentRunResult | Error> {
  try {
    return await dependencies.harness.run(request, ignoreRunEvent, signal);
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

async function draftIssue(dependencies: AuditDependencies, audit: AuditRecord): Promise<boolean> {
  const concluded = await loadAudit(dependencies.events, audit.id);
  if (concluded === null || concluded.conclusion === null) return false;
  if (!UNRESOLVED_VERDICT_STATES.includes(concluded.state)) return false;
  const draft: AuditIssueDraftedPayload = dependencies.issueRenderer.render(concluded, concluded.conclusion);
  await dependencies.events.append(AUDIT_ISSUE_DRAFTED_EVENT, auditSubject(audit.id), draft);
  return true;
}

export async function auditMerge(
  dependencies: AuditDependencies,
  auditId: string,
  signal: AbortSignal = new AbortController().signal,
): Promise<AuditOutcome> {
  const { events, github, prompts, settings } = dependencies;
  const audit = await loadAudit(events, auditId);
  if (audit === null) throw new AuditNotFoundError(auditId);
  if (!OPEN_AUDIT_STATES.includes(audit.state)) return { status: 'skipped', auditId };

  const context = await gatherChangeContext(github, audit);
  const prompt = prompts.render(AUDITOR_ROLE, {
    repository: settings.repository,
    change: renderChangeDescription(context),
    diff: context.diff,
  });
  const runId = dependencies.nextRunId();
  if (audit.state === 'detected') assertAuditTransition(audit.state, 'auditing');
  const started: AuditStartedPayload = { runId };
  await events.append(AUDIT_STARTED_EVENT, auditSubject(auditId), started);

  const result = await execute(dependencies, runRequest(dependencies, audit, runId, prompt), signal);
  if (result instanceof Error) return recordFailure(events, auditId, runId, `the run failed: ${result.message}`);
  if (result.outcome !== 'success') return recordFailure(events, auditId, runId, `the run ended with outcome ${result.outcome}`);

  const parsed = parseAuditVerdict(result.finalText);
  if (!parsed.ok) return recordFailure(events, auditId, runId, parsed.reason);

  const { report } = parsed;
  assertAuditTransition('auditing', report.verdict);
  const concluded: AuditConcludedPayload = { runId, ...report };
  await events.append(AUDIT_CONCLUDED_EVENT, auditSubject(auditId), concluded);
  const issueDrafted = await draftIssue(dependencies, audit);
  return { status: 'concluded', auditId, verdict: report.verdict, issueDrafted };
}

export async function auditPendingMerges(
  dependencies: AuditDependencies,
  signal: AbortSignal = new AbortController().signal,
): Promise<readonly AuditOutcome[]> {
  const pending = (await loadAudits(dependencies.events)).filter((audit) => OPEN_AUDIT_STATES.includes(audit.state));
  const outcomes: AuditOutcome[] = [];
  for (const audit of pending) {
    outcomes.push(await auditMerge(dependencies, audit.id, signal));
  }
  return outcomes;
}
