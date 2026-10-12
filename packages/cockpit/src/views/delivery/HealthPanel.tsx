import type { EnvironmentView, HealthCheckView, HealthSample } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { ReadStamp } from '../../widgets/ReadStamp.tsx';
import { EnvironmentPanel } from './EnvironmentPanel.tsx';
import { HealthChart } from './HealthChart.tsx';
import { sampleMark } from './health-model.ts';

function LatestSample({ sample }: { readonly sample: HealthSample }) {
  const { t } = useI18n();
  const verdict = sample.ok ? t('delivery.health.passing') : t('delivery.health.failing');
  return (
    <div className="health-sample">
      <span className="health-sample__verdict">
        <StatusMark mark={sampleMark(sample)} label={verdict} />
        {verdict}
      </span>
      <span className="num">{sample.statusCode === null ? t('delivery.health.noResponse') : t('delivery.health.status', { code: sample.statusCode })}</span>
      <span className="num">{sample.latencyMs === null ? t('delivery.health.noLatency') : t('delivery.health.latency', { ms: sample.latencyMs })}</span>
      {sample.detail === '' ? null : <span className="health-sample__detail">{sample.detail}</span>}
      <ReadStamp readAt={sample.at} kind="health" verb="sampled" />
    </div>
  );
}

function HealthCheckItem({ check }: { readonly check: HealthCheckView }) {
  const { t } = useI18n();
  return (
    <li className="health-check">
      <div className="health-check__head">
        <span className="health-check__name mono">{check.name}</span>
        <a className="link health-check__url" href={check.url} target="_blank" rel="noreferrer">
          {check.url}
        </a>
      </div>
      {check.latest === null ? <EmptyState compact title={t('delivery.health.noSample')} description={t('delivery.health.noSampleDescription')} /> : <LatestSample sample={check.latest} />}
      {check.latest === null && check.series.length === 0 ? null : <HealthChart check={check} />}
    </li>
  );
}

/** The health checks of an environment: the latest sample of each, and the last day as a chart. */
export function HealthPanel({ environment }: { readonly environment: EnvironmentView }) {
  const { t } = useI18n();
  return (
    <EnvironmentPanel title={t('delivery.health.title')}>
      {environment.health.length === 0 ? (
        <EmptyState compact title={t('delivery.health.none')} description={t('delivery.health.noneDescription')} />
      ) : (
        <ul className="health-checks" aria-label={t('delivery.health.list', { environment: environment.name })}>
          {environment.health.map((check) => (
            <HealthCheckItem key={`${check.name} ${check.url}`} check={check} />
          ))}
        </ul>
      )}
    </EnvironmentPanel>
  );
}
