import { ExternalLink } from 'lucide-react';
import { relativeTime, shortDate } from '../../format/format.ts';
import { DECISION_STATUS_LABELS, SOURCE_KIND_LABELS } from '../../i18n/labels.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Card } from '../../ui/components/Card.tsx';
import type { TableColumn } from '../../ui/components/Table.tsx';
import { DataTable } from '../../ui/components/Table.tsx';
import type { KnowledgeArea, KnowledgeDecision, KnowledgeScreen, KnowledgeSource } from './knowledge-model.ts';
import { areaName, DECISION_TONES, isLink } from './knowledge-model.ts';

const SCREEN_NAME_WIDTH = '200px';
const SCREEN_ROUTE_WIDTH = '180px';
const SCREEN_AREA_WIDTH = '200px';
const SOURCE_KIND_WIDTH = '150px';
const SOURCE_REFRESHED_WIDTH = '120px';

export function AreaCards({ areas }: { readonly areas: readonly KnowledgeArea[] }) {
  return (
    <div className="knowledge-areas">
      {areas.map((area) => (
        <Card key={area.id} className="knowledge-area">
          <h3 className="knowledge-area__name">{area.name}</h3>
          <p className="knowledge-area__description">{area.description}</p>
          <ul className="knowledge-chips" aria-label={`Chemins de ${area.name}`}>
            {area.paths.map((path) => (
              <li key={path} className="knowledge-chip mono">
                {path}
              </li>
            ))}
          </ul>
          <p className="knowledge-area__owners">
            <span className="small-caps">Responsables</span>
            {area.owners.join(', ')}
          </p>
        </Card>
      ))}
    </div>
  );
}

export function ScreenTable({ screens, areas }: { readonly screens: readonly KnowledgeScreen[]; readonly areas: readonly KnowledgeArea[] }) {
  const columns: TableColumn<KnowledgeScreen>[] = [
    { id: 'name', header: 'Écran', width: SCREEN_NAME_WIDTH, cell: (screen) => <span className="truncate knowledge-cell">{screen.name}</span> },
    { id: 'route', header: 'Route', width: SCREEN_ROUTE_WIDTH, cell: (screen) => <span className="mono truncate knowledge-cell">{screen.route}</span> },
    {
      id: 'area',
      header: 'Zone',
      width: SCREEN_AREA_WIDTH,
      hideOnMobile: true,
      cell: (screen) => <span className="truncate knowledge-cell">{areaName(areas, screen.area)}</span>,
    },
    { id: 'description', header: 'Description', primary: true, cell: (screen) => <span className="truncate knowledge-cell">{screen.description}</span> },
  ];
  return <DataTable label="Écrans" rows={screens} columns={columns} rowKey={(screen) => screen.id} dense />;
}

export function DecisionList({ decisions }: { readonly decisions: readonly KnowledgeDecision[] }) {
  return (
    <ul className="knowledge-decisions">
      {decisions.map((decision) => (
        <li key={decision.id}>
          <Card className="knowledge-decision">
            <div className="knowledge-decision__head">
              <span className="mono knowledge-decision__id">{decision.id}</span>
              <Badge tone={DECISION_TONES[decision.status]}>{DECISION_STATUS_LABELS[decision.status]}</Badge>
              <span className="knowledge-decision__date num">{shortDate(decision.date)}</span>
            </div>
            <h3 className="knowledge-decision__title">{decision.title}</h3>
            <p className="knowledge-decision__summary">{decision.summary}</p>
            <a className="link knowledge-decision__link" href={decision.link} target="_blank" rel="noreferrer">
              Lire
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function SourceTable({ sources, now }: { readonly sources: readonly KnowledgeSource[]; readonly now: number }) {
  const columns: TableColumn<KnowledgeSource>[] = [
    { id: 'kind', header: 'Type', width: SOURCE_KIND_WIDTH, cell: (source) => SOURCE_KIND_LABELS[source.kind] },
    { id: 'name', header: 'Nom', cell: (source) => <span className="truncate knowledge-cell">{source.name}</span> },
    {
      id: 'location',
      header: 'Emplacement',
      primary: true,
      hideOnMobile: true,
      cell: (source) =>
        isLink(source.location) ? (
          <a className="link mono truncate knowledge-cell" href={source.location} target="_blank" rel="noreferrer">
            {source.location}
          </a>
        ) : (
          <span className="truncate knowledge-cell">{source.location}</span>
        ),
    },
    { id: 'refreshed', header: 'Mis à jour', width: SOURCE_REFRESHED_WIDTH, cell: (source) => <span className="num">il y a {relativeTime(source.refreshedAt, now)}</span> },
  ];
  return <DataTable label="Sources" rows={sources} columns={columns} rowKey={(source) => source.id} dense />;
}
