const HOME_DIRECTORY_PATTERN = /\/(?:Users|home)\/[^/\s'"]+/g;
const HOME_DIRECTORY_MARK = '~';
const WORKTREE_MARK = '.';
const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g;
const PATH_CONTINUATION = '(?![\\w.-])';

function escapeRegExp(text: string): string {
  return text.replace(REGEXP_SPECIALS, '\\$&');
}

export function withoutLocalPaths(text: string, worktreePaths: readonly string[]): string {
  const roots = worktreePaths.filter((path) => path.length > 1).toSorted((left, right) => right.length - left.length);
  const relative = roots.reduce((current, root) => current.replace(new RegExp(`${escapeRegExp(root)}${PATH_CONTINUATION}`, 'g'), WORKTREE_MARK), text);
  return relative.replace(HOME_DIRECTORY_PATTERN, HOME_DIRECTORY_MARK);
}
