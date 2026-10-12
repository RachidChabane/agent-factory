import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { PullRequestDiff } from '../contract/index.ts';
import type { DiffTarget } from '../data/pull-request-diffs.ts';
import { diffKey } from '../test/fake-transport.ts';
import { renderInProviders, TEST_NOW } from '../test/harness.tsx';
import { emptySnapshot } from '../test/minimal-snapshot.ts';
import { usePullRequestDiff } from './hooks.ts';

const TARGET: DiffTarget = { project: 'storefront', pullRequestNumber: 57, headSha: 'a'.repeat(40) };
const READ_AT = new Date(TEST_NOW - 60_000).toISOString();

const DIFF: PullRequestDiff = {
  pullRequestNumber: 57,
  baseSha: 'c'.repeat(40),
  headSha: TARGET.headSha,
  readAt: READ_AT,
  files: [
    { path: 'src/cart.ts', patch: '@@ -1,1 +1,2 @@\n context\n+added', truncated: false },
    { path: 'src/huge.ts', patch: '@@ -1,1 +1,1 @@\n-old\n+new', truncated: true },
  ],
};

function Probe({ target }: { readonly target: DiffTarget | null }) {
  const { state, reload } = usePullRequestDiff(target);
  return (
    <div>
      <output aria-label="status">{state.status}</output>
      <output aria-label="files">{state.status === 'ready' ? state.diff.files.map((file) => `${file.path}${file.truncated ? ' (cut)' : ''}`).join(', ') : ''}</output>
      <output aria-label="read">{state.status === 'ready' ? state.diff.readAt : ''}</output>
      <output aria-label="error">{state.status === 'failed' ? state.error : ''}</output>
      <button type="button" onClick={reload}>
        Reload
      </button>
    </div>
  );
}

function OnDemand() {
  const [asked, setAsked] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAsked(true)}>
        Open the files
      </button>
      <Probe target={asked ? TARGET : null} />
    </>
  );
}

const served = new Map<string, unknown>([[diffKey('storefront', 57), DIFF]]);

describe('usePullRequestDiff', () => {
  it('reads nothing while the view has not asked for a diff', async () => {
    const view = await renderInProviders(<Probe target={null} />, { snapshot: emptySnapshot(TEST_NOW), diffs: served });
    expect(screen.getByLabelText('status')).toHaveTextContent('idle');
    expect(view.transport.diffRequests).toEqual([]);
  });

  it('reads the diff of the pull request when asked and gives its files, whether they were cut, and the time of the read', async () => {
    const view = await renderInProviders(<Probe target={TARGET} />, { snapshot: emptySnapshot(TEST_NOW), diffs: served });
    await waitFor(() => expect(screen.getByLabelText('status')).toHaveTextContent('ready'));
    expect(screen.getByLabelText('files')).toHaveTextContent('src/cart.ts, src/huge.ts (cut)');
    expect(screen.getByLabelText('read')).toHaveTextContent(READ_AT);
    expect(view.transport.diffRequests).toEqual([{ project: 'storefront', pullRequestNumber: 57 }]);
  });

  it('reads the diff again on request and keeps asking only when told to', async () => {
    const view = await renderInProviders(<Probe target={TARGET} />, { snapshot: emptySnapshot(TEST_NOW), diffs: served });
    await waitFor(() => expect(screen.getByLabelText('status')).toHaveTextContent('ready'));
    await view.user.click(screen.getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(view.transport.diffRequests).toHaveLength(2));
    await waitFor(() => expect(screen.getByLabelText('status')).toHaveTextContent('ready'));
  });

  it('says that the factory knows no such pull request', async () => {
    await renderInProviders(<Probe target={{ ...TARGET, pullRequestNumber: 99 }} />, { snapshot: emptySnapshot(TEST_NOW), diffs: served });
    await waitFor(() => expect(screen.getByLabelText('status')).toHaveTextContent('failed'));
    expect(screen.getByLabelText('error')).toHaveTextContent('the factory knows no pull request 99 in storefront');
  });

  it('says why a read failed', async () => {
    const view = await renderInProviders(<Probe target={TARGET} />, {
      snapshot: emptySnapshot(TEST_NOW),
      diffs: served,
      configureTransport: (transport) => {
        transport.diffFailure = 'git could not read the clone';
      },
    });
    await waitFor(() => expect(screen.getByLabelText('status')).toHaveTextContent('failed'));
    expect(screen.getByLabelText('error')).toHaveTextContent('git could not read the clone');
    expect(view.transport.diffRequests).toHaveLength(1);
  });

  it('starts reading when a view that had not asked yet asks', async () => {
    const view = await renderInProviders(<OnDemand />, { snapshot: emptySnapshot(TEST_NOW), diffs: served });
    expect(view.transport.diffRequests).toEqual([]);
    await view.user.click(screen.getByRole('button', { name: 'Open the files' }));
    await waitFor(() => expect(screen.getByLabelText('status')).toHaveTextContent('ready'));
    expect(view.transport.diffRequests).toHaveLength(1);
  });
});
