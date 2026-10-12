import { describe, expect, it } from 'vitest';
import type { KnowledgeDocument, KnowledgeSourceView, Reading } from '../../contract/index.ts';
import { filteredDocuments, knowledgeTotals } from './knowledge-model.ts';

const READ_AT = '2026-10-12T09:55:00.000Z';
const orders: KnowledgeDocument = { path: 'docs/architecture/orders.md', title: 'Orders and their statuses', bytes: 5230 };
const promo: KnowledgeDocument = { path: 'docs/product/promo-codes.md', title: 'Promo code rules', bytes: 3120 };
const readme: KnowledgeDocument = { path: 'README.md', title: 'Design system overview', bytes: 2040 };

const source = (documents: Reading<readonly KnowledgeDocument[]>): Pick<KnowledgeSourceView, 'documents'> => ({ documents: { value: documents.value === null ? null : [...documents.value], readAt: documents.readAt, error: documents.error } });
const fresh = (...documents: KnowledgeDocument[]) => source({ value: documents, readAt: READ_AT, error: null });
const neverRead = source({ value: null, readAt: null, error: null });

describe('filteredDocuments', () => {
  it('keeps every document when the query is empty or blank', () => {
    expect(filteredDocuments(fresh(orders, promo), '').value).toEqual([orders, promo]);
    expect(filteredDocuments(fresh(orders, promo), '   ').value).toEqual([orders, promo]);
  });

  it('keeps the documents whose title holds the query, whatever its case', () => {
    expect(filteredDocuments(fresh(orders, promo), 'PROMO').value).toEqual([promo]);
    expect(filteredDocuments(fresh(orders, promo), 'their statuses').value).toEqual([orders]);
  });

  it('keeps the documents whose path holds the query', () => {
    expect(filteredDocuments(fresh(orders, promo), 'architecture/').value).toEqual([orders]);
    expect(filteredDocuments(fresh(orders, promo, readme), '.md').value).toEqual([orders, promo, readme]);
  });

  it('ignores the blanks around the query', () => {
    expect(filteredDocuments(fresh(orders, promo), '  orders ').value).toEqual([orders]);
  });

  it('leaves nothing when nothing matches', () => {
    expect(filteredDocuments(fresh(orders, promo), 'zzz').value).toEqual([]);
  });

  it('keeps the time and the error of the reading it filters', () => {
    const failed = source({ value: [orders], readAt: READ_AT, error: 'git fetch failed' });
    expect(filteredDocuments(failed, 'orders')).toEqual({ value: [orders], readAt: READ_AT, error: 'git fetch failed' });
  });

  it('leaves a source that holds no value without one, whatever the query', () => {
    expect(filteredDocuments(neverRead, 'orders')).toEqual({ value: null, readAt: null, error: null });
    expect(filteredDocuments(source({ value: null, readAt: null, error: 'unreachable' }), '')).toEqual({ value: null, readAt: null, error: 'unreachable' });
  });

  it('does not mutate the documents it was given', () => {
    const given = fresh(orders, promo);
    filteredDocuments(given, 'promo');
    expect(given.documents.value).toEqual([orders, promo]);
  });
});

describe('knowledgeTotals', () => {
  it('counts the documents known, those that match, the sources and the sources with no document list', () => {
    const totals = knowledgeTotals([fresh(orders, promo), fresh(readme), neverRead], 'promo');
    expect(totals).toEqual({ documents: 3, shown: 1, sources: 3, unread: 1 });
  });

  it('shows every document when the query is empty', () => {
    expect(knowledgeTotals([fresh(orders, promo), fresh(readme)], '')).toMatchObject({ documents: 3, shown: 3, unread: 0 });
  });

  it('counts a source whose read failed with nothing kept among the unread ones, and one that failed with a value among the read ones', () => {
    const failedEmpty = source({ value: null, readAt: null, error: 'unreachable' });
    const failedKept = source({ value: [orders], readAt: READ_AT, error: 'unreachable' });
    expect(knowledgeTotals([failedEmpty, failedKept], '')).toMatchObject({ documents: 1, unread: 1, sources: 2 });
  });

  it('counts a source that was read and holds no document as read', () => {
    expect(knowledgeTotals([fresh()], '')).toEqual({ documents: 0, shown: 0, sources: 1, unread: 0 });
  });

  it('totals nothing for a project with no source', () => {
    expect(knowledgeTotals([], 'orders')).toEqual({ documents: 0, shown: 0, sources: 0, unread: 0 });
  });
});
