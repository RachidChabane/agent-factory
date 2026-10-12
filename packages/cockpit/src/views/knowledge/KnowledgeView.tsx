import './knowledge.css';
import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { Field, TextInput } from '../../ui/components/Field.tsx';
import { Page, PageHeader } from '../../ui/layout/Page.tsx';
import { KnowledgeSourceSection } from './KnowledgeSourceSection.tsx';
import { knowledgeTotals } from './knowledge-model.ts';

const SUMMARY_SEPARATOR = ' · ';
const ICON_SIZE = 16;

export function KnowledgeView() {
  const { t } = useI18n();
  const project = useProject();
  const [query, setQuery] = useState('');
  const totals = knowledgeTotals(project.knowledge, query);
  const filtering = query.trim().length > 0;
  const summary = [
    filtering ? t('knowledge.filter.result', { shown: totals.shown, count: totals.documents }) : t('knowledge.documents', { count: totals.documents }),
    t('knowledge.sources', { count: totals.sources }),
    totals.unread === 0 ? null : t('knowledge.unread', { count: totals.unread }),
  ].filter((part) => part !== null);
  return (
    <Page width="narrow" className="knowledge">
      <PageHeader title={t('knowledge.title')} description={t('knowledge.description')} />
      {project.knowledge.length === 0 ? (
        <EmptyState icon={<BookOpen size={ICON_SIZE} />} title={t('knowledge.none')} description={t('knowledge.noneDescription')} />
      ) : (
        <>
          <div className="knowledge__toolbar">
            <div className="knowledge__filter">
              <Field label={t('knowledge.filter.label')} hideLabel>
                {(id) => <TextInput id={id} type="search" placeholder={t('knowledge.filter.placeholder')} value={query} onChange={(event) => setQuery(event.currentTarget.value)} />}
              </Field>
            </div>
            <p className="knowledge__summary num" aria-live="polite">
              {summary.join(SUMMARY_SEPARATOR)}
            </p>
          </div>
          {project.knowledge.map((source, position) => (
            <KnowledgeSourceSection key={`${position}:${source.kind}:${source.location}`} source={source} query={query} />
          ))}
        </>
      )}
    </Page>
  );
}
