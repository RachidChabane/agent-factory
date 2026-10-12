import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clickAndExpectCommand } from '../../test/commands.ts';
import { mapProject } from '../../test/fixtures/mutate.ts';
import { DIRECT_PUSH_SHA, RELEASE } from '../../test/fixtures/storefront/ids.ts';
import { fixtureSnapshot, renderRoute } from '../../test/render.tsx';

const STOREFRONT = 'storefront';
const releasePath = (id: string) => `/projects/${STOREFRONT}/releases/${encodeURIComponent(id)}`;

async function openRelease(id: string, options: Parameters<typeof renderRoute>[1] = {}) {
  const view = await renderRoute(releasePath(id), options);
  await screen.findByRole('article');
  return view;
}

describe('ReleasesView list', () => {
  it('groups the releases as current, verified and superseded, most urgent first', async () => {
    await renderRoute(`/projects/${STOREFRONT}/releases`);
    const current = await screen.findByRole('region', { name: 'Current' });
    const titles = within(current)
      .getAllByRole('link')
      .map((link) => link.querySelector('.list-item__title')?.textContent);
    expect(titles.slice(0, 2)).toEqual([RELEASE.oneEightTwo, RELEASE.oneEightOne]);
    expect(titles).toHaveLength(5);
    expect(within(screen.getByRole('region', { name: 'Verified' })).getByRole('link', { name: /1\.7\.0/ })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Superseded' })).getByRole('link', { name: /release 1\.8\.0/ })).toBeInTheDocument();
  });

  it('never lists a superseded release among the current ones', async () => {
    await renderRoute(`/projects/${STOREFRONT}/releases`);
    const current = await screen.findByRole('region', { name: 'Current' });
    expect(within(current).queryByRole('link', { name: /chore\(main\): release 1\.8\.0/ })).not.toBeInTheDocument();
  });

  it('opens the most urgent release when no release is named', async () => {
    await renderRoute(`/projects/${STOREFRONT}/releases`);
    expect(await screen.findByRole('heading', { level: 1, name: RELEASE.oneEightTwo })).toBeInTheDocument();
  });

  it('selects the release named in the address', async () => {
    await openRelease(RELEASE.oneEightOne);
    expect(screen.getByRole('heading', { level: 1, name: RELEASE.oneEightOne })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: new RegExp(RELEASE.oneEightOne.replace('.', '\\.')) })).toHaveAttribute('aria-current', 'page');
  });

  it('says so when the release does not exist', async () => {
    await renderRoute(releasePath('9.9.9'));
    expect(await screen.findByText('Release not found')).toBeInTheDocument();
  });

  it('explains why a project that tracks no releases has none', async () => {
    const snapshot = mapProject(fixtureSnapshot(), STOREFRONT, (project) => ({ ...project, releases: [], settings: { ...project.settings, releaseModel: 'none' } }));
    await renderRoute(`/projects/${STOREFRONT}/releases`, { snapshot });
    expect(await screen.findByText('This project does not track releases')).toBeInTheDocument();
  });

  it('says that a project with a release model has no release yet', async () => {
    const snapshot = mapProject(fixtureSnapshot(), STOREFRONT, (project) => ({ ...project, releases: [] }));
    await renderRoute(`/projects/${STOREFRONT}/releases`, { snapshot });
    expect(await screen.findByText('No release yet')).toBeInTheDocument();
  });
});

describe('ReleasesView times', () => {
  it('shows when the forge created a release and when the factory noticed it as two distinct times', async () => {
    await openRelease(RELEASE.oneEightOne);
    const timeline = screen.getByRole('region', { name: 'Timeline' });
    const created = within(timeline).getByText('Created on the forge').closest('div');
    const noticed = within(timeline).getByText('Noticed by the factory').closest('div');
    expect(created).toHaveTextContent('Oct 8, 2026, 9:25 AM');
    expect(noticed).toHaveTextContent('Oct 8, 2026, 10:00 AM');
    expect(created).toHaveTextContent('When the forge recorded the release pull request or the tag.');
    expect(noticed).toHaveTextContent('which is not when it was created');
  });

  it('says that the forge does not report a creation time rather than showing the detection time as one', async () => {
    await openRelease(RELEASE.oneSeven);
    const timeline = screen.getByRole('region', { name: 'Timeline' });
    expect(within(timeline).getByText('Created on the forge').closest('div')).toHaveTextContent('The forge does not report it');
    expect(within(timeline).getByText('Noticed by the factory').closest('div')).toHaveTextContent('Sep 20, 2026');
  });

  it('shows the steps a release has not reached as not yet', async () => {
    await openRelease(RELEASE.oneEightOne);
    const timeline = screen.getByRole('region', { name: 'Timeline' });
    expect(within(timeline).getByText('Promoted').closest('div')).toHaveTextContent('Not yet');
    expect(within(timeline).getByText('Verified').closest('div')).toHaveTextContent('Not yet');
  });
});

