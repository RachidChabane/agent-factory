import { MIN_CONCURRENT_ISSUES } from '@agent-factory/domain';
import type { CommandBody, ProjectSettingsView } from '../../contract/index.ts';
import type { DecimalNotation } from './decimal-notation.ts';

export type ConcurrencySetting = ProjectSettingsView['concurrency'];

export interface ConcurrencyDraft {
  readonly issues: string;
  readonly ceiling: string;
}

export type CeilingProblem = 'invalid' | 'below-issues';

export interface ConcurrencyProblems {
  readonly issues: boolean;
  readonly ceiling: CeilingProblem | null;
}

export function concurrencyDraftOf(setting: ConcurrencySetting, notation: DecimalNotation): ConcurrencyDraft {
  return { issues: notation.format(setting.issues), ceiling: notation.format(setting.ceiling) };
}

function isIssueCount(value: number | null): value is number {
  return value !== null && value >= MIN_CONCURRENT_ISSUES;
}

function ceilingProblem(ceiling: number | null, issues: number | null): CeilingProblem | null {
  if (!isIssueCount(ceiling)) return 'invalid';
  return issues !== null && ceiling < issues ? 'below-issues' : null;
}

export function concurrencyProblems(draft: ConcurrencyDraft, notation: DecimalNotation): ConcurrencyProblems {
  const issues = notation.parseWhole(draft.issues);
  return { issues: !isIssueCount(issues), ceiling: ceilingProblem(notation.parseWhole(draft.ceiling), issues) };
}

/** The change the factory takes, or null while a field is invalid. */
export function concurrencyChangeOf(project: string, draft: ConcurrencyDraft, notation: DecimalNotation): CommandBody<'settings.update-concurrency'> | null {
  const issues = notation.parseWhole(draft.issues);
  const ceiling = notation.parseWhole(draft.ceiling);
  if (!isIssueCount(issues) || !isIssueCount(ceiling) || ceiling < issues) return null;
  return { project, issues, ceiling };
}

export function isConcurrencyChanged(draft: ConcurrencyDraft, setting: ConcurrencySetting, notation: DecimalNotation): boolean {
  return notation.parseWhole(draft.issues) !== setting.issues || notation.parseWhole(draft.ceiling) !== setting.ceiling;
}
