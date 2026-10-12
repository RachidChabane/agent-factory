import { ReferencesNotReadyError } from './reference-errors.ts';
import type { ReferenceSnapshot, ReferenceSnapshots, ReferenceSource } from './reference-ports.ts';

export type ReferenceOutcome =
  | { readonly ok: true; readonly reference: ReferenceSource; readonly snapshot: ReferenceSnapshot }
  | { readonly ok: false; readonly reference: ReferenceSource; readonly message: string };

/** Materialises each reference in order, and keeps going after one that cannot be: every outcome is reported. */
export async function materialiseReferences(snapshots: ReferenceSnapshots, references: readonly ReferenceSource[]): Promise<readonly ReferenceOutcome[]> {
  const outcomes: ReferenceOutcome[] = [];
  for (const reference of references) {
    try {
      outcomes.push({ ok: true, reference, snapshot: await snapshots.materialise(reference) });
    } catch (error) {
      outcomes.push({ ok: false, reference, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return outcomes;
}

/** What went wrong with a reference, naming it. */
export function referenceFailure(reference: ReferenceSource, message: string): string {
  return `reference ${reference.name}: ${message}`;
}

/** Every snapshot, or a refusal that lists every reference that could not be materialised. */
export async function requireReferences(snapshots: ReferenceSnapshots, references: readonly ReferenceSource[]): Promise<readonly ReferenceSnapshot[]> {
  const outcomes = await materialiseReferences(snapshots, references);
  const problems = outcomes.flatMap((outcome) => (outcome.ok ? [] : [referenceFailure(outcome.reference, outcome.message)]));
  if (problems.length > 0) throw new ReferencesNotReadyError(problems);
  return outcomes.flatMap((outcome) => (outcome.ok ? [outcome.snapshot] : []));
}
