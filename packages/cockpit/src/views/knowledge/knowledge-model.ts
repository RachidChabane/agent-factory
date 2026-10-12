import type { KnowledgeDocument, KnowledgeSourceView, Reading } from '../../contract/index.ts';

function matches(document: Pick<KnowledgeDocument, 'path' | 'title'>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle.length === 0 || document.title.toLowerCase().includes(needle) || document.path.toLowerCase().includes(needle);
}

/** The documents of a source whose title or path holds the query; the reading keeps its time and its error, and stays unread if nothing was read. */
export function filteredDocuments(source: Pick<KnowledgeSourceView, 'documents'>, query: string): Reading<readonly KnowledgeDocument[]> {
  const { value, readAt, error } = source.documents;
  return { value: value === null ? null : value.filter((document) => matches(document, query)), readAt, error };
}

export interface KnowledgeTotals {
  /** The documents known across the sources, from the last successful read of each. */
  readonly documents: number;
  /** How many of them match the query. */
  readonly shown: number;
  readonly sources: number;
  /** The sources with no document list at all: never read, or failed with nothing kept. */
  readonly unread: number;
}

export function knowledgeTotals(sources: readonly Pick<KnowledgeSourceView, 'documents'>[], query: string): KnowledgeTotals {
  const documents = sources.flatMap((source) => source.documents.value ?? []);
  return {
    documents: documents.length,
    shown: documents.filter((document) => matches(document, query)).length,
    sources: sources.length,
    unread: sources.filter((source) => source.documents.value === null).length,
  };
}
