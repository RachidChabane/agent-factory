import type { FrozenCheck, GateResult, IssueSpec, ReviewFinding } from '@agent-factory/domain';
import type { AcceptanceManifest } from '../acceptance/acceptance-manifest.ts';
import { checksProving } from '../acceptance/acceptance-manifest.ts';
import { SHORT_SHA_LENGTH } from '../audit/audit-issue-renderer.ts';
import { describeFinding } from '../review/review-findings.ts';
import type { AcceptanceTestRow } from './acceptance-test-table.ts';
import type { DiffStatEntry } from './diff-stat.ts';
import type { BeforeProofRecord, EvidenceBundle, EvidenceFile, EvidencePhase } from './journal-events.ts';
import { inlineCode, tableCell } from './markdown.ts';
import type { AttemptCounts } from './pipeline-journal.ts';
import type { ForgeFileLinks } from './pipeline-settings.ts';

export const SHORT_HASH_LENGTH = 12;
export const SCORE_DECIMALS = 2;
export const IMAGE_EXTENSIONS: readonly string[] = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];

export const PULL_REQUEST_SECTIONS = {
  whatToLookAt: 'What to look at',
  issues: 'Issues',
  acceptanceCriteria: 'Acceptance criteria',
  risks: 'Risks',
  technicalDetails: 'Technical details',
} as const;

const PARAGRAPH = '\n\n';
const NEWLINE = '\n';
const LINK_SEPARATOR = ' · ';
const NO_RISK = 'None reported.';
const NOT_PRODUCED = 'not produced';

export interface PullRequestBodyInput {
  readonly fileLinks: ForgeFileLinks;
  readonly spec: IssueSpec;
  readonly branch: string;
  readonly baseSha: string;
  readonly evidenceSha: string;
  readonly manifest: AcceptanceManifest;
  readonly frozenChecks: readonly FrozenCheck[];
  readonly beforeProof: BeforeProofRecord;
  readonly gate: GateResult;
  readonly afterScore: number | null;
  readonly bundle: EvidenceBundle;
  readonly diffStat: readonly DiffStatEntry[];
  readonly reviewFindings: readonly ReviewFinding[];
  readonly attempts: AttemptCounts;
  readonly costUsd: number;
  readonly externalFeedback: readonly ExternalFeedbackSummary[];
  readonly acceptanceTests: readonly AcceptanceTestRow[];
  /** The `Behaviour on video` section the films of the pull request announce; null when it films nothing. */
  readonly filmSection: string | null;
}

export interface ExternalFeedbackSummary {
  readonly author: string;
  readonly summary: string;
}

function shortSha(sha: string): string {
  return sha.slice(0, SHORT_SHA_LENGTH);
}