describe('ReleasesView superseded release', () => {
  it('is shown as superseded by the published version, never as pending', async () => {
    await openRelease(RELEASE.supersededOneEight);
    expect(screen.getByRole('heading', { level: 1, name: 'chore(main): release 1.8.0' })).toBeInTheDocument();
    expect(screen.getAllByText('Superseded by 1.8.0').length).toBeGreaterThan(0);
    expect(screen.getByRole('note')).toHaveTextContent('can no longer be cut or promoted');
    expect(screen.queryByRole('region', { name: 'Release gate' })).not.toBeInTheDocument();
  });

  it('offers neither to cut nor to evaluate it', async () => {
    await openRelease(RELEASE.supersededOneEight);
    expect(screen.queryByRole('button', { name: 'Cut the release' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Re-evaluate the gate' })).not.toBeInTheDocument();
  });
});

describe('ReleasesView gate', () => {
  it('words the blocking reasons of a blocked release', async () => {
    await openRelease(RELEASE.oneEightTwo);
    const gate = screen.getByRole('region', { name: 'Release gate' });
    expect(within(gate).getByText('Not promotable')).toBeInTheDocument();
    const reasons = within(gate).getByRole('list', { name: 'Blocking reasons' });
    expect(within(reasons).getByText('Audit “auditing” is open on commit bfd32d7')).toBeInTheDocument();
    expect(within(reasons).getByText('Pull request #29 has incomplete evidence')).toBeInTheDocument();
    expect(within(reasons).getByText('Health check “homepage” of staging failed')).toBeInTheDocument();
  });

  it('weighs the three conditions of the gate', async () => {
    await openRelease(RELEASE.oneEightTwo);
    const conditions = within(screen.getByRole('region', { name: 'Release gate' })).getByRole('list', { name: 'Conditions' });
    expect(within(conditions).getByText('Audits resolved').closest('li')).toHaveTextContent('open: bfd32d7');
    expect(within(conditions).getByText('Evidence complete').closest('li')).toHaveTextContent('1 pull request without complete evidence');
    expect(within(conditions).getByText('Health before production').closest('li')).toHaveTextContent('1 check failed');
  });

  it('says when the gate was evaluated', async () => {
    await openRelease(RELEASE.oneEightOne);
    expect(screen.getByText('Promotable to production')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Release gate' })).toHaveTextContent(/Gate evaluated 3 days ago/);
  });

  it('says that a release has not been evaluated yet', async () => {
    await openRelease(RELEASE.oneEightThree);
    expect(screen.getByText('The gate has not been evaluated yet')).toBeInTheDocument();
  });

  it('links to the production workflow of a promoted release and never offers to deploy', async () => {
    await openRelease(RELEASE.oneEight);
    const link = screen.getByRole('link', { name: /Open the production workflow/ });
    expect(link).toHaveAttribute('href', 'https://github.example.com/example-org/storefront/actions/runs/9111420685');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText('The factory never deploys to production: you run the workflow yourself.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /deploy/i })).not.toBeInTheDocument();
  });

  it('says that no production workflow is linked when there is none', async () => {
    await openRelease(RELEASE.oneEightOne);
    expect(screen.getByText('No production workflow is linked to this release.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open the production workflow/ })).not.toBeInTheDocument();
  });

  it('shows no gate for a release that is still open', async () => {
    await openRelease(RELEASE.nextMinor);
    expect(screen.queryByRole('region', { name: 'Release gate' })).not.toBeInTheDocument();
  });
});

describe('ReleasesView commands', () => {
  it('cuts an open release on order', async () => {
    const view = await openRelease(RELEASE.nextMinor);
    await clickAndExpectCommand(view.user, screen.getByRole('button', { name: 'Cut the release' }), view.transport, 'release.cut', { project: STOREFRONT, releaseId: RELEASE.nextMinor });
    expect(screen.queryByRole('button', { name: 'Re-evaluate the gate' })).not.toBeInTheDocument();
  });

  it('shows what the factory did after cutting', async () => {
    const view = await openRelease(RELEASE.nextMinor);
    view.transport.effects.set('release.cut', 'Release 1.9.0 cut at 4 commits');
    await view.user.click(screen.getByRole('button', { name: 'Cut the release' }));
    expect(await within(screen.getByRole('status')).findByText('Release 1.9.0 cut at 4 commits')).toBeInTheDocument();
  });

  it('re-evaluates the gate on order', async () => {
    const view = await openRelease(RELEASE.oneEightTwo);
    await clickAndExpectCommand(view.user, screen.getByRole('button', { name: 'Re-evaluate the gate' }), view.transport, 'release.evaluate', { project: STOREFRONT, releaseId: RELEASE.oneEightTwo });
    expect(screen.queryByRole('button', { name: 'Cut the release' })).not.toBeInTheDocument();
  });

  it('shows the refusal of the factory', async () => {
    const view = await openRelease(RELEASE.oneEightTwo);
    view.transport.commandFailure = 'release 1.8.2 is being evaluated';
    await view.user.click(screen.getByRole('button', { name: 'Re-evaluate the gate' }));
    expect(await within(screen.getByRole('alert')).findByText('release 1.8.2 is being evaluated')).toBeInTheDocument();
  });

  it('cannot cut a release that holds no commit', async () => {
    const snapshot = mapProject(fixtureSnapshot(), STOREFRONT, (project) => ({
      ...project,
      releases: project.releases.map((release) => (release.id === RELEASE.nextMinor ? { ...release, commits: [] } : release)),
    }));
    const view = await openRelease(RELEASE.nextMinor, { snapshot });
    const cut = screen.getByRole('button', { name: 'Cut the release' });
    expect(cut).toBeDisabled();
    expect(cut).toHaveAttribute('title', 'A release with no commit cannot be cut.');
    await view.user.click(cut);
    expect(view.transport.commands).toEqual([]);
  });
});

describe('ReleasesView commits', () => {
  it('says who brought each change: the factory, another automation or an audited change', async () => {
    await openRelease(RELEASE.oneEightTwo);
    const commits = screen.getByRole('list', { name: 'Commits of the release' });
    expect(within(commits).getAllByText('Factory merge')).toHaveLength(1);
    expect(within(commits).getByText('Not audited: dependency-updates')).toBeInTheDocument();
    expect(within(commits).getAllByText('Audited change').length).toBeGreaterThan(0);
  });

  it('links a commit to its pull request, its issue and the audit that judged it', async () => {
    await openRelease(RELEASE.oneEightTwo);
    const commits = screen.getByRole('list', { name: 'Commits of the release' });
    expect(within(commits).getByRole('link', { name: 'PR #29' })).toHaveAttribute('href', `/projects/${STOREFRONT}/pull-requests/29`);
    expect(within(commits).getByRole('link', { name: /Audit bfd32d7 · Auditing/ })).toHaveAttribute('href', `/projects/${STOREFRONT}/audits/${DIRECT_PUSH_SHA}`);
  });

  it('says whether the evidence of a pull request is complete', async () => {
    await openRelease(RELEASE.oneEightTwo);
    expect(within(screen.getByRole('list', { name: 'Commits of the release' })).getByText('Evidence incomplete')).toBeInTheDocument();
  });

  it('says that a release holds no commit yet', async () => {
    await openRelease(RELEASE.supersededOneEight);
    expect(screen.getByText('No commit in this release yet')).toBeInTheDocument();
  });

  it('shows the health checks recorded before production', async () => {
    await openRelease(RELEASE.oneEightTwo);
    expect(screen.getByText('staging · homepage')).toBeInTheDocument();
    expect(screen.getByText('503 Service Unavailable after 5 s')).toBeInTheDocument();
  });

  it('says that no health check was recorded rather than leaving the list empty', async () => {
    await openRelease(RELEASE.oneEightThree);
    expect(screen.getByText('No health check has been recorded for this release.')).toBeInTheDocument();
  });
});

describe('ReleasesView in French', () => {
  it('words the gate, the reasons and the buttons in French', async () => {
    await openRelease(RELEASE.oneEightTwo, { locale: 'fr' });
    expect(screen.getByText('Non promouvable')).toBeInTheDocument();
    const reasons = screen.getByRole('list', { name: 'Raisons bloquantes' });
    expect(within(reasons).getByText('L’audit « en audit » est ouvert sur le commit bfd32d7')).toBeInTheDocument();
    expect(within(reasons).getByText('La pull request n° 29 a des preuves incomplètes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réévaluer la gate' })).toBeInTheDocument();
    expect(screen.getAllByText('4 commits').length).toBeGreaterThan(0);
  });

  it('writes the two times with their French labels', async () => {
    await openRelease(RELEASE.oneEightOne, { locale: 'fr' });
    expect(screen.getByText('Créée sur la forge')).toBeInTheDocument();
    expect(screen.getByText('Repérée par l’usine')).toBeInTheDocument();
  });
});
