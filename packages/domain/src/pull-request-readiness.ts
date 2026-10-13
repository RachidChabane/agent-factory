/** What a pull request needs to be judged: every check reported on its head, and its films. */
export interface PullRequestReadinessFacts {
  /** The checks reported on the head that failed or were cancelled, by name. */
  readonly failedChecks: readonly string[];
  /** The checks reported on the head that have not completed, by name. */
  readonly runningChecks: readonly string[];
  /** Whether the forge has reported the checks of the head: an empty report may only mean it has not registered them yet. */
  readonly checksReported: boolean;
  /** The scenarios whose film is queued or recording. */
  readonly pendingFilms: readonly string[];
  /** The scenarios whose latest film failed. */
  readonly failedFilms: readonly string[];
}

/**
 * What keeps a pull request from being ready. A check blocker names each check; one without a name says that no check of
 * the head is known yet.
 */
export type ReadinessBlocker =
  | { readonly kind: 'checks-running'; readonly checks: readonly string[] }
  | { readonly kind: 'checks-failed'; readonly checks: readonly string[] }
  | { readonly kind: 'films-pending'; readonly scenarios: readonly string[] }
  | { readonly kind: 'films-failed'; readonly scenarios: readonly string[] };

export interface PullRequestReadiness {
  readonly ready: boolean;
  readonly blockers: readonly ReadinessBlocker[];
}

function checkBlockers(facts: PullRequestReadinessFacts): readonly ReadinessBlocker[] {
  const running = facts.runningChecks.length > 0 || !facts.checksReported;
  return [
    ...(facts.failedChecks.length === 0 ? [] : [{ kind: 'checks-failed', checks: facts.failedChecks } as const]),
    ...(running ? [{ kind: 'checks-running', checks: facts.runningChecks } as const] : []),
  ];
}

/**
 * A pull request is ready once every check reported on its head has completed and none failed, whether the merge requires
 * it or not, and none of its films is queued or recording. A film that failed holds it too, until a later film of that
 * scenario succeeds.
 */
export function evaluatePullRequestReadiness(facts: PullRequestReadinessFacts): PullRequestReadiness {
  const blockers: readonly ReadinessBlocker[] = [
    ...checkBlockers(facts),
    ...(facts.pendingFilms.length === 0 ? [] : [{ kind: 'films-pending', scenarios: facts.pendingFilms } as const]),
    ...(facts.failedFilms.length === 0 ? [] : [{ kind: 'films-failed', scenarios: facts.failedFilms } as const]),
  ];
  return { ready: blockers.length === 0, blockers };
}
