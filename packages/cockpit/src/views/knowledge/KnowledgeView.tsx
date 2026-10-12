import './knowledge.css';
import { useMemo, useState } from 'react';
import { SearchX } from 'lucide-react';
import { useNow } from '../../app/context.tsx';
import { useSnapshot } from '../../app/hooks.ts';
import { relativeTime } from '../../format/format.ts';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { Field, TextInput } from '../../ui/components/Field.tsx';
import { Skeleton } from '../../ui/components/Skeleton.tsx';
import { tabId, tabPanelId, Tabs } from '../../ui/components/Tabs.tsx';
import { Page, PageHeader } from '../../ui/layout/Page.tsx';
import type { KnowledgeTab } from './knowledge-model.ts';
import { KNOWLEDGE_TAB_LABELS, KNOWLEDGE_TABS, knowledgeCounts, selectKnowledge } from './knowledge-model.ts';
import { AreaCards, DecisionList, ScreenTable, SourceTable } from './KnowledgePanels.tsx';

const TABS_PREFIX = 'knowledge';
const SEARCH_PLACEHOLDER = 'Rechercher dans les connaissances…';
const SKELETON_HEIGHT = 220;

export function KnowledgeView() {
  const snapshot = useSnapshot();
  const now = useNow();
  const [tab, setTab] = useState<KnowledgeTab>('areas');
  const [query, setQuery] = useState('');
  const knowledge = snapshot?.knowledge ?? null;
  const selection = useMemo(() => (knowledge === null ? null : selectKnowledge(knowledge, query)), [knowledge, query]);

  if (knowledge === null || selection === null) {
    return (
      <Page>
        <PageHeader title="Connaissances" description="Ce que les agents lisent : carte produit, écrans, décisions et sources." />
        <div className="knowledge-skeleton" aria-busy="true" aria-label="Chargement des connaissances">
          <Skeleton height={SKELETON_HEIGHT} />
        </div>
      </Page>
    );
  }

  const counts = knowledgeCounts(selection);
  const panel = (() => {
    if (counts[tab] === 0) {
      return (
        <EmptyState
          icon={<SearchX size={16} />}
          title="Aucun résultat"
          description={query.trim() === '' ? 'Cet onglet ne contient encore aucun élément.' : `Rien ne correspond à « ${query.trim()} » dans cet onglet.`}
        />
      );
    }
    switch (tab) {
      case 'areas':
        return <AreaCards areas={selection.areas} />;
      case 'screens':
        return <ScreenTable screens={selection.screens} areas={knowledge.productAreas} />;
      case 'decisions':
        return <DecisionList decisions={selection.decisions} />;
      case 'sources':
        return <SourceTable sources={selection.sources} now={now} />;
    }
  })();

  return (
    <Page>
      <PageHeader title="Connaissances" description={`Mis à jour il y a ${relativeTime(knowledge.refreshedAt, now)}`} />
      <div className="knowledge-toolbar">
        <Field label="Rechercher dans les connaissances" hideLabel>
          {(id) => (
            <TextInput
              id={id}
              type="search"
              placeholder={SEARCH_PLACEHOLDER}
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          )}
        </Field>
      </div>
      <Tabs
        label="Sections des connaissances"
        idPrefix={TABS_PREFIX}
        value={tab}
        onChange={setTab}
        items={KNOWLEDGE_TABS.map((id) => ({ id, label: KNOWLEDGE_TAB_LABELS[id], count: counts[id] }))}
      />
      <div role="tabpanel" id={tabPanelId(TABS_PREFIX, tab)} aria-labelledby={tabId(TABS_PREFIX, tab)} className="knowledge-panel">
        {panel}
      </div>
    </Page>
  );
}
