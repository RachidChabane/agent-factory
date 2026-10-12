import './health.css';
import { useState } from 'react';
import { Activity, ExternalLink } from 'lucide-react';
import { useNow } from '../../app/context.tsx';
import { useSnapshot } from '../../app/hooks.ts';
import type { EnvironmentName, HealthEnvironment, HealthView as HealthSnapshot } from '../../contract/index.ts';
import { compact, relativeTime, usd } from '../../format/format.ts';
import { ENVIRONMENT_LABELS } from '../../i18n/labels.ts';
import { VIEW_TITLES } from '../../model/routes.ts';
import { Section } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { Skeleton } from '../../ui/components/Skeleton.tsx';
import { Segmented } from '../../ui/components/Tabs.tsx';
import { Page, PageHeader } from '../../ui/layout/Page.tsx';
import { HealthAlerts } from './HealthAlerts.tsx';
import { HealthFeedback } from './HealthFeedback.tsx';
import { HealthKpiTile } from './HealthKpiTile.tsx';
import { HealthPods } from './HealthPods.tsx';
import { DEFAULT_HEALTH_ENVIRONMENT, formatErrorRate, formatLatency, HEALTH_ENVIRONMENTS } from './health-metrics.ts';

const DESCRIPTION = 'Production et PREP : erreurs, latence, coût LLM, pods et alertes.';
const KPI_SKELETON_COUNT = 4;
const KPI_SKELETON_HEIGHT = 128;
const PANEL_SKELETON_HEIGHT = 200;

function HealthSkeleton() {
  return (
    <div className="health-stack" aria-busy="true" aria-label="Chargement de la santé">
      <div className="health-kpis">
        {Array.from({ length: KPI_SKELETON_COUNT }, (_, index) => (
          <Skeleton key={index} height={KPI_SKELETON_HEIGHT} />
        ))}
      </div>
      <Skeleton height={PANEL_SKELETON_HEIGHT} />
    </div>
  );
}

interface HealthContentProps {
  readonly health: HealthSnapshot;
  readonly environment: HealthEnvironment;
  readonly now: number;
}

function HealthContent({ health, environment, now }: HealthContentProps) {
  const tile = { sampledAt: environment.sampledAt, intervalMinutes: health.seriesIntervalMinutes };
  const interval = `sur ${health.seriesIntervalMinutes} min`;
  return (
    <div className="health-stack">
      <p className="health-sampled">Mesuré : {relativeTime(environment.sampledAt, now)}</p>
      <div className="health-kpis">
        <HealthKpiTile label="Taux d’erreur" metric={environment.errorRate} format={formatErrorRate} fallbackHint={interval} {...tile} />
        <HealthKpiTile label="Latence p95" metric={environment.latencyP95} format={formatLatency} fallbackHint={interval} {...tile} />
        <HealthKpiTile label="Coût LLM" metric={environment.llmCost} format={usd} fallbackHint={`par intervalle de ${health.seriesIntervalMinutes} min`} {...tile} />
        <HealthKpiTile label="Requêtes" metric={environment.requests} format={compact} fallbackHint={interval} {...tile} />
      </div>
      <div className="health-columns">
        <Section title="Feedback utilisateurs">
          <HealthFeedback feedback={environment.feedback} now={now} />
        </Section>
        <Section title="Alertes">
          <HealthAlerts alerts={environment.alerts} now={now} />
        </Section>
      </div>
      <Section title="Pods">
        <HealthPods pods={environment.pods} now={now} />
      </Section>
    </div>
  );
}

export function HealthView() {
  const snapshot = useSnapshot();
  const now = useNow();
  const [selected, setSelected] = useState<EnvironmentName>(DEFAULT_HEALTH_ENVIRONMENT);
  const health = snapshot?.health ?? null;
  const environment = health?.environments.find((candidate) => candidate.environment === selected) ?? null;
  return (
    <Page>
      <PageHeader
        title={VIEW_TITLES['health']}
        description={DESCRIPTION}
        actions={
          environment === null ? undefined : (
            <a className="ds-button ds-button--secondary ds-button--md" href={environment.datadogUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={14} aria-hidden="true" />
              <span className="ds-button__label">Ouvrir dans Datadog</span>
            </a>
          )
        }
      />
      <div className="health-toolbar">
        <Segmented
          label="Environnement"
          value={selected}
          onChange={setSelected}
          items={HEALTH_ENVIRONMENTS.map((name) => ({ id: name, label: ENVIRONMENT_LABELS[name] }))}
        />
      </div>
      {health === null ? (
        <HealthSkeleton />
      ) : environment === null ? (
        <EmptyState icon={<Activity size={16} />} title="Aucune mesure" description="Cet environnement ne remonte pas encore de métriques." />
      ) : (
        <HealthContent health={health} environment={environment} now={now} />
      )}
    </Page>
  );
}
