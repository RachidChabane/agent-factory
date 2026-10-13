import { readFile, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { PullRequestBodyRenderer, type PullRequestBodyInput } from './pull-request-body.ts';
import { webForgeFileLinks } from './testing/file-links.ts';

const GOLDEN = new URL('./__fixtures__/pull-request-body.golden.md', import.meta.url);
const UPDATE_GOLDEN = process.env['UPDATE_GOLDEN'] === '1';

const INPUT: PullRequestBodyInput = {
  fileLinks: webForgeFileLinks('https://github.com', 'acme', 'widgets'),
  spec: {
    number: 42,
    title: 'Link mockups to their conversation',
    type: 'ui',
    need: 'Operators lose track of which conversation produced a mockup.',
    acceptanceCriteria: ['The mockup header links the conversation.', 'The link opens the conversation at the producing message.'],
    outOfScope: ['Editing the conversation from the mockup.'],
    expectedProof: 'A Playwright journey with screenshots of the header.',
    dependsOn: [7],
    commitKind: null,
    films: [],
  },
  branch: 'factory/42-link-mockups-to-their-conversation',
  baseSha: '1111111aaaaaaa',
  evidenceSha: '2222222bbbbbbb',
  manifest: {
    runner: 'playwright',
    checks: [
      { criterion: 1, paths: ['app/e2e/mockup-link.spec.ts'], description: 'the header shows the link', onBase: 'fails' },
      { criterion: 2, paths: ['app/e2e/mockup-link.spec.ts', 'app/e2e/conversation.spec.ts'], description: 'the link opens the message', onBase: 'fails' },
    ],
    command: ['pnpm', 'exec', 'playwright', 'test', 'e2e'],
    evidence: ['app/test-results/header.png', 'app/test-results/trace.zip'],
    score: null,
  },
  frozenChecks: [
    { path: 'app/e2e/conversation.spec.ts', sha256: 'a'.repeat(64) },
    { path: 'app/e2e/mockup-link.spec.ts', sha256: 'b'.repeat(64) },
  ],
  beforeProof: {
    checksExpressible: true,
    exitCode: 1,
    checksFailedOnBase: true,
    scoreReport: null,
    baseScore: null,
    logName: 'before-proof.log',
    evaluation: { valid: true, kind: 'fails-on-base' },
    evidence: [],
    runner: 'playwright',
    tests: [
      {
        id: 'app/e2e/mockup-link.spec.ts > mockup header > links the conversation',
        file: 'app/e2e/mockup-link.spec.ts',
        criteria: [1, 2],
        outcome: 'failed',
        failureKind: 'assertion',
        failureMessage: 'Error: expect(locator).toBeVisible() failed',
      },
      {
        id: 'app/e2e/conversation.spec.ts > opens at the producing message',
        file: 'app/e2e/conversation.spec.ts',
        criteria: [2],
        outcome: 'failed',
        failureKind: 'assertion',
        failureMessage: 'Error: expect(page).toHaveURL(expected) failed',
      },
    ],
  },
  gate: {
    passed: true,
    steps: [
      { name: 'frozen-checks', outcome: 'passed', detail: 'passed' },
      { name: 'lint', outcome: 'passed', detail: 'passed' },
      { name: 'acceptance', outcome: 'passed', detail: 'passed' },
    ],
  },
  afterScore: null,
  bundle: {
    directory: '.evidence/42',
    beforeLogPath: '.evidence/42/before.log',
    afterLogPath: '.evidence/42/after.log',
    diffStatPath: '.evidence/42/diffstat.txt',
    acceptanceTestsPath: '.evidence/42/acceptance-tests.json',
    files: [
      { phase: 'before', sourcePath: 'app/test-results/header.png', bundlePath: '.evidence/42/before/app/test-results/header.png', caption: 'header.png' },
      { phase: 'after', sourcePath: 'app/test-results/header.png', bundlePath: '.evidence/42/after/app/test-results/header.png', caption: 'header.png' },
      { phase: 'after', sourcePath: 'app/test-results/trace.zip', bundlePath: '.evidence/42/after/app/test-results/trace.zip', caption: 'trace.zip' },
    ],
    missing: [{ phase: 'before', sourcePath: 'app/test-results/trace.zip' }],
    omitted: [],
  },
  diffStat: [
    { path: 'app/e2e/mockup-link.spec.ts', added: 24, removed: 0 },
    { path: 'app/pages/mockup.vue', added: 6, removed: 1 },
  ],
  reviewFindings: [
    { severity: 'non-blocking', category: 'correctness', file: 'app/pages/mockup.vue', line: 18, summary: 'The link has no accessible name on narrow screens.' },
  ],
  attempts: { total: 2, resumed: 1, escalated: 0 },
  costUsd: 3.456,
  externalFeedback: [],
  acceptanceTests: [
    { criterion: 1, test: 'app/e2e/mockup-link.spec.ts > mockup header > links the conversation', base: 'red (assertion)', branch: 'green' },
    { criterion: 2, test: 'app/e2e/mockup-link.spec.ts > mockup header > links the conversation', base: 'red (assertion)', branch: 'green' },
    { criterion: 2, test: 'app/e2e/conversation.spec.ts > opens at the producing message', base: 'red (assertion)', branch: 'green' },
  ],
  filmSection: null,
};

describe('PullRequestBodyRenderer', () => {
  it('renders the proof first, then issues, criteria, risks and technical details', async () => {
    const body = new PullRequestBodyRenderer().render(INPUT);
    if (UPDATE_GOLDEN) await writeFile(GOLDEN, body);
    expect(body).toBe(await readFile(GOLDEN, 'utf8'));
  });

  it('embeds evidence images through commit-pinned raw URLs', () => {
    const body = new PullRequestBodyRenderer().render(INPUT);
    expect(body).toContain(
      '![header.png, after](https://github.com/acme/widgets/blob/2222222bbbbbbb/.evidence/42/after/app/test-results/header.png?raw=true)',
    );
    expect(body.indexOf('## What to look at')).toBe(0);
  });

  it('states which test proves which criterion, red on base and green on the branch', () => {
    const body = new PullRequestBodyRenderer().render(INPUT);
    expect(body).toContain('**Before** on base `1111111`: 2 acceptance tests fail on an assertion (playwright).');
    expect(body).toContain('| 2 | `app/e2e/conversation.spec.ts > opens at the producing message` | red (assertion) | green |');
    expect(body).toContain('[acceptance tests](https://github.com/acme/widgets/blob/2222222bbbbbbb/.evidence/42/acceptance-tests.json)');
  });

  it('names the evidence the limits keep off the pull request, in its table row and among the risks', () => {
    const bundle = {
      ...INPUT.bundle,
      files: INPUT.bundle.files.filter((file) => file.bundlePath !== '.evidence/42/after/app/test-results/header.png'),
      omitted: [{ phase: 'after' as const, sourcePath: 'app/test-results/header.png', caption: 'header.png', bytes: 6_200_000, reason: 'file-limit' as const, limitBytes: 5_000_000 }],
    };
    const body = new PullRequestBodyRenderer().render({ ...INPUT, bundle });
    expect(body).toContain('left out: 6.2 MB, over the limit of 5 MB per file (evidence.maxFileBytes) |');
    expect(body).toContain('- Evidence `app/test-results/header.png` (after the change) was left out of the pull request: 6.2 MB, over the limit of 5 MB per file (evidence.maxFileBytes).');
    expect(body).not.toContain('header.png, after');
  });

  it('keeps a test id with a pipe inside its table cell', () => {
    const body = new PullRequestBodyRenderer().render({ ...INPUT, acceptanceTests: [{ criterion: 1, test: 'tests/a.py::test_x[a|b]', base: 'red (assertion)', branch: 'green' }] });
    expect(body).toContain('| 1 | `tests/a.py::test_x[a\\|b]` | red (assertion) | green |');
  });

  it('falls back to the exit code when the checks ran without a test report', () => {
    const body = new PullRequestBodyRenderer().render({ ...INPUT, beforeProof: { ...INPUT.beforeProof, runner: null, tests: [] }, acceptanceTests: [] });
    expect(body).toContain('**Before** on base `1111111`: the acceptance checks fail (exit code 1).');
    expect(body).not.toContain('| Criterion | Test |');
  });

  it('ends with the film section the films of the pull request announce', () => {
    const section = '## Behaviour on video\n\n### Scenario `checkout-flow`\n\nThe videos are being recorded.';
    const body = new PullRequestBodyRenderer().render({ ...INPUT, filmSection: section });
    expect(body.endsWith(`${section}\n`)).toBe(true);
    expect(new PullRequestBodyRenderer().render(INPUT)).not.toContain('Behaviour on video');
  });

  it('states the base score and the branch score of a scored issue', () => {
    const body = new PullRequestBodyRenderer().render({
      ...INPUT,
      manifest: { ...INPUT.manifest, evidence: [] },
      beforeProof: { ...INPUT.beforeProof, runner: 'eval', tests: [], baseScore: 0.3, checksFailedOnBase: false, exitCode: 0, evaluation: { valid: true, kind: 'base-score' } },
      afterScore: 0.82,
    });
    expect(body).toContain('**Before** on base `1111111`: score 0.30 on the targeted cases.');
    expect(body).toContain('; score 0.82 on the targeted cases.');
    expect(body).not.toContain('| Evidence |');
  });
});
