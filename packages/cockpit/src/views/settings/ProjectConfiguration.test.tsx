import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mapProject } from '../../test/fixtures/mutate.ts';
import { fixtureSnapshot } from '../../test/render.tsx';
import { LEDGER, openProjectSettings, STOREFRONT, withProjectSettings } from './settings-test-support.ts';

const section = (name: string) => screen.getByRole('region', { name });

describe('ProjectSettingsView commands', () => {
  it('lists the setup commands with the line they run and the network they declare', async () => {
    await openProjectSettings();
    const setup = within(section('Setup commands')).getByRole('list', { name: 'Setup commands' });
    const [install, build] = within(setup).getAllByRole('listitem');
    expect(install).toHaveTextContent('install');
    expect(install).toHaveTextContent('pnpm install --frozen-lockfile');
    expect(install).toHaveTextContent('Network: downloads the packages from the private registry');
    expect(build).toHaveTextContent('pnpm --filter shared build');
    expect(build).toHaveTextContent('No network');
  });

  it('lists the gate commands before and after the acceptance checks, and when the gate gives up', async () => {
    await openProjectSettings();
    const gate = section('Gate commands');
    const before = within(gate).getByRole('group', { name: 'Before the acceptance checks' });
    const after = within(gate).getByRole('group', { name: 'After the acceptance checks' });
    const [lint, typecheck] = within(before).getAllByRole('listitem');
    const [unitTests, build] = within(after).getAllByRole('listitem');
    expect(lint).toHaveTextContent('lintpnpm lint');
    expect(typecheck).toHaveTextContent('typecheckpnpm typecheck');
    expect(unitTests).toHaveTextContent('unit-testspnpm test');
    expect(build).toHaveTextContent('buildpnpm build');
    expect(gate).toHaveTextContent('The gate times out after 30 min.');
  });

  it('says that a project declares no setup command and no gate command', async () => {
    const snapshot = withProjectSettings(STOREFRONT, (settings) => ({ ...settings, setup: [], gate: { ...settings.gate, beforeAcceptance: [], afterAcceptance: [] } }));
    await openProjectSettings(STOREFRONT, { snapshot });
    expect(screen.getByText('This project declares no setup command.')).toBeInTheDocument();
    expect(screen.getByText('No command runs before the acceptance checks.')).toBeInTheDocument();
    expect(screen.getByText('No command runs after the acceptance checks.')).toBeInTheDocument();
  });

  it('names the variables passed to the checks and says that their values stay on the machine', async () => {
    await openProjectSettings();
    const environment = section('Check environment');
    const names = within(within(environment).getByRole('list', { name: 'Check environment' })).getAllByRole('listitem');
    expect(names.map((item) => item.textContent)).toEqual(['NODE_ENV', 'CI', 'PLAYWRIGHT_BROWSERS_PATH', 'STOREFRONT_REGION']);
    expect(environment).toHaveTextContent('Only their names are shown: the values stay on the machine.');
  });

  it('says that no variable is passed to the checks', async () => {
    const snapshot = withProjectSettings(STOREFRONT, (settings) => ({ ...settings, environmentVariables: [] }));
    await openProjectSettings(STOREFRONT, { snapshot });
    expect(screen.getByText('No variable is passed to the check commands.')).toBeInTheDocument();
  });
});

describe('ProjectSettingsView conventions', () => {
  it('shows the labels, the branch prefix and the release model', async () => {
    await openProjectSettings();
    const conventions = section('Conventions');
    const value = (label: string) => within(conventions).getByText(label).closest('div')?.querySelector('dd')?.textContent;
    expect(value('Factory label')).toBe('factory');
    expect(value('Validated label')).toBe('spec:validated');
    expect(value('Audit label')).toBe('audit');
    expect(value('Kind label prefix')).toBe('kind:');
    expect(value('Branch prefix')).toBe('factory/');
    expect(value('Release model')).toBe('Release pull requests');
  });

  it.each([
    [LEDGER, 'Tags'],
    [STOREFRONT, 'Release pull requests'],
  ])('names the release model of %s', async (project, model) => {
    await openProjectSettings(project);
    expect(within(section('Conventions')).getByText(model)).toBeInTheDocument();
  });

  it('says that a project has no release model', async () => {
    const snapshot = withProjectSettings(STOREFRONT, (settings) => ({ ...settings, releaseModel: 'none' }));
    await openProjectSettings(STOREFRONT, { snapshot });
    expect(within(section('Conventions')).getByText('No release model')).toBeInTheDocument();
  });
});

