import { useId } from 'react';
import type { KnowledgeDocument, KnowledgeSourceView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Section } from '../../ui/components/Card.tsx';
import type { TableColumn } from '../../ui/components/Table.tsx';
import { DataTable } from '../../ui/components/Table.tsx';
import { ReadingView } from '../../widgets/ReadingView.tsx';
import { filteredDocuments } from './knowledge-model.ts';

interface DocumentRow {
  readonly position: number;
  readonly document: KnowledgeDocument;
}

function DocumentTable({ documents, location }: { readonly documents: readonly KnowledgeDocument[]; readonly location: string }) {
  const { t, fmt } = useI18n();
  const rows = documents.map((document, position): DocumentRow => ({ position, document }));
  const columns: TableColumn<DocumentRow>[] = [
    {
      id: 'title',
      header: t('knowledge.column.title'),
      primary: true,
      cell: ({ document }) => (
        <span className="truncate" title={document.title}>
          {document.title}
        </span>
      ),
    },
    { id: 'path', header: t('knowledge.column.path'), cell: ({ document }) => <span className="mono">{document.path}</span> },
    { id: 'size', header: t('knowledge.column.size'), align: 'end', cell: ({ document }) => <span className="num">{fmt.bytes(document.bytes)}</span> },
  ];
  return <DataTable label={t('knowledge.source.table', { location })} rows={rows} columns={columns} rowKey={({ position, document }) => `${position}:${document.path}`} dense />;
}

interface KnowledgeSourceSectionProps {
  readonly source: KnowledgeSourceView;
  /** What the operator typed in the filter, as typed. */
  readonly query: string;
}

/** One source of documents with what was last read from it, in each state a reading can be in. */
export function KnowledgeSourceSection({ source, query }: KnowledgeSourceSectionProps) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const id = useId();
  const reading = filteredDocuments(source, query);
  const known = source.documents.value?.length ?? null;
  const filtering = query.trim().length > 0;
  const emptyBecauseOfFilter = filtering && known !== null && known > 0;
  const count = reading.value === null || known === null ? undefined : filtering ? t('knowledge.filter.result', { shown: reading.value.length, count: known }) : t('knowledge.documents', { count: known });
  return (
    <Section id={id} title={<span className="mono knowledge-source__location">{source.location}</span>} description={count} actions={<Badge>{vocabulary.knowledgeSourceKind(source.kind)}</Badge>}>
      <ReadingView
        reading={reading}
        kind="knowledge"
        notRead={t('knowledge.source.notRead')}
        isEmpty={(documents) => documents.length === 0}
        empty={emptyBecauseOfFilter ? t('knowledge.source.noMatch', { query: query.trim() }) : t('knowledge.source.empty')}
      >
        {(documents) => <DocumentTable documents={documents} location={source.location} />}
      </ReadingView>
    </Section>
  );
}
