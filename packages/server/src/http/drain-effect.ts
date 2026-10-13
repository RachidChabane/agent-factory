export interface DrainFacts {
  /** The issues whose pipeline runs now, in every project. */
  readonly runningIssues: number;
  /** Whether nothing else is going on either: no challenge, audit, film recording or task of the installation. */
  readonly calm: boolean;
}

/** What the operator is told a drain waits for, in the words of the cockpit's answer. */
export function drainEffect({ runningIssues, calm }: DrainFacts): string {
  if (runningIssues > 0) return `No new work starts; the factory stops once its ${runningIssues} running issue(s) finish`;
  return calm ? 'No new work starts; the factory stops at its next tick' : 'No new work starts; the factory stops once its running work finishes';
}
