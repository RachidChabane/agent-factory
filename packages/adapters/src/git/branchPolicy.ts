/** Whether a branch belongs to the factory: it starts with the project's branch prefix and names something after it. */
export function isFactoryBranch(branch: string, branchPrefix: string): boolean {
  return branch.startsWith(branchPrefix) && branch.length > branchPrefix.length;
}
