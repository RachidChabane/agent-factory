/** Where the checks a merge depends on stand: all passed, some still running, or one failed. */
export const CHECKS_VERDICTS = ['passed', 'running', 'failed'] as const;
export type ChecksVerdict = (typeof CHECKS_VERDICTS)[number];

/** What a pull request needs to be judged: its required checks and its films. */
export interface PullRequestReadinessFacts {
  readonly checks: ChecksVerdict;
  /** The scenarios whose film is queued or recording. */
  readonly pendingFilms: readonly string[];
  /** The scenarios whose latest film failed. */
  readonly failedFilms: readonly string[];
}

/** What keeps a pull request from being ready. */
export type ReadinessBlocker =
  | { readonly kind: 'checks-running' }
  | { readonly kind: 'checks-failed' }
  | { readonly kind: 'films-pending'; readonly scenarios: readonly string[] }
  | { readonly kind: 'films-failed'; readonly scenarios: readonly string[] };

export interface PullRequestReadiness {
  readonly ready: boolean;
  readonly blockers: readonly ReadinessBlocker[];
}

function checkBlockers(checks: ChecksVerdict): readonly ReadinessBlocker[] {
  if (checks === 'running') return [{ kind: 'checks-running' }];
  return checks === 'failed' ? [{ kind: 'checks-failed' }] : [];
}

/**
 * A pull request is ready once its required checks passed and none of its films is queued or recording.
 * A film that failed holds it too, until a later film of that scenario succeeds.
 */
export function evaluatePullRequestReadiness(facts: PullRequestReadinessFacts): PullRequestReadiness {
  const blockers: readonly ReadinessBlocker[] = [
    ...checkBlockers(facts.checks),
    ...(facts.pendingFilms.length === 0 ? [] : [{ kind: 'films-pending', scenarios: facts.pendingFilms } as const]),
    ...(facts.failedFilms.length === 0 ? [] : [{ kind: 'films-failed', scenarios: facts.failedFilms } as const]),
  ];
  return { ready: blockers.length === 0, blockers };
}
