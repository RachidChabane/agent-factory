import type { IssueTypeInfo } from '../../contract/index.ts';

/** The prefix a commit of this type carries, as a conventional commit writes it: `feat` or `build(deps)`. */
export function commitPrefix(type: Pick<IssueTypeInfo, 'commitType' | 'commitScope'>): string {
  return type.commitScope === null ? type.commitType : `${type.commitType}(${type.commitScope})`;
}
