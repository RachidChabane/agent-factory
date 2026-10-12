import { describe, expect, it } from 'vitest';
import type { ProjectView } from '../../contract/index.ts';
import { STOREFRONT_ID } from '../../test/fixtures/project-ids.ts';
import { pullRequestView } from '../../test/fixtures/seeds.ts';
import { fixtureSnapshot } from '../../test/render.tsx';
import { publishedIssueTarget, pullRequestTarget } from './audit-links.ts';

type LinkedProject = Pick<ProjectView, 'id' | 'pullRequests'>;

const factoryPullRequest = pullRequestView({
  number: 22,
  title: 'build(deps): update the HTTP client',
  issueNumber: 19,
  type: 'dependencies',
  branch: 'factory/19-http-client',
  url: 'https://forge.example.com/example-org/shop/pull/22',
  headSha: 'abc',
  state: 'merged',
  openedAt: '2026-10-01T09:00:00.000Z',
});

const project: LinkedProject = { id: 'shop', pullRequests: [factoryPullRequest] };
const FORGE_PAGE = 'https://forge.example.com/example-org/shop/pull/48';
const SERVED_PAGE = '/api/projects/shop/forge/pulls/48.md';

describe('pullRequestTarget', () => {
  it('leads to the page of the cockpit for a pull request the factory opened, whatever address the forge gives', () => {
    expect(pullRequestTarget(project, 22, 'https://forge.example.com/example-org/shop/pull/22')).toEqual({ kind: 'internal', to: '/projects/shop/pull-requests/22' });
    expect(pullRequestTarget(project, 22, null)).toEqual({ kind: 'internal', to: '/projects/shop/pull-requests/22' });
  });

  it('leads to the page the forge gives any other pull request', () => {
    expect(pullRequestTarget(project, 48, FORGE_PAGE)).toEqual({ kind: 'forge', href: FORGE_PAGE });
  });

  it('leads to the page a local forge serves, which is an address like another', () => {
    expect(pullRequestTarget(project, 48, SERVED_PAGE)).toEqual({ kind: 'forge', href: SERVED_PAGE });
  });

  it('leads nowhere when the forge gives no page', () => {
    expect(pullRequestTarget(project, 48, null)).toEqual({ kind: 'unlinked' });
  });

  it('leads nowhere rather than to an empty address', () => {
    expect(pullRequestTarget(project, 48, '')).toEqual({ kind: 'unlinked' });
  });

  it('keeps the pull requests of the project apart from those of another that share a number', () => {
    expect(pullRequestTarget({ id: 'ledger', pullRequests: [] }, 22, 'https://forge.example.com/example-org/ledger/pull/22')).toEqual({
      kind: 'forge',
      href: 'https://forge.example.com/example-org/ledger/pull/22',
    });
  });
});

describe('publishedIssueTarget', () => {
  const storefront = fixtureSnapshot().projects.find((candidate) => candidate.id === STOREFRONT_ID);
  if (storefront === undefined) throw new Error('the fixture world has no storefront');
  const [listed] = storefront.issues;
  if (listed === undefined) throw new Error('the storefront of the fixture world lists no issue');
  const unlisted = Math.max(...storefront.issues.map((issue) => issue.number)) + 1;

  it('leads to the page of the cockpit for an issue the factory lists', () => {
    expect(publishedIssueTarget(storefront, listed.number)).toEqual({ kind: 'internal', to: `/projects/${STOREFRONT_ID}/issues/${listed.number}` });
  });

  it('leads nowhere for an issue the factory does not list', () => {
    expect(publishedIssueTarget(storefront, unlisted)).toEqual({ kind: 'unlinked' });
  });

  it('keeps the issues of the project apart from those of another that share a number', () => {
    expect(publishedIssueTarget({ id: 'ledger', issues: [] }, listed.number)).toEqual({ kind: 'unlinked' });
  });
});
