import type { CockpitSnapshot, ProjectView, RunView } from '../../../contract/index.ts';
import { buildWorld, LEDGER_ID, STOREFRONT_ID } from '../world.ts';

export const NOW = Date.parse('2026-10-12T10:00:00.000Z');

export const world = buildWorld(NOW);
export const snapshot: CockpitSnapshot = world.snapshot;

export function required<Value>(value: Value | null | undefined, what: string): Value {
  if (value === null || value === undefined) throw new Error(`the world has no ${what}`);
  return value;
}

export function projectNamed(id: string): ProjectView {
  return required(
    snapshot.projects.find((project) => project.id === id),
    `project ${id}`,
  );
}

export const storefront = projectNamed(STOREFRONT_ID);
export const ledger = projectNamed(LEDGER_ID);

export function runNamed(id: string): RunView {
  return required(
    snapshot.runs.find((run) => run.id === id),
    `run ${id}`,
  );
}

export function duplicates(values: readonly (string | number)[]): (string | number)[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}
