import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { KnowledgeSourceView } from '../../contract/index.ts';
import { mapProject } from '../../test/fixtures/mutate.ts';
import { LEDGER_ID, STOREFRONT_ID } from '../../test/fixtures/project-ids.ts';
import { fixtureClock } from '../../test/fixtures/time.ts';
import { fixtureSnapshot, renderRoute, TEST_NOW } from '../../test/render.tsx';

const DESIGN_SYSTEM = '../storefront-design-system';
const KEPT_ERROR = 'git fetch failed: could not resolve host registry.invalid';

const { minutesAgo } = fixtureClock(TEST_NOW);
const knowledgePath = (project: string) => `/projects/${project}/knowledge`;
const source = (location: string) => screen.getByRole('region', { name: location });
const tableOf = (location: string) => within(source(location)).getByRole('table', { name: `Documents of ${location}` });
const filterBox = () => screen.getByRole('searchbox', { name: 'Filter the documents' });

async function openKnowledge(project: string = STOREFRONT_ID, options: Parameters<typeof renderRoute>[1] = {}) {
  const view = await renderRoute(knowledgePath(project), options);
  await screen.findByRole('heading', { level: 1, name: options.locale === 'fr' ? 'Connaissances' : 'Knowledge' });
  return view;
}

function withSources(project: string, update: (sources: readonly KnowledgeSourceView[]) => readonly KnowledgeSourceView[]) {
  return mapProject(fixtureSnapshot(), project, (current) => ({ ...current, knowledge: [...update(current.knowledge)] }));
}

