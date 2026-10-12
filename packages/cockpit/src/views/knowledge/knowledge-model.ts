import type { DecisionStatus, KnowledgeView } from '../../contract/index.ts';
import type { BadgeTone } from '../../ui/components/Badge.tsx';
import { SOURCE_KIND_LABELS } from '../../i18n/labels.ts';

export const KNOWLEDGE_TABS = ['areas', 'screens', 'decisions', 'sources'] as const;
export type KnowledgeTab = (typeof KNOWLEDGE_TABS)[number];

export const KNOWLEDGE_TAB_LABELS: Readonly<Record<KnowledgeTab, string>> = {
  areas: 'Carte produit',
  screens: 'Écrans',
  decisions: 'Décisions',
  sources: 'Sources',
};

export const DECISION_TONES: Readonly<Record<DecisionStatus, BadgeTone>> = {
  accepted: 'success',
  proposed: 'waiting',
  superseded: 'idle',
};

export const HTTP_PREFIX = 'http';

export type KnowledgeArea = KnowledgeView['productAreas'][number];
export type KnowledgeScreen = KnowledgeView['screens'][number];
export type KnowledgeDecision = KnowledgeView['decisions'][number];
export type KnowledgeSource = KnowledgeView['sources'][number];

export interface KnowledgeSelection {
  readonly areas: KnowledgeArea[];
  readonly screens: KnowledgeScreen[];
  readonly decisions: KnowledgeDecision[];
  readonly sources: KnowledgeSource[];
}

export function knowledgeCounts(selection: KnowledgeSelection): Readonly<Record<KnowledgeTab, number>> {
  return {
    areas: selection.areas.length,
    screens: selection.screens.length,
    decisions: selection.decisions.length,
    sources: selection.sources.length,
  };
}

export function areaName(areas: readonly KnowledgeArea[], areaId: string): string {
  return areas.find((area) => area.id === areaId)?.name ?? areaId;
}

export function isLink(location: string): boolean {
  return location.startsWith(HTTP_PREFIX);
}

function matches(query: string, fields: readonly string[]): boolean {
  return fields.some((field) => field.toLowerCase().includes(query));
}

export function selectKnowledge(knowledge: KnowledgeView, rawQuery: string): KnowledgeSelection {
  const query = rawQuery.trim().toLowerCase();
  const byDateDescending = [...knowledge.decisions].sort((left, right) => right.date.localeCompare(left.date));
  if (query === '') {
    return { areas: knowledge.productAreas, screens: knowledge.screens, decisions: byDateDescending, sources: knowledge.sources };
  }
  return {
    areas: knowledge.productAreas.filter((area) => matches(query, [area.name, area.description, ...area.paths, ...area.owners])),
    screens: knowledge.screens.filter((screen) =>
      matches(query, [screen.name, screen.route, screen.description, areaName(knowledge.productAreas, screen.area)]),
    ),
    decisions: byDateDescending.filter((decision) => matches(query, [decision.id, decision.title, decision.summary])),
    sources: knowledge.sources.filter((source) => matches(query, [source.name, source.location, SOURCE_KIND_LABELS[source.kind]])),
  };
}
