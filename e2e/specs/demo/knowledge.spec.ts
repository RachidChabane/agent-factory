import type { Locator, Page } from '@playwright/test';
import type { KnowledgeDocument, KnowledgeSourceView } from '../../../packages/cockpit/src/contract/index.ts';
import { paths } from '../../../packages/cockpit/src/model/routes.ts';
import { ONE_LOOK, untilPageAgreesWithFactory } from '../../support/agreement.ts';
import { projectOf } from '../../support/api.ts';
import { openCockpit } from '../../support/cockpit.ts';
import { english } from '../../support/formats.ts';
import { firstOf } from '../../support/project-facts.ts';
import { LEDGER, STOREFRONT } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';

const KIND_WORDS: Readonly<Record<KnowledgeSourceView['kind'], string>> = { path: 'Folder', repository: 'Repository' };
const NO_MATCH_QUERY = 'nothing of the kind';

function sourceSection(page: Page, source: KnowledgeSourceView): Locator {
  return page.getByRole('region', { name: source.location, exact: true });
}

function plural(count: number, one: string, other: string): string {
  return `${count} ${count === 1 ? one : other}`;
}

/** The line under the title of the page, as the operator reads it. */
function summaryOf(sources: readonly KnowledgeSourceView[]): string {
  const documents = sources.flatMap((source) => source.documents.value ?? []).length;
  const unread = sources.filter((source) => source.documents.value === null).length;
  return [plural(documents, 'document', 'documents'), plural(sources.length, 'source', 'sources'), unread === 0 ? null : `${plural(unread, 'source', 'sources')} not read`].filter((part) => part !== null).join(' · ');
}

async function expectDocumentTable(section: Locator, source: KnowledgeSourceView, documents: readonly KnowledgeDocument[]): Promise<void> {
  const table = section.getByRole('table', { name: `Documents of ${source.location}` });
  await expect(table.getByRole('row')).toHaveCount(documents.length + 1);
  for (const document of documents) {
    const row = table.getByRole('row').filter({ hasText: document.path });
    await expect(row).toContainText(document.title);
    await expect(row).toContainText(english.bytes(document.bytes));
  }
}

async function expectSourceShown(page: Page, source: KnowledgeSourceView): Promise<void> {
  const section = sourceSection(page, source);
  const { value, readAt, error } = source.documents;
  await expect(section).toContainText(KIND_WORDS[source.kind], ONE_LOOK);
  if (value === null) {
    await expect(section).toContainText(error === null ? 'This source has not been read yet' : 'Could not be read', ONE_LOOK);
    if (error !== null) await expect(section).toContainText(error, ONE_LOOK);
    await expect(section.getByRole('table')).toHaveCount(0, ONE_LOOK);
    return;
  }
  await expect(section).toContainText(plural(value.length, 'document', 'documents'), ONE_LOOK);
  if (readAt !== null) await expect(section.getByRole('time')).toHaveAttribute('datetime', readAt, ONE_LOOK);
  await expect(section.getByRole('time')).toContainText('Read', ONE_LOOK);
  if (value.length > 0) await expectDocumentTable(section, source, value);
}

test.describe('the knowledge pages of the demonstration', () => {
  test('shows each source of a project with its kind and what the factory read from it', async ({ page, factory }) => {
    await openCockpit(page, factory, paths.knowledge(STOREFRONT));
    await expect(page.getByRole('heading', { level: 1, name: 'Knowledge' })).toBeVisible();
    await expect(page.getByText('The documents given to the agents as context, one section per source.')).toBeVisible();
    await untilPageAgreesWithFactory(async () => {
      const { knowledge } = projectOf(await factory.api.state(), STOREFRONT);
      expect(knowledge, 'the storefront gives its agents at least one source').not.toEqual([]);
      await expect(page.getByText(summaryOf(knowledge), { exact: true })).toBeVisible(ONE_LOOK);
      for (const source of knowledge) await expectSourceShown(page, source);
    });
  });

  test('says explicitly that a project gives its agents no knowledge source', async ({ page, factory }) => {
    expect(projectOf(await factory.api.state(), LEDGER).knowledge).toEqual([]);
    await openCockpit(page, factory, paths.knowledge(LEDGER));
    await expect(page.getByRole('heading', { level: 1, name: 'Knowledge' })).toBeVisible();
    await expect(page.getByText('No knowledge source is configured')).toBeVisible();
    await expect(page.getByText('This project gives the agents no extra document to read.')).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Filter the documents' })).toHaveCount(0);
  });

  test('lists the documents of a repository source that the factory read, with the time it read them', async ({ page, factory }) => {
    const { knowledge } = projectOf(await factory.api.state(), STOREFRONT);
    const repository = firstOf(
      knowledge.filter((source) => source.kind === 'repository'),
      'repository source of the storefront',
    );
    expect(repository.documents.error, `the factory could not read ${repository.location}`).toBeNull();
    expect(repository.documents.readAt, `the factory never read ${repository.location}`).not.toBeNull();
    expect(repository.documents.value ?? [], `the factory found no document in ${repository.location}`).not.toEqual([]);
    await openCockpit(page, factory, paths.knowledge(STOREFRONT));
    await expectSourceShown(page, repository);
    await expect(sourceSection(page, repository).getByText('Stale')).toHaveCount(0);
  });

  test('narrows the documents to the words typed and says when none matches', async ({ page, factory }) => {
    const { knowledge } = projectOf(await factory.api.state(), STOREFRONT);
    const documents = knowledge.flatMap((source) => source.documents.value ?? []);
    const sought = firstOf(documents, 'document the factory read for the storefront');
    await openCockpit(page, factory, paths.knowledge(STOREFRONT));
    const filter = page.getByRole('searchbox', { name: 'Filter the documents' });
    await filter.fill(sought.title);
    const matching = documents.filter((document) => document.title.toLowerCase().includes(sought.title.toLowerCase()) || document.path.toLowerCase().includes(sought.title.toLowerCase()));
    await expect(page.getByText(`Showing ${matching.length} of ${plural(documents.length, 'document', 'documents')}`).first()).toBeVisible();
    await expect(page.getByRole('table').getByRole('row').filter({ hasText: sought.path })).toHaveCount(1);
    await filter.fill(NO_MATCH_QUERY);
    await expect(page.getByText(`No document of this source matches “${NO_MATCH_QUERY}”`).first()).toBeVisible();
  });
});
