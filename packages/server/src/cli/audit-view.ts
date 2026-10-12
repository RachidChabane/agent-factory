import type { AuditRecord } from '@agent-factory/application';

const NONE = 'none';
const COST_DECIMALS = 4;
const MILLISECONDS_PER_SECOND = 1000;
const DURATION_DECIMALS = 1;

export interface AuditRunFigures {
  readonly costUsd: number;
  readonly durationMs: number;
}

function runLine(run: AuditRunFigures | null): string {
  if (run === null) return `Run: ${NONE}`;
  return `Run: $${run.costUsd.toFixed(COST_DECIMALS)}, ${(run.durationMs / MILLISECONDS_PER_SECOND).toFixed(DURATION_DECIMALS)}s`;
}

export function renderAudit(audit: AuditRecord, run: AuditRunFigures | null): readonly string[] {
  const { conclusion, draft } = audit;
  const header = `Audit ${audit.commitSha} (${audit.reason}): ${audit.state}`;
  if (conclusion === null) {
    return [header, audit.lastFailure === null ? 'No conclusion recorded' : `Last failure: ${audit.lastFailure}`];
  }
  return [
    header,
    `Summary: ${conclusion.summary}`,
    ...conclusion.findings.map((finding, index) => `Finding ${index + 1} [${finding.level}]: ${finding.statement}\n  Evidence: ${finding.evidence}`),
    `Proposed fix: ${conclusion.proposedFix ?? NONE}`,
    runLine(run),
    ...(draft === null ? ['Drafted issue: none'] : [`Drafted issue: ${draft.title}`, draft.body]),
  ];
}