function isImage(path: string): boolean {
  const lower = path.toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function formatScore(score: number): string {
  return score.toFixed(SCORE_DECIMALS);
}

function beforeSentence(input: PullRequestBodyInput): string {
  const { beforeProof } = input;
  const base = `**Before** on base ${inlineCode(shortSha(input.baseSha))}:`;
  if (beforeProof.baseScore !== null) return `${base} score ${formatScore(beforeProof.baseScore)} on the targeted cases.`;
  if (!beforeProof.checksExpressible) return `${base} no acceptance check applies to this issue type.`;
  if (beforeProof.tests.length > 0) return `${base} ${structuredBaseSummary(beforeProof)}.`;
  if (beforeProof.checksFailedOnBase) return `${base} the acceptance checks fail (exit code ${beforeProof.exitCode ?? 'unknown'}).`;
  return `${base} the acceptance checks pass.`;
}

function structuredBaseSummary(beforeProof: BeforeProofRecord): string {
  const red = beforeProof.tests.filter((test) => test.outcome === 'failed' && test.failureKind === 'assertion').length;
  const green = beforeProof.tests.filter((test) => test.outcome === 'passed').length;
  const runner = beforeProof.runner === null ? '' : ` (${beforeProof.runner})`;
  const kept = green === 0 ? '' : ` and ${green} kept-behaviour ${green === 1 ? 'test passes' : 'tests pass'}`;
  return `${red} acceptance ${red === 1 ? 'test fails' : 'tests fail'} on an assertion${kept}${runner}`;
}

function afterSentence(input: PullRequestBodyInput): string {
  const steps = input.gate.steps.filter((step) => step.outcome === 'passed').map((step) => step.name);
  const score = input.afterScore === null ? '' : `; score ${formatScore(input.afterScore)} on the targeted cases`;
  return `**After** on ${inlineCode(shortSha(input.evidenceSha))}: the gate passes (${steps.join(', ')})${score}.`;
}

function evidenceCell(input: PullRequestBodyInput, file: EvidenceFile | undefined, phase: EvidencePhase): string {
  if (file === undefined) return NOT_PRODUCED;
  const alt = `${file.caption}, ${phase}`;
  return isImage(file.sourcePath)
    ? `![${alt}](${input.fileLinks.rawFile(input.evidenceSha, file.bundlePath)})`
    : `[${file.sourcePath}](${input.fileLinks.file(input.evidenceSha, file.bundlePath)})`;
}

function evidenceTable(input: PullRequestBodyInput): string | null {
  if (input.manifest.evidence.length === 0) return null;
  const find = (phase: EvidencePhase, path: string): EvidenceFile | undefined =>
    input.bundle.files.find((file) => file.phase === phase && file.sourcePath === path);
  const rows = input.manifest.evidence.map(
    (path) =>
      `| ${inlineCode(path)} | ${evidenceCell(input, find('before', path), 'before')} | ${evidenceCell(input, find('after', path), 'after')} |`,
  );
  return ['| Evidence | Before | After |', '|---|---|---|', ...rows].join(NEWLINE);
}

function logLinks(input: PullRequestBodyInput): string | null {
  const link = (label: string, path: string): string => `[${label}](${input.fileLinks.file(input.evidenceSha, path)})`;
  const candidates: readonly (readonly [string, string | null])[] = [
    ['before log', input.bundle.beforeLogPath],
    ['after log', input.bundle.afterLogPath],
    ['diff stat', input.bundle.diffStatPath],
    ['acceptance tests', input.bundle.acceptanceTestsPath],
  ];
  const links = candidates.flatMap(([label, path]) => (path === null ? [] : [link(label, path)]));
  return links.length === 0 ? null : `Logs: ${links.join(LINK_SEPARATOR)}`;
}

function whatToLookAt(input: PullRequestBodyInput): string {
  const table = evidenceTable(input);
  const logs = logLinks(input);
  return [
    `## ${PULL_REQUEST_SECTIONS.whatToLookAt}`,
    `${beforeSentence(input)}${NEWLINE}${afterSentence(input)}`,
    ...(table === null ? [] : [table]),
    ...(logs === null ? [] : [logs]),
  ].join(PARAGRAPH);
}

function issues(input: PullRequestBodyInput): string {
  const lines = [`Closes #${input.spec.number}`, ...input.spec.dependsOn.map((number) => `Depends on #${number}`)];
  return [`## ${PULL_REQUEST_SECTIONS.issues}`, lines.join(NEWLINE)].join(PARAGRAPH);
}

function acceptanceCriteria(input: PullRequestBodyInput): string {
  const lines = input.spec.acceptanceCriteria.map((criterion, index) => {
    const checks = checksProving(input.manifest, index + 1);
    const proof = checks.length === 0 ? 'Proven by the gate.' : `Proven by ${checks.map(inlineCode).join(', ')}.`;
    return `${index + 1}. ${criterion}${NEWLINE}   ${proof}`;
  });
  const table = acceptanceTestTable(input.acceptanceTests);
  return [`## ${PULL_REQUEST_SECTIONS.acceptanceCriteria}`, lines.join(NEWLINE), ...(table === null ? [] : [table])].join(PARAGRAPH);
}

function acceptanceTestTable(rows: readonly AcceptanceTestRow[]): string | null {
  if (rows.length === 0) return null;
  return [
    '| Criterion | Test | Base | Branch |',
    '|---:|---|---|---|',
    ...rows.map((row) => `| ${row.criterion} | ${tableCell(inlineCode(row.test))} | ${row.base} | ${row.branch} |`),
  ].join(NEWLINE);
}

function risks(input: PullRequestBodyInput): string {
  const lines = [
    ...input.reviewFindings.map((finding) => `- ${describeFinding(finding)}`),
    ...input.bundle.missing.map((entry) => `- Evidence ${inlineCode(entry.sourcePath)} was not produced ${entry.phase} the change.`),
  ];
  return [`## ${PULL_REQUEST_SECTIONS.risks}`, lines.length === 0 ? NO_RISK : lines.join(NEWLINE)].join(PARAGRAPH);
}

function technicalDetails(input: PullRequestBodyInput): string {
  const { attempts } = input;
  const facts = [
    `- Type: ${inlineCode(input.spec.type)}`,
    `- Branch: ${inlineCode(input.branch)} from ${inlineCode(shortSha(input.baseSha))}`,
    `- Implementer attempts: ${attempts.total} (${attempts.resumed} resumed with feedback, ${attempts.escalated} escalated)`,
    `- Agent cost: $${input.costUsd.toFixed(SCORE_DECIMALS)}`,
    ...(input.externalFeedback.length === 0
      ? []
      : ['- External feedback addressed:', ...input.externalFeedback.map((feedback) => `  - ${feedback.author}: ${feedback.summary}`)]),
    '- Gate:',
    ...input.gate.steps.map((step) => `  - ${step.name}: ${step.outcome}`),
    '- Frozen checks:',
    ...(input.frozenChecks.length === 0
      ? ['  - none']
      : input.frozenChecks.map((check) => `  - ${inlineCode(check.path)} sha256 ${inlineCode(check.sha256.slice(0, SHORT_HASH_LENGTH))}`)),
  ];
  const table = [
    '| File | Added | Removed |',
    '|---|---:|---:|',
    ...input.diffStat.map((entry) => `| ${inlineCode(entry.path)} | ${entry.added} | ${entry.removed} |`),
  ];
  return [`## ${PULL_REQUEST_SECTIONS.technicalDetails}`, facts.join(NEWLINE), table.join(NEWLINE)].join(PARAGRAPH);
}

export class PullRequestBodyRenderer {
  render(input: PullRequestBodyInput): string {
    const sections = [whatToLookAt(input), issues(input), acceptanceCriteria(input), risks(input), technicalDetails(input)];
    return `${[...sections, ...(input.filmSection === null ? [] : [input.filmSection])].join(PARAGRAPH)}${NEWLINE}`;
  }
}
