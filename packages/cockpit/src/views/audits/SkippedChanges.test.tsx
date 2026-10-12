import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SkippedChangeView } from '../../contract/index.ts';
import { clickAndExpectCommand } from '../../test/commands.ts';
import { renderRoute } from '../../test/render.tsx';
import { AUDIT, auditsPath, hoursAgo, LEDGER, minutesAgo, openAudit, short, SKIPPED, STOREFRONT, withProject } from './audit-test-support.ts';

const SKIPPED_LIST = '5 changes not audited';

async function openSkipped(project: string = STOREFRONT, options: Parameters<typeof renderRoute>[1] = {}) {
  const view = await renderRoute(auditsPath(project), options);
  await view.user.click(await screen.findByRole('radio', { name: options.locale === 'fr' ? /changements? non audités?$/ : /changes? not audited$/ }));
  return view;
}

const itemOf = (message: RegExp | string) => within(screen.getByRole('list', { name: 'Changes not audited' })).getByText(message).closest('li') as HTMLElement;
const requestButton = (item: HTMLElement) => within(item).getByRole('button', { name: /^Request audit of / });

describe('AuditsView changes not audited', () => {
  it('shows the audits first and the changes recorded without an audit one switch away, each with its count', async () => {
    await renderRoute(auditsPath(STOREFRONT));
    expect(await screen.findByRole('radio', { name: '6 audits' })).toBeChecked();
    expect(screen.getByRole('radio', { name: SKIPPED_LIST })).not.toBeChecked();
    expect(screen.queryByRole('list', { name: 'Changes not audited' })).not.toBeInTheDocument();
  });

  it('lists the changes the project records without an audit, the most recent first', async () => {
    await openSkipped();
    expect(screen.getByRole('radio', { name: SKIPPED_LIST })).toBeChecked();
    const items = within(screen.getByRole('list', { name: 'Changes not audited' })).getAllByRole('listitem');
    expect(items.map((item) => within(item).getByText(/^[0-9a-f]{7}$/).textContent)).toEqual(Object.values(SKIPPED).map(short));
    expect(screen.queryByRole('region', { name: 'To handle' })).not.toBeInTheDocument();
  });

  it('labels each change as not audited, with the automation that made it', async () => {
    await openSkipped();
    expect(within(itemOf('build(deps-dev): bump vite from 7.1.2 to 7.3.7 (#46)')).getByText('Not audited: dependency-updates')).toBeInTheDocument();
    expect(within(itemOf('docs: sync the API reference from the OpenAPI schema (#53)')).getByText('Not audited: docs-sync')).toBeInTheDocument();
    expect(screen.getAllByText(/^Not audited: /)).toHaveLength(5);
  });

  it('gives the commit, its message, its author, its branch and the time it was recorded', async () => {
    await openSkipped();
    const item = itemOf('build(deps-dev): bump vite from 7.1.2 to 7.3.7 (#46)');
    expect(within(item).getByText(short(SKIPPED.viteBump))).toHaveAttribute('title', SKIPPED.viteBump);
    expect(within(item).getByText('dependency-bot[bot]')).toBeInTheDocument();
    expect(within(item).getByText('dependency-bot/npm/vite-7.3.7')).toBeInTheDocument();
    expect(within(item).getByText(/ago$/)).toHaveAttribute('datetime', hoursAgo(14));
  });

  it('says that no author is reported when the forge names none', async () => {
    await openSkipped();
    expect(within(itemOf('docs: sync the API reference from the OpenAPI schema (#53)')).getByText('No author reported')).toBeInTheDocument();
    expect(within(itemOf('build(deps-dev): bump vite from 7.1.2 to 7.3.7 (#46)')).queryByText('No author reported')).not.toBeInTheDocument();
  });

  it('links the pull request of a change on the forge, in a new tab', async () => {
    await openSkipped();
    const link = within(itemOf('build(deps-dev): bump vite from 7.1.2 to 7.3.7 (#46)')).getByRole('link', { name: 'PR #46' });
    expect(link).toHaveAttribute('href', 'https://github.example.com/example-org/storefront/pull/46');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('links the pull request of the factory to its own page', async () => {
    const snapshot = withProject(STOREFRONT, (project) => ({
      ...project,
      skippedChanges: project.skippedChanges.map((change) => (change.commitSha === SKIPPED.viteBump ? { ...change, pullRequestNumber: 22 } : change)),
    }));
    await openSkipped(STOREFRONT, { snapshot });
    const link = within(itemOf('build(deps-dev): bump vite from 7.1.2 to 7.3.7 (#46)')).getByRole('link', { name: 'PR #22' });
    expect(link).toHaveAttribute('href', '/projects/storefront/pull-requests/22');
  });

  it('keeps the change while another one is selected, and keeps the selected audit on the right', async () => {
    const view = await openAudit(AUDIT.footerLinks);
    await view.user.click(screen.getByRole('radio', { name: SKIPPED_LIST }));
    expect(screen.getByRole('list', { name: 'Changes not audited' })).toBeInTheDocument();
    expect(within(screen.getByRole('article')).getByRole('heading', { level: 1, name: /^fix\(footer\): point the delivery and returns links/ })).toBeInTheDocument();
  });

  it('goes back to the audits', async () => {
    const view = await openSkipped();
    await view.user.click(screen.getByRole('radio', { name: '6 audits' }));
    expect(screen.getByRole('region', { name: 'To handle' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Changes not audited' })).not.toBeInTheDocument();
  });

  it('switches with the arrow keys', async () => {
    const view = await renderRoute(auditsPath(STOREFRONT));
    (await screen.findByRole('radio', { name: '6 audits' })).focus();
    await view.user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: SKIPPED_LIST })).toBeChecked();
    expect(screen.getByRole('list', { name: 'Changes not audited' })).toBeInTheDocument();
  });
});

describe('AuditsView request an audit', () => {
  it('names the change in the button, so that each of them can be told apart', async () => {
    await openSkipped();
    const names = within(screen.getByRole('list', { name: 'Changes not audited' }))
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    expect(names).toEqual(Object.values(SKIPPED).map((sha) => `Request audit of ${short(sha)}`));
  });

  it('asks the factory to audit the change anyway, with the project and the full commit', async () => {
    const view = await openSkipped();
    const item = itemOf('build(deps-dev): bump vite from 7.1.2 to 7.3.7 (#46)');
    await clickAndExpectCommand(view.user, requestButton(item), view.transport, 'audit.request', { project: STOREFRONT, commitSha: SKIPPED.viteBump });
  });

  it('asks for the audit of another change with that change only', async () => {
    const view = await openSkipped();
    await clickAndExpectCommand(view.user, requestButton(itemOf('build(deps): bump react-router from 7.17.2 to 7.18.4 (#13)')), view.transport, 'audit.request', { project: STOREFRONT, commitSha: SKIPPED.routerBump });
  });

  it('shows what the factory did once the audit is requested', async () => {
    const view = await openSkipped();
    view.transport.effects.set('audit.request', 'An audit of 5b3812f is queued');
    await view.user.click(requestButton(itemOf('build(deps-dev): bump vite from 7.1.2 to 7.3.7 (#46)')));
    expect(await within(screen.getByRole('status')).findByText('An audit of 5b3812f is queued')).toBeInTheDocument();
  });

  it('shows the refusal of the factory', async () => {
    const view = await openSkipped();
    view.transport.commandFailure = 'commit 5b3812f is unknown to the forge';
    await view.user.click(requestButton(itemOf('build(deps-dev): bump vite from 7.1.2 to 7.3.7 (#46)')));
    expect(await within(screen.getByRole('alert')).findByText('commit 5b3812f is unknown to the forge')).toBeInTheDocument();
  });

  it('is disabled while the audit is being requested, and sends it only once', async () => {
    const view = await openSkipped();
    const item = itemOf('build(deps-dev): bump vite from 7.1.2 to 7.3.7 (#46)');
    const release = view.transport.holdCommands();
    await view.user.click(requestButton(item));
    await waitFor(() => expect(requestButton(item)).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(requestButton(item)).toBeEnabled());
    expect(view.transport.commands).toHaveLength(1);
  });

  it('links the audit a change already has, and still lets the operator ask', async () => {
    const view = await openSkipped();
    const item = itemOf('docs: sync the API reference from the OpenAPI schema (#56)');
    expect(within(item).getByRole('link', { name: 'Audit: Detected' })).toHaveAttribute('href', `/projects/storefront/audits/${AUDIT.apiReference}`);
    expect(within(item).getByText('Not audited: docs-sync')).toBeInTheDocument();
    await clickAndExpectCommand(view.user, requestButton(item), view.transport, 'audit.request', { project: STOREFRONT, commitSha: SKIPPED.docsResync });
  });

  it('links no audit for a change that has none', async () => {
    await openSkipped();
    expect(within(itemOf('build(deps-dev): bump vite from 7.1.2 to 7.3.7 (#46)')).queryByRole('link', { name: /^Audit: / })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^Audit: / })).toHaveLength(1);
  });
});

