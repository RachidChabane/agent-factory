import { FACTORY_BRANCH_PREFIX } from './constants.ts';

export function isFactoryBranch(branch: string): boolean {
  return branch.startsWith(FACTORY_BRANCH_PREFIX) && branch.length > FACTORY_BRANCH_PREFIX.length;
}
