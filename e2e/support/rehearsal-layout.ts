/** Names shared by the process that prepares a rehearsal and the specs that run against it. */
export const HOLD_FILE_NAME = 'agents.hold';

/** The ledger keeps one worktree in its pool, so a pull request that waits for review leaves no room for the next issue. */
export const LEDGER_POOL_SIZE = 1;

export interface DeployedTag {
  readonly tag: string;
  readonly sha: string;
}

/** What the local forge reports as the deployments of the storefront's staging environment: the current tag and the one before. */
export function stagingDeployments(tags: { readonly previous: DeployedTag; readonly current: DeployedTag }) {
  const deployment = (id: string, deployed: DeployedTag, createdAt: string) => ({
    id,
    ref: deployed.tag,
    sha: deployed.sha,
    createdAt,
    creator: 'amorgan',
    state: 'success',
    logUrl: null,
    environmentUrl: null,
  });
  return [deployment('1002', tags.current, '2026-10-10T09:00:00.000Z'), deployment('1001', tags.previous, '2026-10-01T09:00:00.000Z')];
}
