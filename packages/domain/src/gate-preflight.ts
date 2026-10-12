import { SANDBOX_NETWORK_REFUSAL_PATTERNS, sandboxRefusalOf } from './acceptance-tests.ts';

export const PREFLIGHT_VERDICTS = ['passed', 'unfinished', 'network-undeclared', 'sandbox-refused', 'failed', 'not-runnable', 'skipped'] as const;
export type PreflightVerdict = (typeof PREFLIGHT_VERDICTS)[number];
export const BLOCKING_PREFLIGHT_VERDICTS: readonly PreflightVerdict[] = ['network-undeclared', 'sandbox-refused', 'failed', 'not-runnable'];

export const NETWORK_FAILURE_PATTERNS: readonly RegExp[] = [
  ...SANDBOX_NETWORK_REFUSAL_PATTERNS,
  /\bdial tcp\b.*\b(no such host|operation not permitted)\b/i,
  /\bdns error\b/i,
  /\btcp connect error\b/i,
  /unable to access 'https?:/i,
  /Failed to (fetch|download)\b.*https?:/i,
];

export interface PreflightRun {
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly output: string;
  readonly networkDeclared: boolean;
}

export interface PreflightAssessment {
  readonly verdict: PreflightVerdict;
  readonly evidence: string | null;
}

const NEWLINE = '\n';
const EXIT_CODE_SUCCESS = 0;

export function networkFailureOf(output: string): string | null {
  return output.split(NEWLINE).find((line) => NETWORK_FAILURE_PATTERNS.some((pattern) => pattern.test(line)))?.trim() ?? null;
}

export function assessPreflight(run: PreflightRun): PreflightAssessment {
  if (run.exitCode === null) return { verdict: 'not-runnable', evidence: null };
  if (run.exitCode === EXIT_CODE_SUCCESS && !run.timedOut) return { verdict: 'passed', evidence: null };
  const network = run.networkDeclared ? null : networkFailureOf(run.output);
  if (network !== null) return { verdict: 'network-undeclared', evidence: network };
  const refusal = sandboxRefusalOf(run.output);
  if (refusal !== null) return { verdict: 'sandbox-refused', evidence: refusal };
  if (run.timedOut) return { verdict: 'unfinished', evidence: null };
  return { verdict: 'failed', evidence: null };
}

export function blocksAgentSpend(verdict: PreflightVerdict): boolean {
  return BLOCKING_PREFLIGHT_VERDICTS.includes(verdict);
}