describe('KnowledgeView sources', () => {
  it('has one section per source of the project, named by its location, with the kind of the source', async () => {
    await openKnowledge();
    expect(within(source('docs/')).getByText('Folder')).toBeInTheDocument();
    expect(within(source(DESIGN_SYSTEM)).getByText('Repository')).toBeInTheDocument();
    expect(within(source('adr/')).getByText('Folder')).toBeInTheDocument();
    expect(screen.getAllByRole('region')).toHaveLength(3);
  });

  it('introduces the page and totals the documents, the sources and the sources that were not read', async () => {
    await openKnowledge();
    expect(screen.getByText('The documents given to the agents as context, one section per source.')).toBeInTheDocument();
    expect(screen.getByText('6 documents · 3 sources · 1 source not read')).toBeInTheDocument();
  });

  it('lists the documents of a source read with their title, their path and their size', async () => {
    await openKnowledge();
    expect(within(tableOf('docs/')).getAllByRole('columnheader').map((heading) => heading.textContent)).toEqual(['Title', 'Path', 'Size']);
    const rows = within(tableOf('docs/')).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent))).toEqual([
      ['Local development setup', 'docs/development/local-setup.md', '1.5 kB'],
      ['Orders and their statuses', 'docs/architecture/orders.md', '5.2 kB'],
      ['Promo code rules', 'docs/product/promo-codes.md', '3.1 kB'],
      ['Delivery estimates', 'docs/product/delivery.md', '2.8 kB'],
    ]);
  });

  it('counts the documents of a source and says when it was read', async () => {
    await openKnowledge();
    expect(within(source('docs/')).getByText('4 documents')).toBeInTheDocument();
    expect(within(source('docs/')).getByText(/^Read 5 min/)).toHaveAttribute('datetime', minutesAgo(5));
    expect(within(source('docs/')).queryByText('Stale')).not.toBeInTheDocument();
  });

  it('keeps showing the documents a failed read left, marks them stale and spells out the error', async () => {
    await openKnowledge();
    const designSystem = source(DESIGN_SYSTEM);
    expect(within(designSystem).getByText('Stale')).toBeInTheDocument();
    expect(within(designSystem).getByText(/^Read 2 hr/)).toHaveAttribute('datetime', minutesAgo(120));
    expect(within(designSystem).getByRole('note')).toHaveTextContent(`The last read failed (${KEPT_ERROR}). This is the value read 2 hr. ago.`);
    expect(within(tableOf(DESIGN_SYSTEM)).getByText('Forms and error messages')).toBeInTheDocument();
    expect(within(tableOf(DESIGN_SYSTEM)).getByText('4.4 kB')).toBeInTheDocument();
  });

  it('says that a source was never read, and offers no table', async () => {
    await openKnowledge();
    expect(within(source('adr/')).getByText('This source has not been read yet')).toBeInTheDocument();
    expect(within(source('adr/')).queryByRole('table')).not.toBeInTheDocument();
  });

  it('says that a source could not be read, and why, when nothing was kept', async () => {
    const snapshot = withSources(STOREFRONT_ID, (sources) => sources.map((entry) => (entry.location === 'adr/' ? { ...entry, documents: { value: null, readAt: null, error: 'adr/ is not a directory' } } : entry)));
    await renderRoute(knowledgePath(STOREFRONT_ID), { snapshot });
    await screen.findByRole('heading', { level: 1, name: 'Knowledge' });
    expect(within(source('adr/')).getByText('Could not be read')).toBeInTheDocument();
    expect(within(source('adr/')).getByText('adr/ is not a directory')).toBeInTheDocument();
    expect(within(source('adr/')).queryByRole('table')).not.toBeInTheDocument();
  });

  it('says that a source read successfully holds no document', async () => {
    const snapshot = withSources(STOREFRONT_ID, (sources) => sources.map((entry) => (entry.location === 'adr/' ? { ...entry, documents: { value: [], readAt: minutesAgo(3), error: null } } : entry)));
    await renderRoute(knowledgePath(STOREFRONT_ID), { snapshot });
    await screen.findByRole('heading', { level: 1, name: 'Knowledge' });
    expect(within(source('adr/')).getByText('This source holds no document')).toBeInTheDocument();
    expect(within(source('adr/')).getByText('0 documents')).toBeInTheDocument();
    expect(within(source('adr/')).getByText(/^Read 3 min/)).toBeInTheDocument();
    expect(screen.getByText('6 documents · 3 sources')).toBeInTheDocument();
  });

  it('shows the sources of the project of the address only', async () => {
    await openKnowledge(LEDGER_ID);
    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(within(tableOf('docs/')).getByText('Invoice lifecycle')).toBeInTheDocument();
    expect(within(tableOf('docs/')).queryByText('Local development setup')).not.toBeInTheDocument();
    expect(screen.getByText('2 documents · 1 source')).toBeInTheDocument();
  });

  it('says that the project has no knowledge source rather than showing an empty page', async () => {
    await renderRoute(knowledgePath(STOREFRONT_ID), { snapshot: withSources(STOREFRONT_ID, () => []) });
    expect(await screen.findByText('No knowledge source is configured')).toBeInTheDocument();
    expect(screen.getByText('This project gives the agents no extra document to read.')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('shows two sources of the same location apart', async () => {
    const snapshot = withSources(STOREFRONT_ID, (sources) => [...sources, { kind: 'repository', location: 'docs/', documents: { value: [{ path: 'a.md', title: 'Second docs', bytes: 10 }], readAt: minutesAgo(1), error: null } }]);
    await renderRoute(knowledgePath(STOREFRONT_ID), { snapshot });
    await screen.findByRole('heading', { level: 1, name: 'Knowledge' });
    expect(screen.getAllByRole('region', { name: 'docs/' })).toHaveLength(2);
    expect(screen.getByText('Second docs')).toBeInTheDocument();
  });
});

describe('KnowledgeView filter', () => {
  it('offers a search field over the titles and the paths', async () => {
    await openKnowledge();
    expect(filterBox()).toHaveAttribute('placeholder', 'Filter by title or path…');
    expect(filterBox()).toHaveValue('');
  });

  it('keeps the documents whose title holds what was typed, whatever the case', async () => {
    const view = await openKnowledge();
    await view.user.type(filterBox(), 'PROMO');
    expect(within(tableOf('docs/')).getAllByRole('row')).toHaveLength(2);
    expect(within(tableOf('docs/')).getByText('Promo code rules')).toBeInTheDocument();
    expect(within(tableOf('docs/')).queryByText('Orders and their statuses')).not.toBeInTheDocument();
  });

  it('keeps the documents whose path holds what was typed, in any source', async () => {
    const view = await openKnowledge();
    await view.user.type(filterBox(), 'forms.md');
    expect(within(tableOf(DESIGN_SYSTEM)).getByText('Forms and error messages')).toBeInTheDocument();
    expect(within(tableOf(DESIGN_SYSTEM)).queryByText('Design system overview')).not.toBeInTheDocument();
  });

  it('ignores the blanks around what was typed', async () => {
    const view = await openKnowledge();
    await view.user.type(filterBox(), '  orders ');
    expect(within(tableOf('docs/')).getByText('Orders and their statuses')).toBeInTheDocument();
    expect(within(tableOf('docs/')).getAllByRole('row')).toHaveLength(2);
  });

  it('says how many of the documents match, in the page and in each source', async () => {
    const view = await openKnowledge();
    await view.user.type(filterBox(), 'promo');
    expect(screen.getByText('Showing 1 of 6 documents · 3 sources · 1 source not read')).toBeInTheDocument();
    expect(within(source('docs/')).getByText('Showing 1 of 4 documents')).toBeInTheDocument();
  });

  it('says in a source where nothing matches that nothing matches, and keeps its reading', async () => {
    const view = await openKnowledge();
    await view.user.type(filterBox(), 'promo');
    const designSystem = source(DESIGN_SYSTEM);
    expect(within(designSystem).getByText('No document of this source matches “promo”')).toBeInTheDocument();
    expect(within(designSystem).queryByRole('table')).not.toBeInTheDocument();
    expect(within(designSystem).getByText('Stale')).toBeInTheDocument();
    expect(within(designSystem).getByRole('note')).toHaveTextContent('The last read failed');
  });

  it('leaves a source that was never read as it is while the filter runs', async () => {
    const view = await openKnowledge();
    await view.user.type(filterBox(), 'promo');
    expect(within(source('adr/')).getByText('This source has not been read yet')).toBeInTheDocument();
    expect(within(source('adr/')).queryByText(/No document of this source matches/)).not.toBeInTheDocument();
  });

  it('says so in every source when nothing matches anywhere', async () => {
    const view = await openKnowledge();
    await view.user.type(filterBox(), 'zzz');
    expect(screen.getByText('Showing 0 of 6 documents · 3 sources · 1 source not read')).toBeInTheDocument();
    expect(screen.getAllByText('No document of this source matches “zzz”')).toHaveLength(2);
  });

  it('does not blame the filter for a source that holds no document', async () => {
    const snapshot = withSources(STOREFRONT_ID, (sources) => sources.map((entry) => (entry.location === 'adr/' ? { ...entry, documents: { value: [], readAt: minutesAgo(3), error: null } } : entry)));
    const view = await renderRoute(knowledgePath(STOREFRONT_ID), { snapshot });
    await view.user.type(await screen.findByRole('searchbox', { name: 'Filter the documents' }), 'promo');
    expect(within(source('adr/')).getByText('This source holds no document')).toBeInTheDocument();
  });

  it('shows everything again once the filter is cleared', async () => {
    const view = await openKnowledge();
    await view.user.type(filterBox(), 'promo');
    await view.user.clear(filterBox());
    expect(within(tableOf('docs/')).getAllByRole('row')).toHaveLength(5);
    expect(screen.getByText('6 documents · 3 sources · 1 source not read')).toBeInTheDocument();
  });

  it('counts one document in the singular', async () => {
    const view = await openKnowledge(LEDGER_ID);
    await view.user.type(filterBox(), 'payments');
    expect(screen.getByText('Showing 1 of 2 documents · 1 source')).toBeInTheDocument();
    expect(within(source('docs/')).getByText('Showing 1 of 2 documents')).toBeInTheDocument();
  });
});

describe('KnowledgeView in French', () => {
  it('words the page, the kinds of source and the readings in French', async () => {
    await openKnowledge(STOREFRONT_ID, { locale: 'fr' });
    expect(screen.getByText('6 documents · 3 sources · 1 source non relevée')).toBeInTheDocument();
    expect(within(source('docs/')).getByText('Dossier')).toBeInTheDocument();
    expect(within(source(DESIGN_SYSTEM)).getByText('Dépôt')).toBeInTheDocument();
    expect(within(source(DESIGN_SYSTEM)).getByText('Périmé')).toBeInTheDocument();
    expect(within(source('adr/')).getByText('Cette source n’a pas encore été relevée')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Documents de docs/' })).getAllByRole('columnheader').map((heading) => heading.textContent)).toEqual(['Titre', 'Chemin', 'Taille']);
    expect(within(source('docs/')).getByText('1,5 ko')).toBeInTheDocument();
  });

  it('words the filter and its results in French, with the plural of a count of one or zero', async () => {
    const view = await openKnowledge(STOREFRONT_ID, { locale: 'fr' });
    await view.user.type(screen.getByRole('searchbox', { name: 'Filtrer les documents' }), 'promo');
    expect(screen.getByText('1 sur 6 documents affichés · 3 sources · 1 source non relevée')).toBeInTheDocument();
    expect(within(source(DESIGN_SYSTEM)).getByText('Aucun document de cette source ne correspond à « promo »')).toBeInTheDocument();
    await view.user.clear(screen.getByRole('searchbox', { name: 'Filtrer les documents' }));
    await view.user.type(screen.getByRole('searchbox', { name: 'Filtrer les documents' }), 'zzz');
    expect(screen.getByText('0 sur 6 documents affichés · 3 sources · 1 source non relevée')).toBeInTheDocument();
  });

  it('counts a single document and a single source in the singular', async () => {
    const snapshot = withSources(LEDGER_ID, (sources) => sources.map((entry) => ({ ...entry, documents: { ...entry.documents, value: entry.documents.value?.slice(0, 1) ?? null } })));
    await renderRoute(knowledgePath(LEDGER_ID), { locale: 'fr', snapshot });
    expect(await screen.findByText('1 document · 1 source')).toBeInTheDocument();
  });

  it('says in French that the project has no knowledge source', async () => {
    await renderRoute(knowledgePath(STOREFRONT_ID), { locale: 'fr', snapshot: withSources(STOREFRONT_ID, () => []) });
    expect(await screen.findByText('Aucune source de connaissances n’est configurée')).toBeInTheDocument();
  });
});
