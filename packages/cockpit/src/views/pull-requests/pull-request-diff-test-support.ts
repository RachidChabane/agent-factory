import { screen, within } from '@testing-library/react';
import type { FilePatchView, PullRequestDiff } from '../../contract/index.ts';
import { headSha, PULL_REQUEST } from '../../test/fixtures/storefront/ids.ts';
import { diffKey } from '../../test/fake-transport.ts';
import type { RenderedView } from '../../test/render.tsx';
import { minutesAgo, STOREFRONT } from './pull-request-test-support.ts';

export const SEARCH = PULL_REQUEST.naturalLanguageSearch;
export const PROMPT_FILE = 'search/prompts/query-rewrite.md';
export const BOUND_FILE = 'web/src/search/price-bound.ts';
export const PROMPT_PATCH = '@@ -1,3 +1,4 @@\n # Query rewrite\n \n+## Price and colour words\n Answer with a JSON object.';
export const BOUND_PATCH = "@@ -0,0 +1,3 @@\n+export type PriceDirection = 'max' | 'min';\n+\n+export const UPPER_WORDS = ['under', 'below'];";
export const READ_FAILURE = 'the clone of the repository is not available';

const BASE_SHA = 'b'.repeat(40);

export const region = (): HTMLElement => screen.getByRole('region', { name: 'Changed files' });
export const toggle = (path: string): HTMLElement => within(region()).getByRole('button', { name: `Changes of ${path}` });
export const diffOf = (path: string): HTMLElement | null => screen.queryByLabelText(`Changes in ${path}`);

export function filePatch(path: string, patch: string, truncated = false): FilePatchView {
  return { path, patch, truncated };
}

/** Makes the factory serve the diff of a pull request, as it is read at the head commit the cockpit knows unless said otherwise. */
export function serveDiff(view: RenderedView, files: readonly FilePatchView[], overrides: Partial<PullRequestDiff> = {}, project: string = STOREFRONT, number: number = SEARCH, head: string = headSha(SEARCH)): void {
  const diff: PullRequestDiff = { pullRequestNumber: number, baseSha: BASE_SHA, headSha: head, readAt: minutesAgo(1), files: [...files], ...overrides };
  view.transport.diffs.set(diffKey(project, number), diff);
}

/** Keeps the diffs in flight until the returned function is called. */
export function holdDiffs(view: RenderedView): () => void {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const serve = view.transport.loadPullRequestDiff.bind(view.transport);
  view.transport.loadPullRequestDiff = async (project, number) => {
    await gate;
    return serve(project, number);
  };
  return release;
}
