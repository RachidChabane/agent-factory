import { describe, expect, it } from 'vitest';
import type { Worktree } from '../ports.ts';
import { EvidenceCollector, type EvidenceBundleInput } from './evidence.ts';
import type { CachedEvidence } from './journal-events.ts';
import { InMemoryWorkspace } from './testing/pipeline-fakes.ts';

const CACHE = '/factory/evidence';
const CACHE_ROOT = `${CACHE}/issue-42`;
const WORKTREE: Worktree = { path: '/pool/slot-0', branch: 'factory/42-header', baseSha: 'base0000' };
const HEADER = 'app/test-results/header.png';
const TRACE = 'app/test-results/trace.zip';
const BUNDLE_HEADER_BEFORE = '.evidence/42/before/1-header.png';
const BUNDLE_HEADER_AFTER = '.evidence/42/after/1-header.png';
const BUNDLE_TRACE_AFTER = '.evidence/42/after/2-trace.zip';

function cached(phase: 'before' | 'after', path: string, caption: string, present = true): CachedEvidence {
  return { path, caption, cachedPath: present ? `${phase}/${path}` : null };
}

function input(overrides: Partial<EvidenceBundleInput>): EvidenceBundleInput {
  return { before: [], after: [], beforeLog: null, afterLog: 'passed', diffStat: '1 file changed', acceptanceTests: [], ...overrides };
}

function world(sizes: Readonly<Record<string, number>>, limits: { maxFileBytes: number; maxTotalBytes: number }) {
  const workspace = new InMemoryWorkspace();
  for (const [cachedPath, bytes] of Object.entries(sizes)) workspace.write(CACHE_ROOT, cachedPath, 'x'.repeat(bytes));
  return { workspace, collector: new EvidenceCollector(workspace, CACHE, limits) };
}

describe('the evidence bundle and the limits of a pull request', () => {
  it('commits every file when each is within the file limit and all within the total', async () => {
    const { workspace, collector } = world({ [`before/${HEADER}`]: 100, [`after/${HEADER}`]: 100, [`after/${TRACE}`]: 100 }, { maxFileBytes: 100, maxTotalBytes: 300 });
    const bundle = await collector.writeBundle(
      WORKTREE,
      42,
      input({ before: [cached('before', HEADER, 'header.png')], after: [cached('after', HEADER, 'header.png'), cached('after', TRACE, 'trace.zip')] }),
    );
    expect(bundle.files.map((file) => file.bundlePath)).toEqual([BUNDLE_HEADER_BEFORE, BUNDLE_HEADER_AFTER, BUNDLE_TRACE_AFTER]);
    expect(bundle.omitted).toEqual([]);
    expect(workspace.tree(WORKTREE.path).has(BUNDLE_TRACE_AFTER)).toBe(true);
  });

  it('leaves a file over the file limit off the branch and records its size, its limit and why', async () => {
    const { workspace, collector } = world({ [`after/${HEADER}`]: 101, [`after/${TRACE}`]: 20 }, { maxFileBytes: 100, maxTotalBytes: 1_000 });
    const bundle = await collector.writeBundle(WORKTREE, 42, input({ after: [cached('after', HEADER, 'header.png'), cached('after', TRACE, 'trace.zip')] }));
    expect(bundle.files.map((file) => file.sourcePath)).toEqual([TRACE]);
    expect(bundle.omitted).toEqual([{ phase: 'after', sourcePath: HEADER, caption: 'header.png', bytes: 101, reason: 'file-limit', limitBytes: 100 }]);
    expect(bundle.missing).toEqual([]);
    expect(workspace.tree(WORKTREE.path).has(BUNDLE_HEADER_AFTER)).toBe(false);
  });

  it('leaves the heaviest files out first while the total passes the total limit', async () => {
    const { collector } = world({ [`before/${HEADER}`]: 80, [`after/${HEADER}`]: 90, [`after/${TRACE}`]: 70 }, { maxFileBytes: 100, maxTotalBytes: 160 });
    const bundle = await collector.writeBundle(
      WORKTREE,
      42,
      input({ before: [cached('before', HEADER, 'header.png')], after: [cached('after', HEADER, 'header.png'), cached('after', TRACE, 'trace.zip')] }),
    );
    expect(bundle.files.map((file) => file.bundlePath)).toEqual([BUNDLE_HEADER_BEFORE, BUNDLE_TRACE_AFTER]);
    expect(bundle.omitted.map((file) => [file.sourcePath, file.phase, file.bytes, file.reason, file.limitBytes])).toEqual([[HEADER, 'after', 90, 'total-limit', 160]]);
  });

  it('removes a copy of a file that an earlier bundle left on the branch and that is now kept off', async () => {
    const { workspace, collector } = world({ [`after/${HEADER}`]: 500 }, { maxFileBytes: 100, maxTotalBytes: 1_000 });
    workspace.write(WORKTREE.path, BUNDLE_HEADER_AFTER, 'older and smaller');
    await collector.writeBundle(WORKTREE, 42, input({ after: [cached('after', HEADER, 'header.png')] }));
    expect(workspace.tree(WORKTREE.path).has(BUNDLE_HEADER_AFTER)).toBe(false);
  });

  it('tells a file that was not produced from a file that was left out', async () => {
    const { collector } = world({ [`after/${HEADER}`]: 500 }, { maxFileBytes: 100, maxTotalBytes: 1_000 });
    const bundle = await collector.writeBundle(WORKTREE, 42, input({ after: [cached('after', HEADER, 'header.png'), cached('after', TRACE, 'trace.zip', false)] }));
    expect(bundle.missing).toEqual([{ phase: 'after', sourcePath: TRACE }]);
    expect(bundle.omitted.map((file) => file.sourcePath)).toEqual([HEADER]);
  });

  it('keeps what it left out when only the committed files are kept', async () => {
    const { collector } = world({ [`after/${HEADER}`]: 500, [`after/${TRACE}`]: 10 }, { maxFileBytes: 100, maxTotalBytes: 1_000 });
    const bundle = await collector.writeBundle(WORKTREE, 42, input({ after: [cached('after', HEADER, 'header.png'), cached('after', TRACE, 'trace.zip')] }));
    const committed = collector.keepCommitted(bundle, [BUNDLE_TRACE_AFTER]);
    expect(committed.files).toHaveLength(1);
    expect(committed.omitted).toHaveLength(1);
  });
});