describe('AuditsView changes not audited, in the states of a project', () => {
  const change = (overrides: Partial<SkippedChangeView> = {}): SkippedChangeView => ({
    commitSha: 'a'.repeat(40),
    automation: 'dependency-updates',
    commitMessage: 'build(deps): bump pytest to 8.5.0 (#31)',
    authorLogin: 'dependency-bot[bot]',
    pullRequestNumber: 31,
    pullRequestUrl: '/api/projects/ledger/forge/pulls/31.md',
    branch: 'dependency-bot/pytest',
    recordedAt: minutesAgo(30),
    ...overrides,
  });

  it('says that a project that names no other automation has no change to show, and why', async () => {
    await openSkipped(LEDGER);
    expect(screen.getByRole('radio', { name: '0 changes not audited' })).toBeChecked();
    expect(screen.getByText('This project names no other automation')).toBeInTheDocument();
    expect(screen.getByText('Every change that reaches the base branch outside the factory is audited.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Changes not audited' })).not.toBeInTheDocument();
  });

  it('says that nothing is recorded yet for a project whose automations have made no change', async () => {
    await openSkipped(STOREFRONT, { snapshot: withProject(STOREFRONT, (project) => ({ ...project, skippedChanges: [] })) });
    expect(screen.getByText('No change recorded yet')).toBeInTheDocument();
    expect(screen.getByText('The changes of dependency-updates and docs-sync are recorded here without an audit.')).toBeInTheDocument();
    expect(screen.queryByText('This project names no other automation')).not.toBeInTheDocument();
  });

  it('asks the factory of the ledger for the audit of a change of the ledger', async () => {
    const snapshot = withProject(LEDGER, (project) => ({ ...project, skippedChanges: [change()] }));
    const view = await openSkipped(LEDGER, { snapshot });
    await clickAndExpectCommand(view.user, requestButton(itemOf('build(deps): bump pytest to 8.5.0 (#31)')), view.transport, 'audit.request', { project: LEDGER, commitSha: 'a'.repeat(40) });
  });

  it('opens the pull request of a change of a local forge on the page the forge serves, in a new tab', async () => {
    const snapshot = withProject(LEDGER, (project) => ({ ...project, skippedChanges: [change()] }));
    await openSkipped(LEDGER, { snapshot });
    const link = within(itemOf('build(deps): bump pytest to 8.5.0 (#31)')).getByRole('link', { name: 'PR #31' });
    expect(link).toHaveAttribute('href', '/api/projects/ledger/forge/pulls/31.md');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('names the pull request of a change without a link when the forge gives no page', async () => {
    const snapshot = withProject(LEDGER, (project) => ({ ...project, skippedChanges: [change({ pullRequestUrl: null })] }));
    await openSkipped(LEDGER, { snapshot });
    const item = itemOf('build(deps): bump pytest to 8.5.0 (#31)');
    expect(within(item).getByText('PR #31')).toBeInTheDocument();
    expect(within(item).queryByRole('link', { name: 'PR #31' })).not.toBeInTheDocument();
  });

  it('says that a change has no pull request and no branch when it has none', async () => {
    const snapshot = withProject(LEDGER, (project) => ({ ...project, skippedChanges: [change({ pullRequestNumber: null, branch: null })] }));
    await openSkipped(LEDGER, { snapshot });
    const item = itemOf('build(deps): bump pytest to 8.5.0 (#31)');
    expect(within(item).getByText('No pull request')).toBeInTheDocument();
    expect(within(item).getByText('No branch reported')).toBeInTheDocument();
  });

  it('lists the changes newest first even when they arrive in another order', async () => {
    const older = change({ commitSha: 'b'.repeat(40), commitMessage: 'older change', recordedAt: minutesAgo(600) });
    const newer = change({ commitSha: 'c'.repeat(40), commitMessage: 'newer change', recordedAt: minutesAgo(10) });
    await openSkipped(LEDGER, { snapshot: withProject(LEDGER, (project) => ({ ...project, skippedChanges: [older, newer] })) });
    const items = within(screen.getByRole('list', { name: 'Changes not audited' })).getAllByRole('listitem');
    expect(items.map((item) => within(item).getByText(/change$/).textContent)).toEqual(['newer change', 'older change']);
  });
});

describe('AuditsView changes not audited, in French', () => {
  it('words the list, the badge and the button in French', async () => {
    const view = await openSkipped(STOREFRONT, { locale: 'fr' });
    expect(screen.getByRole('radio', { name: '5 changements non audités' })).toBeChecked();
    const list = screen.getByRole('list', { name: 'Changements non audités' });
    expect(within(list).getAllByText(/^Non audité : /)).toHaveLength(5);
    expect(within(list).getAllByText('Aucun auteur communiqué')).toHaveLength(2);
    expect(within(list).getAllByText('Enregistré')).toHaveLength(5);
    await clickAndExpectCommand(view.user, within(list).getByRole('button', { name: `Demander un audit de ${short(SKIPPED.viteBump)}` }), view.transport, 'audit.request', {
      project: STOREFRONT,
      commitSha: SKIPPED.viteBump,
    });
  });

  it('words the empty states in French', async () => {
    await openSkipped(LEDGER, { locale: 'fr' });
    expect(screen.getByText('Ce projet ne nomme aucune autre automatisation')).toBeInTheDocument();
  });
});
