import { renderSpecFile, type ProjectConventions } from '@agent-factory/application';
import { CATEGORY_FILTER } from '../demo/story/storefront/category-filter.ts';
import type { StoryFile, StoryIssue } from '../demo/story/story-types.ts';
import { ExpectationFailed } from './expectations.ts';

/** The issue of the storefront's story that the example run takes from its spec to a merged pull request. */
export const EXAMPLE_ISSUE: StoryIssue = CATEGORY_FILTER;

/** The spec of an issue as the file an operator hands to `issue create`. */
export function renderSpecDocument(issue: StoryIssue, conventions: ProjectConventions): string {
  const rendered = renderSpecFile(issue.spec, conventions);
  if (rendered.problems.length > 0) throw new ExpectationFailed(`the spec of ${issue.key} renders as a spec file`, 'no problem', rendered.problems.join('\n'));
  return rendered.content;
}

/**
 * The files an issue adds to the repository once merged: the frozen checks the acceptance author
 * writes, then what the implementer's attempts leave in place (a later attempt replaces an earlier one).
 */
export function mergedFiles(issue: StoryIssue): readonly StoryFile[] {
  const files = new Map<string, string>(issue.checks.files.map((file) => [file.path, file.content]));
  for (const attempt of issue.attempts) {
    for (const file of attempt.writes) files.set(file.path, file.content);
    for (const path of attempt.deletes) files.delete(path);
  }
  return [...files].map(([path, content]) => ({ path, content }));
}
