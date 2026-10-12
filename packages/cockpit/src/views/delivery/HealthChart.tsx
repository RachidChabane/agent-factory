import { useId } from 'react';
import { useNow } from '../../app/context.tsx';
import type { HealthCheckView, HealthSample } from '../../contract/index.ts';
import type { Translate } from '../../i18n/create-i18n.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { TrendLine } from '../../ui/components/Charts.tsx';
import type { TimelineCell } from './health-model.ts';
import { latencyPoints, summarizeSeries, timelineCells } from './health-model.ts';

const LATENCY_CHART_HEIGHT = 40;
const MIN_POINTS_FOR_TREND = 2;
const SINGLE_SAMPLE = 1;

function cellTitle(cell: TimelineCell, t: Translate, dateTime: (iso: string) => string): string {
  if (cell.passing + cell.failing === SINGLE_SAMPLE) return t('delivery.health.cell', { when: dateTime(cell.from), result: cell.failing === 0 ? t('delivery.health.passing') : t('delivery.health.failing') });
  return t('delivery.health.cellRange', { from: dateTime(cell.from), to: dateTime(cell.to), passing: cell.passing, failing: cell.failing });
}

function Timeline({ series }: { readonly series: readonly HealthSample[] }) {
  const { t, fmt } = useI18n();
  return (
    <div className="health-timeline" aria-hidden="true">
      {timelineCells(series).map((cell, index) => (
        <span key={`${index}-${cell.from}`} className={`health-timeline__cell ${cell.failing === 0 ? 'is-passing' : 'is-failing'}`} title={cellTitle(cell, t, fmt.dateTime)} />
      ))}
    </div>
  );
}

/** The numbers of the last day in words: how many samples passed and failed, and how slow the answers were. */
function describeSeries(series: readonly HealthSample[], t: Translate): string {
  const summary = summarizeSeries(series);
  const counts = t('delivery.health.summary', { count: summary.total, passing: summary.passing, failing: summary.failing });
  const latency =
    summary.latency === null ? t('delivery.health.summaryNoLatency') : t('delivery.health.summaryLatency', { fastest: summary.latency.fastestMs, slowest: summary.latency.slowestMs });
  return `${counts} ${latency}`;
}

/**
 * The last day of one health check: the latency over time, and a strip of cells that say whether the
 * samples passed. The caption states the same numbers in words, so the picture is never the only source.
 */
export function HealthChart({ check }: { readonly check: HealthCheckView }) {
  const { t, fmt } = useI18n();
  const now = useNow();
  const captionId = useId();
  const { series } = check;
  const oldest = series[0];
  const newest = series.at(-1);
  if (oldest === undefined || newest === undefined) return <p className="subtle">{t('delivery.health.noSeries')}</p>;
  const points = latencyPoints(series).map((point) => ({ label: fmt.dateTime(point.at), value: point.latencyMs }));
  return (
    <figure className="health-chart" aria-labelledby={captionId}>
      {points.length < MIN_POINTS_FOR_TREND ? null : (
        <TrendLine
          points={points}
          label={t('delivery.health.latencyChart')}
          format={(milliseconds) => t('delivery.health.latency', { ms: milliseconds })}
          tone={newest.ok ? 'success' : 'failed'}
          height={LATENCY_CHART_HEIGHT}
        />
      )}
      <Timeline series={series} />
      {series.length < MIN_POINTS_FOR_TREND ? null : (
        <div className="health-chart__axis" aria-hidden="true">
          <span>{fmt.ago(oldest.at, now)}</span>
          <span>{fmt.ago(newest.at, now)}</span>
        </div>
      )}
      <figcaption id={captionId} className="health-chart__caption">
        {describeSeries(series, t)}
      </figcaption>
    </figure>
  );
}
