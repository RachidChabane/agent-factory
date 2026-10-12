import type { AgentRole, GateResult, ReviewFinding } from '@agent-factory/domain';
import type { AgentRunOutcome } from '../ports.ts';
import { describeFinding } from '../review/review-findings.ts';
import type { RetryRecord } from './journal-events.ts';
import { tailLines } from './shell-commands.ts';

export const FINAL_TEXT_TAIL_LINES = 20;
export const STOPPED_MESSAGE_HEAD_LINES = 80;
export const STOPPED_MESSAGE_TAIL_LINES = 20;
export const DISTILLED_LINES_PER_FAILURE = 15;
export const MAX_DISTILLED_CHARACTERS = 6_000;

const NEWLINE = '\n';
const PARAGRAPH = '\n\n';
const TRUNCATION_MARKER = '[...]';

export function agentFailureSummary(role: AgentRole, outcome: AgentRunOutcome, finalText: string): string {
  const tail = tailLines(finalText, FINAL_TEXT_TAIL_LINES);
  const headline = `The ${role} run ended with outcome "${outcome}" instead of finishing its work.`;
  return tail === '' ? headline : `${headline}${PARAGRAPH}Last output:${NEWLINE}${tail}`;
}

export function stoppedMessageExcerpt(finalText: string): string {
  const lines = finalText.trim().split(NEWLINE);
  if (lines.length <= STOPPED_MESSAGE_HEAD_LINES + STOPPED_MESSAGE_TAIL_LINES) return lines.join(NEWLINE);
  return [...lines.slice(0, STOPPED_MESSAGE_HEAD_LINES), TRUNCATION_MARKER, ...lines.slice(-STOPPED_MESSAGE_TAIL_LINES)].join(NEWLINE);
}

export function agentStoppedSummary(role: AgentRole, problem: string, finalText: string): string {
  const message = stoppedMessageExcerpt(finalText);
  const headline = `The ${role} run finished without its result: ${problem}`;
  return message === '' ? headline : `${headline}${PARAGRAPH}It said:${NEWLINE}${message}`;
}

export function gateFailureSummary(result: GateResult): string {
  return result.steps
    .filter((step) => step.outcome === 'failed')
    .map((step) => step.detail)
    .join(PARAGRAPH);
}

export function reviewFailureSummary(blocking: readonly ReviewFinding[]): string {
  return ['The review found blocking problems:', ...blocking.map((finding) => `- ${describeFinding(finding)}`)].join(NEWLINE);
}

function headLines(text: string, maxLines: number): string {
  const lines = text.split(NEWLINE);
  return lines.length <= maxLines ? text : [...lines.slice(0, maxLines), TRUNCATION_MARKER].join(NEWLINE);
}

export function distilFailures(decisions: readonly RetryRecord[]): string {
  const entries = decisions.map(
    (record, index) =>
      `${index + 1}. Attempt ${record.afterAttempt + 1} failed at the ${record.failure.source} step:${NEWLINE}${headLines(
        record.failure.summary,
        DISTILLED_LINES_PER_FAILURE,
      )}`,
  );
  const distilled = entries.join(PARAGRAPH);
  return distilled.length <= MAX_DISTILLED_CHARACTERS
    ? distilled
    : `${distilled.slice(0, MAX_DISTILLED_CHARACTERS)}${NEWLINE}${TRUNCATION_MARKER}`;
}