describe('ProjectSettingsView automations', () => {
  it('lists the other automations with the branches and the authors they match', async () => {
    await openProjectSettings();
    const automations = section('Automations');
    const dependencies = within(automations).getByText('dependency-updates').closest('li');
    const docs = within(automations).getByText('docs-sync').closest('li');
    expect(dependencies).toHaveTextContent('dependency-updates');
    expect(dependencies).toHaveTextContent('dependency-bot/**');
    expect(dependencies).toHaveTextContent('dependency-bot[bot]');
    expect(docs).toHaveTextContent('docs-sync');
    expect(docs).toHaveTextContent('docs-sync/**');
  });

  it('says that an automation without author patterns matches any author', async () => {
    await openProjectSettings();
    const docs = within(section('Automations')).getByText('docs-sync').closest('li');
    expect(docs).toHaveTextContent('Any author');
    expect(docs).not.toHaveTextContent('Any branch');
  });

  it('says that an automation without branch patterns matches any branch', async () => {
    const snapshot = withProjectSettings(STOREFRONT, (settings) => ({ ...settings, automations: [{ name: 'dependency-updates', branches: [], authors: ['dependency-bot[bot]'] }] }));
    await openProjectSettings(STOREFRONT, { snapshot });
    expect(section('Automations')).toHaveTextContent('Any branch');
    expect(section('Automations')).not.toHaveTextContent('Any author');
  });

  it('says that an automation that names neither branch nor author matches no change', async () => {
    const snapshot = withProjectSettings(STOREFRONT, (settings) => ({ ...settings, automations: [{ name: 'idle', branches: [], authors: [] }] }));
    await openProjectSettings(STOREFRONT, { snapshot });
    expect(screen.getByText('It declares neither a branch nor an author, so it matches no change.')).toBeInTheDocument();
  });

  it('says that a project declares no other automation', async () => {
    await openProjectSettings(LEDGER);
    expect(screen.getByText('This project declares no other automation.')).toBeInTheDocument();
  });
});

describe('ProjectSettingsView issue types', () => {
  it('lists the types of the project with their forge label, proof and commit type', async () => {
    await openProjectSettings();
    const items = within(within(section('Issue types')).getByRole('list', { name: 'Issue types' })).getAllByRole('listitem');
    expect(items).toHaveLength(12);
    const ui = items.find((item) => within(item).queryByText('UI') !== null);
    expect(ui).toHaveTextContent('type:ui');
    expect(ui).toHaveTextContent('Fails on the base');
    expect(ui).toHaveTextContent('feat');
    expect(ui).toHaveTextContent('a browser journey');
  });

  it('writes the scope of a commit type that has one, and the proof of a type that needs none', async () => {
    await openProjectSettings();
    const items = within(within(section('Issue types')).getByRole('list', { name: 'Issue types' })).getAllByRole('listitem');
    const dependencies = items.find((item) => within(item).queryByText('Dependencies') !== null);
    expect(dependencies).toHaveTextContent('build(deps)');
    expect(dependencies).toHaveTextContent('No proof before');
  });

  it('lists only the types a project keeps', async () => {
    await openProjectSettings(LEDGER);
    expect(within(within(section('Issue types')).getByRole('list', { name: 'Issue types' })).getAllByRole('listitem')).toHaveLength(6);
  });

  it('shows the id of a type the cockpit has no name for, as it is', async () => {
    const snapshot = mapProject(fixtureSnapshot(), LEDGER, (project) => ({
      ...project,
      issueTypes: [{ id: 'migration', label: 'type:migration', proof: 'base-score', checks: 'a rehearsal of the migration', commitType: 'chore', commitScope: 'db' }],
    }));
    await openProjectSettings(LEDGER, { snapshot });
    const item = within(section('Issue types')).getByRole('listitem');
    expect(item).toHaveTextContent('migration');
    expect(item).toHaveTextContent('chore(db)');
    expect(item).toHaveTextContent('Base score');
  });

  it('says that a project declares no issue type', async () => {
    await openProjectSettings(LEDGER, { snapshot: mapProject(fixtureSnapshot(), LEDGER, (project) => ({ ...project, issueTypes: [] })) });
    expect(screen.getByText('This project declares no issue type.')).toBeInTheDocument();
  });
});
