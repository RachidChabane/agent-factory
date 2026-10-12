import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectCommand } from '../../test/commands.ts';
import { clock, environmentCard, LEDGER, openDelivery, STOREFRONT, withEnvironment } from './delivery-test-support.ts';

const redeployButton = (environment: string) => within(environmentCard(environment)).getByRole('button', { name: `Redeploy ${environment}` });
const queryRedeployButton = (environment: string) => within(environmentCard(environment)).queryByRole('button', { name: `Redeploy ${environment}` });

describe('deployment.redeploy: when it is offered', () => {
  it('is offered on the environments that declare a redeploy workflow and have a version deployed', async () => {
    await openDelivery();
    expect(redeployButton('development')).toBeInTheDocument();
    expect(redeployButton('staging')).toBeInTheDocument();
  });

  it('is offered on a version read earlier, even though the latest read of the deployments failed', async () => {
    await openDelivery();
    expect(within(environmentCard('staging')).getByText(/The last read failed/)).toBeInTheDocument();
    expect(redeployButton('staging')).toBeEnabled();
  });

  it('is never offered on production, which says why and points to its workflow', async () => {
    await openDelivery();
    const production = environmentCard('production');
    expect(queryRedeployButton('production')).not.toBeInTheDocument();
    expect(within(production).getByText('The factory never deploys production: the operator runs the production workflow.')).toBeInTheDocument();
    const link = within(production).getByRole('link', { name: 'Open the workflow of production' });
    expect(link).toHaveAttribute('href', 'https://github.example.com/example-org/storefront/actions/workflows/deploy-production.yml');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('is never offered on production even if the project declared the environment redeployable', async () => {
    const snapshot = withEnvironment(STOREFRONT, 'production', (environment) => ({ ...environment, redeployable: true }));
    await openDelivery(STOREFRONT, { snapshot });
    expect(queryRedeployButton('production')).not.toBeInTheDocument();
    expect(within(environmentCard('production')).getByText('The factory never deploys production: the operator runs the production workflow.')).toBeInTheDocument();
  });

  it('is not offered where no redeploy workflow is declared, which says so', async () => {
    await openDelivery(LEDGER);
    expect(queryRedeployButton('staging')).not.toBeInTheDocument();
    expect(within(environmentCard('staging')).getByText('No redeploy workflow is declared for this environment.')).toBeInTheDocument();
  });

  it.each([
    ['nothing was deployed yet', { value: { current: null, history: [] }, readAt: clock.minutesAgo(2), error: null }],
    ['the deployments were never read', { value: null, readAt: null, error: null }],
    ['there is no deployment source', null],
  ])('is not offered when %s, which says there is nothing to redeploy', async (_, deployments) => {
    const snapshot = withEnvironment(STOREFRONT, 'staging', (environment) => ({ ...environment, deployments }));
    await openDelivery(STOREFRONT, { snapshot });
    expect(queryRedeployButton('staging')).not.toBeInTheDocument();
    expect(within(environmentCard('staging')).getByText('No deployed version is known, so there is nothing to redeploy.')).toBeInTheDocument();
  });

  it('is not offered on an environment the project does not declare redeployable', async () => {
    const snapshot = withEnvironment(STOREFRONT, 'staging', (environment) => ({ ...environment, redeployable: false }));
    await openDelivery(STOREFRONT, { snapshot });
    expect(queryRedeployButton('staging')).not.toBeInTheDocument();
  });
});

describe('deployment.redeploy: the confirmation', () => {
  async function openRedeploy(environment = 'staging', options: Parameters<typeof openDelivery>[1] = {}) {
    const view = await openDelivery(STOREFRONT, options);
    await view.user.click(redeployButton(environment));
    const dialog = await screen.findByRole('dialog', { name: `Redeploy ${environment}?` });
    return { view, dialog, typed: within(dialog).getByLabelText('Deployed version'), confirm: within(dialog).getByRole('button', { name: /^Redeploy / }) };
  }

  it('names the environment and the deployed version, and sends nothing yet', async () => {
    const { view, dialog, confirm } = await openRedeploy('staging');
    expect(dialog).toHaveTextContent('The deployment workflow of staging runs again with the version that is currently deployed, 1.8.2.');
    expect(confirm).toHaveAccessibleName('Redeploy 1.8.2');
    expect(view.transport.commands).toEqual([]);
  });

  it('keeps the confirmation disabled until the deployed version is typed', async () => {
    const { view, typed, confirm } = await openRedeploy('staging');
    expect(confirm).toBeDisabled();
    expect(within(screen.getByRole('dialog')).getByText('Type 1.8.2 to confirm the redeploy.')).toBeInTheDocument();
    await view.user.type(typed, '1.8.2');
    expect(confirm).toBeEnabled();
  });

  it('says the version is not the deployed one, and keeps the confirmation disabled, while it differs', async () => {
    const { view, dialog, typed, confirm } = await openRedeploy('staging');
    await view.user.type(typed, '1.8');
    expect(within(dialog).getByText('This is not the version deployed on staging.')).toBeInTheDocument();
    expect(typed).toBeInvalid();
    expect(confirm).toBeDisabled();
    await view.user.click(confirm);
    expect(view.transport.commands).toEqual([]);
  });

  it('says nothing is wrong before anything is typed', async () => {
    const { dialog } = await openRedeploy('staging');
    expect(within(dialog).queryByText('This is not the version deployed on staging.')).not.toBeInTheDocument();
  });

  it.each(['1.8.2.', 'v1.8.2', '1.8.20', '1.8.1', '1,8,2'])('refuses %j', async (text) => {
    const { view, typed, confirm } = await openRedeploy('staging');
    await view.user.type(typed, text);
    expect(confirm).toBeDisabled();
  });

  it('is case sensitive, since a version is', async () => {
    const { view, typed, confirm } = await openRedeploy('development');
    await view.user.type(typed, 'DB98A40');
    expect(confirm).toBeDisabled();
    await view.user.clear(typed);
    await view.user.type(typed, 'db98a40');
    expect(confirm).toBeEnabled();
  });

  it('sends the project, the environment and the version that was typed', async () => {
    const { view, typed, confirm } = await openRedeploy('staging');
    await view.user.type(typed, '1.8.2');
    await view.user.click(confirm);
    await expectCommand(view.transport, 'deployment.redeploy', { project: STOREFRONT, environment: 'staging', confirmVersion: '1.8.2' });
  });

  it('redeploys a version named by a short commit identifier on an environment deployed from a branch', async () => {
    const { view, dialog, typed, confirm } = await openRedeploy('development');
    expect(dialog).toHaveTextContent('with the version that is currently deployed, db98a40.');
    await view.user.type(typed, 'db98a40');
    await view.user.click(confirm);
    await expectCommand(view.transport, 'deployment.redeploy', { project: STOREFRONT, environment: 'development', confirmVersion: 'db98a40' });
  });

  it('accepts the version with spaces around it and sends it trimmed', async () => {
    const { view, typed, confirm } = await openRedeploy('staging');
    await view.user.type(typed, '  1.8.2  ');
    expect(confirm).toBeEnabled();
    await view.user.click(confirm);
    await expectCommand(view.transport, 'deployment.redeploy', { project: STOREFRONT, environment: 'staging', confirmVersion: '1.8.2' });
  });

  it('closes once the factory accepted the redeploy, and shows what it did', async () => {
    const { view, typed, confirm } = await openRedeploy('staging');
    view.transport.effects.set('deployment.redeploy', 'deploy-staging.yml dispatched on 1.8.2 to redeploy 1.8.2 to staging');
    await view.user.type(typed, '1.8.2');
    await view.user.click(confirm);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(screen.getByRole('status')).getByText('deploy-staging.yml dispatched on 1.8.2 to redeploy 1.8.2 to staging')).toBeInTheDocument();
  });

  it('stays open and shows the refusal of the factory', async () => {
    const { view, typed, confirm } = await openRedeploy('staging');
    view.transport.commandFailure = 'The redeploy of staging is refused: a deployment to staging is in progress';
    await view.user.type(typed, '1.8.2');
    await view.user.click(confirm);
    expect(await within(await screen.findByRole('alert')).findByText('The redeploy of staging is refused: a deployment to staging is in progress')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Redeploy staging?' })).toBeInTheDocument();
  });

  it('disables the confirmation while the redeploy is in flight', async () => {
    const { view, typed, confirm } = await openRedeploy('staging');
    await view.user.type(typed, '1.8.2');
    const release = view.transport.holdCommands();
    await view.user.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(view.transport.commands).toHaveLength(1);
  });

  it('sends nothing when the operator cancels, and starts from an empty field the next time', async () => {
    const { view, dialog, typed } = await openRedeploy('staging');
    await view.user.type(typed, '1.8.2');
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(view.transport.commands).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await view.user.click(redeployButton('staging'));
    const reopened = await screen.findByRole('dialog', { name: 'Redeploy staging?' });
    expect(within(reopened).getByLabelText('Deployed version')).toHaveValue('');
    expect(within(reopened).getByRole('button', { name: 'Redeploy 1.8.2' })).toBeDisabled();
  });

  it('says how old the version it asks for is, and that the latest read failed', async () => {
    const { dialog } = await openRedeploy('staging');
    expect(within(dialog).getByText('Stale')).toBeInTheDocument();
    expect(within(dialog).getByText('The last read failed (GitHub API request failed: 502 Bad Gateway). This is the value read 40 min. ago.')).toBeInTheDocument();
  });

  it('warns that the factory refuses a redeploy while a deployment is in progress', async () => {
    const { dialog } = await openRedeploy('development');
    expect(within(dialog).getByText('A deployment is in progress on development. The factory refuses a redeploy until it ends.')).toBeInTheDocument();
  });

  it('does not warn when no deployment is in progress', async () => {
    const { dialog } = await openRedeploy('staging');
    expect(within(dialog).queryByText(/A deployment is in progress/)).not.toBeInTheDocument();
  });

  it('follows the version when a later reading changes it while the question is open', async () => {
    const { view, typed, confirm } = await openRedeploy('staging');
    await view.user.type(typed, '1.8.2');
    expect(confirm).toBeEnabled();
    const snapshot = withEnvironment(STOREFRONT, 'staging', (environment) => {
      const history = environment.deployments?.value;
      if (history === null || history === undefined || history.current === null) return environment;
      const next = { ...history.current, version: '1.9.0', ref: '1.9.0' };
      return { ...environment, deployments: { value: { current: next, history: [next, ...history.history] }, readAt: clock.minutesAgo(1), error: null } };
    });
    act(() => view.services.store.replaceSnapshot(snapshot));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Redeploy 1.9.0' })).toBeDisabled());
    expect(within(screen.getByRole('dialog')).getByText('This is not the version deployed on staging.')).toBeInTheDocument();
  });
});

describe('deployment.redeploy in French', () => {
  it('asks in French and sends the same command', async () => {
    const view = await openDelivery(STOREFRONT, { locale: 'fr' });
    await view.user.click(within(environmentCard('staging')).getByRole('button', { name: 'Redéployer staging' }));
    const dialog = await screen.findByRole('dialog', { name: 'Redéployer staging ?' });
    expect(dialog).toHaveTextContent('Le workflow de déploiement de staging est relancé avec la version déployée actuellement, 1.8.2.');
    const confirm = within(dialog).getByRole('button', { name: 'Redéployer 1.8.2' });
    expect(confirm).toBeDisabled();
    await view.user.type(within(dialog).getByLabelText('Version déployée'), '1.8');
    expect(within(dialog).getByText('Ce n’est pas la version déployée sur staging.')).toBeInTheDocument();
    await view.user.type(within(dialog).getByLabelText('Version déployée'), '.2');
    await view.user.click(confirm);
    await expectCommand(view.transport, 'deployment.redeploy', { project: STOREFRONT, environment: 'staging', confirmVersion: '1.8.2' });
  });
});
