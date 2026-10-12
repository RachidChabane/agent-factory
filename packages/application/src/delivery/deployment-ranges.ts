import type { DeploymentRecord } from '../ports.ts';

/** The commits a deployment brought: those of its sha that its predecessor on the environment did not have. */
export interface DeploymentRange {
  /** The sha of the nearest older deployment that landed, null when none did. */
  readonly baseSha: string | null;
  readonly headSha: string;
}

const LANDED_STATES: ReadonlySet<DeploymentRecord['state']> = new Set(['success', 'inactive']);

/** The range of each deployment, by deployment id, from the deployments of an environment newest first. */
export function deploymentRanges(newestFirst: readonly DeploymentRecord[]): ReadonlyMap<string, DeploymentRange> {
  return new Map(
    newestFirst.map((record, index) => {
      const predecessor = newestFirst.slice(index + 1).find((older) => LANDED_STATES.has(older.state));
      return [record.id, { baseSha: predecessor?.sha ?? null, headSha: record.sha }] as const;
    }),
  );
}
