import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Deployment } from '../../contract/index.ts';
import { mapProject } from '../../test/fixtures/mutate.ts';
import { fixtureSnapshot } from '../../test/render.tsx';
import { clock, environmentCard, LEDGER, openDelivery, panelOf, STOREFRONT, withCurrentDeployment, withEnvironment } from './delivery-test-support.ts';

describe('DeliveryView environments', () => {
  it('shows each environment of the project with where it stands and how it is promoted', async () => {
    await openDelivery();
    const names = screen.getAllByRole('article').map((card) => within(card).getByRole('heading', { level: 3 }).textContent);
    expect(names).toEqual(['development', 'staging', 'production']);
    expect(environmentCard('development')).toHaveTextContent('Deploying');
    expect(environmentCard('development')).toHaveTextContent('Promotion: Automatic');
    expect(environmentCard('staging')).toHaveTextContent('Degraded');
    expect(environmentCard('staging')).toHaveTextContent('Promotion: In release batches');
    expect(environmentCard('production')).toHaveTextContent('Healthy');
    expect(environmentCard('production')).toHaveTextContent('Promotion: Manual');
  });

  it('says that an environment of unknown state is unknown, and one that does not answer is down', async () => {
    await openDelivery(LEDGER);
    expect(environmentCard('staging')).toHaveTextContent('Unknown');
    expect(environmentCard('production')).toHaveTextContent('Down');
    expect(within(environmentCard('staging')).getByRole('img', { name: 'Unknown' })).toBeInTheDocument();
    expect(within(environmentCard('production')).getByRole('img', { name: 'Down' })).toBeInTheDocument();
  });

  it('marks production as production and no other environment', async () => {
    await openDelivery();
    expect(within(environmentCard('production')).getByText('Production')).toBeInTheDocument();
    expect(within(environmentCard('staging')).queryByText('Production')).not.toBeInTheDocument();
    expect(within(environmentCard('development')).queryByText('Production')).not.toBeInTheDocument();
  });

  it('links each environment to its workflow, in a new tab', async () => {
    await openDelivery();
    const link = within(environmentCard('staging')).getByRole('link', { name: 'Open the workflow of staging' });
    expect(link).toHaveAttribute('href', 'https://github.example.com/example-org/storefront/actions/workflows/deploy-staging.yml');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('offers no workflow link to an environment that names none', async () => {
    await openDelivery(LEDGER);
    expect(within(environmentCard('production')).queryByRole('link', { name: /Open the workflow/ })).not.toBeInTheDocument();
  });

  it('names the project in the description of the page', async () => {
    await openDelivery(LEDGER);
    expect(screen.getByText('Environments, health checks and workflow runs of Ledger.')).toBeInTheDocument();
  });

  it('says that the project declares no environment', async () => {
    const snapshot = mapProject(fixtureSnapshot(), STOREFRONT, (project) => ({ ...project, environments: [] }));
    await openDelivery(STOREFRONT, { snapshot });
    expect(screen.getByText('This project declares no environment.')).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
});

describe('DeliveryView deployments', () => {
  it('shows what is currently deployed: version, ref, commit, outcome, author and when', async () => {
    await openDelivery();
    const current = within(environmentCard('development')).getByText('Currently deployed').closest('div');
    expect(current).toHaveTextContent('db98a40');
    expect(current).toHaveTextContent('Succeeded');
    expect(current).toHaveTextContent('Ref main');
    expect(current).toHaveTextContent('Commit db98a40');
    expect(current).toHaveTextContent('Deployed 48 min. ago by github-actions[bot]');
  });

  it('gives the exact time of a deployment when the age is hovered', async () => {
    await openDelivery();
    const current = within(environmentCard('production')).getByText('Currently deployed').closest('div');
    expect(within(current as HTMLElement).getByText('2 days ago')).toHaveAttribute('title', 'October 10, 2026 at 10:00:00 AM UTC');
  });

  it('links the deployment to the workflow run that made it, in a new tab', async () => {
    await openDelivery();
    const link = within(environmentCard('production')).getAllByRole('link', { name: 'Open the workflow run that deployed 1.8.0' })[0];
    expect(link).toHaveAttribute('href', 'https://github.example.com/example-org/storefront/actions/runs/9111420685');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('lists the history, newest first, with the current deployment marked', async () => {
    await openDelivery();
    const table = within(environmentCard('development')).getByRole('table', { name: 'Deployment history of development' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toHaveTextContent('In progress');
    expect(rows[1]).toHaveTextContent('db98a40');
    expect(rows[1]).toHaveTextContent('Current');
    expect(within(table).getAllByText('Current')).toHaveLength(1);
    expect(within(table).getAllByText('Failed')).toHaveLength(1);
  });

  it('shows the version of each release of an environment deployed from tags', async () => {
    await openDelivery();
    const table = within(environmentCard('staging')).getByRole('table', { name: 'Deployment history of staging' });
    expect(within(table).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual(['1.8.2Current', '1.8.1', '1.8.1', '1.8.0', '1.7.0', '1.6.1']);
  });

  it('says when the deployments were read, without a warning when the reading is fresh', async () => {
    await openDelivery();
    const development = environmentCard('development');
    expect(within(development).getByText(/^Read 2 min/)).toBeInTheDocument();
    expect(within(development).queryByText('Stale')).not.toBeInTheDocument();
  });

  it('keeps the version it read earlier, marks it stale and spells out why the latest read failed', async () => {
    await openDelivery();
    const deployments = panelOf(environmentCard('staging'), 'Deployments');
    expect(within(deployments).getByText('Stale')).toBeInTheDocument();
    expect(within(deployments).getByText('The last read failed (GitHub API request failed: 502 Bad Gateway). This is the value read 40 min. ago.')).toBeInTheDocument();
    expect(within(deployments).getByText('Currently deployed').closest('div')).toHaveTextContent('1.8.2');
  });

  it('says that no deployment source is configured, which is not the same as no deployment yet', async () => {
    await openDelivery(LEDGER);
    const staging = environmentCard('staging');
    expect(within(staging).getByText('No deployment source configured')).toBeInTheDocument();
    expect(within(staging).queryByText('No deployment yet')).not.toBeInTheDocument();
    expect(within(staging).queryByRole('table')).not.toBeInTheDocument();
  });

  it('says that nothing was deployed yet when the source holds no deployment', async () => {
    await openDelivery(LEDGER);
    const production = environmentCard('production');
    expect(within(production).getByText('No deployment yet')).toBeInTheDocument();
    expect(within(production).queryByText('No deployment source configured')).not.toBeInTheDocument();
    expect(within(production).getByText(/^Read 6 min/)).toBeInTheDocument();
    expect(within(production).queryByRole('table', { name: /Deployment history/ })).not.toBeInTheDocument();
  });

  it('says that the deployments were never read', async () => {
    const snapshot = withEnvironment(STOREFRONT, 'staging', (environment) => ({ ...environment, deployments: { value: null, readAt: null, error: null } }));
    await openDelivery(STOREFRONT, { snapshot });
    expect(within(environmentCard('staging')).getByText('Deployments not read yet')).toBeInTheDocument();
  });

  it('says that the read failed when nothing was kept, and why', async () => {
    const snapshot = withEnvironment(STOREFRONT, 'staging', (environment) => ({ ...environment, deployments: { value: null, readAt: null, error: 'GitHub API request failed: 401 Unauthorized' } }));
    await openDelivery(STOREFRONT, { snapshot });
    const staging = environmentCard('staging');
    expect(within(staging).getByText('Could not be read')).toBeInTheDocument();
    expect(within(staging).getByText('GitHub API request failed: 401 Unauthorized')).toBeInTheDocument();
    expect(within(staging).queryByText('Deployments not read yet')).not.toBeInTheDocument();
  });

  it('says that no deployment has succeeded when the history holds only failures, and still lists them', async () => {
    const failed: Deployment = { id: '77', version: 'abc1234', ref: 'main', sha: 'abc1234'.padEnd(40, '0'), deployedAt: clock.minutesAgo(30), actor: 'amorgan', outcome: 'failure', workflowUrl: null, changes: null };
    const snapshot = withEnvironment(STOREFRONT, 'staging', (environment) => ({ ...environment, deployments: { value: { current: null, history: [failed], pending: null }, readAt: clock.minutesAgo(2), error: null } }));
    await openDelivery(STOREFRONT, { snapshot });
    const staging = environmentCard('staging');
    expect(within(staging).getByText('No deployment has succeeded yet')).toBeInTheDocument();
    expect(within(staging).queryByText('Currently deployed')).not.toBeInTheDocument();
    expect(within(within(staging).getByRole('table', { name: 'Deployment history of staging' })).getAllByRole('row')).toHaveLength(2);
  });

  it('offers no link for a deployment the forge gave no workflow run for', async () => {
    const withoutRun: Deployment = { id: '78', version: '2.0.0', ref: '2.0.0', sha: 'f'.repeat(40), deployedAt: clock.minutesAgo(30), actor: 'unknown', outcome: 'success', workflowUrl: null, changes: null };
    const snapshot = withEnvironment(STOREFRONT, 'staging', (environment) => ({ ...environment, deployments: { value: { current: withoutRun, history: [withoutRun], pending: null }, readAt: clock.minutesAgo(2), error: null } }));
    await openDelivery(STOREFRONT, { snapshot });
    expect(within(environmentCard('staging')).queryByRole('link', { name: /Open the workflow run/ })).not.toBeInTheDocument();
  });
});

describe('DeliveryView deployments started by nobody the forge names', () => {
  it('says that the forge does not report who started a deployment of the history, and names the others', async () => {
    await openDelivery();
    const table = within(environmentCard('staging')).getByRole('table', { name: 'Deployment history of staging' });
    const rows = within(table).getAllByRole('row').slice(1);
    const unreported = rows.filter((row) => within(row).queryByText('Not reported by the forge') !== null);
    expect(unreported).toHaveLength(1);
    expect(unreported[0]).toHaveTextContent('1.6.1');
    expect(rows.filter((row) => !unreported.includes(row)).every((row) => within(row).queryByText('amorgan') !== null)).toBe(true);
  });

  it('says that the forge does not say who started the deployment that runs now, instead of naming nobody', async () => {
    const snapshot = withCurrentDeployment(STOREFRONT, 'staging', (deployment) => ({ ...deployment, actor: null }));
    await openDelivery(STOREFRONT, { snapshot });
    const deployments = panelOf(environmentCard('staging'), 'Deployments');
    const current = within(deployments).getByText('Currently deployed').closest('div');
    expect(current).toHaveTextContent('Deployed 22 hr. ago; the forge does not say by whom');
    expect(current).not.toHaveTextContent('Deployed 22 hr. ago by');
    expect(current).toHaveTextContent('1.8.2');
  });

  it('still offers to redeploy a version whose author the forge does not report', async () => {
    const snapshot = withCurrentDeployment(STOREFRONT, 'staging', (deployment) => ({ ...deployment, actor: null }));
    await openDelivery(STOREFRONT, { snapshot });
    expect(within(environmentCard('staging')).getByRole('button', { name: 'Redeploy staging' })).toBeEnabled();
  });
});

describe('DeliveryView in French', () => {
  it('writes the page, the states and the buttons in French', async () => {
    await openDelivery(STOREFRONT, { locale: 'fr' });
    expect(screen.getByRole('region', { name: 'Environnements' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Exécutions de workflows' })).toBeInTheDocument();
    const development = environmentCard('development');
    expect(development).toHaveTextContent('Déploiement en cours');
    expect(development).toHaveTextContent('Promotion : Automatique');
    expect(development).toHaveTextContent('Déployé il y a 48 min par github-actions[bot]');
    expect(within(development).getByRole('button', { name: 'Redéployer development' })).toBeInTheDocument();
    expect(within(development).getByRole('button', { name: 'Vérifier la santé de development' })).toBeInTheDocument();
    expect(within(panelOf(environmentCard('staging'), 'Déploiements')).getByText('Périmé')).toBeInTheDocument();
    expect(environmentCard('production')).toHaveTextContent('L’usine ne déploie jamais en production : l’opérateur lance le workflow de production.');
  });

  it('writes a deployment without a known author in French', async () => {
    const snapshot = withCurrentDeployment(STOREFRONT, 'staging', (deployment) => ({ ...deployment, actor: null }));
    await openDelivery(STOREFRONT, { locale: 'fr', snapshot });
    const deployments = panelOf(environmentCard('staging'), 'Déploiements');
    expect(within(deployments).getByText('Déployé actuellement').closest('div')).toHaveTextContent('Déployé il y a 22 h ; la forge n’indique pas par qui');
    expect(within(deployments).getAllByText('Non communiqué par la forge').length).toBeGreaterThan(1);
  });

  it('writes the empty states of a project without deployment source in French', async () => {
    await openDelivery(LEDGER, { locale: 'fr' });
    expect(within(environmentCard('staging')).getByText('Aucune source de déploiement configurée')).toBeInTheDocument();
    expect(within(environmentCard('staging')).getByText('Aucun contrôle de santé configuré')).toBeInTheDocument();
    expect(within(environmentCard('production')).getByText('Aucun déploiement pour l’instant')).toBeInTheDocument();
    expect(screen.getByText('La forge de ce projet n’a pas d’exécutions de workflows')).toBeInTheDocument();
  });
});
