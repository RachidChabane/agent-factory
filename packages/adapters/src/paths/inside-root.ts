import { isAbsolute, normalize, relative, resolve } from 'node:path';
import { PathOutsideWorktreeError } from '../git/errors.ts';

export function toRelativeInside(root: string, path: string): string {
  const absolute = isAbsolute(path) ? normalize(path) : resolve(root, path);
  const relation = relative(resolve(root), absolute);
  if (relation === '' || relation.startsWith('..') || isAbsolute(relation)) throw new PathOutsideWorktreeError(path);
  return relation;
}

export function resolveInside(root: string, path: string): string {
  return resolve(root, toRelativeInside(root, path));
}
