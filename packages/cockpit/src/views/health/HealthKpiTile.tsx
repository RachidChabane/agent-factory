import type { MetricSeries } from '../../contract/index.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Card, Stat } from '../../ui/components/Card.tsx';
import { TrendLine } from '../../ui/components/Charts.tsx';
import { chartPoints, TREND_LINE_HEIGHT } from './health-metrics.ts';

interface HealthKpiTileProps {
  readonly label: string;
  readonly metric: MetricSeries;
  readonly format: (value: number) => string;
  readonly fallbackHint: string;
  readonly sampledAt: string;
  readonly intervalMinutes: number;
}

export function HealthKpiTile({ label, metric, format, fallbackHint, sampledAt, intervalMinutes }: HealthKpiTileProps) {
  const breached = metric.threshold !== null && metric.current > metric.threshold;
  const hint =
    metric.threshold === null ? (
      fallbackHint
    ) : (
      <span className="health-kpi__hint">
        <span>seuil {format(metric.threshold)}</span>
        {breached ? <Badge tone="failed">Seuil dépassé</Badge> : null}
      </span>
    );
  return (
    <Card className="health-kpi" aria-label={label}>
      <Stat label={label} value={format(metric.current)} hint={hint}>
        <TrendLine
          points={chartPoints(metric.points, sampledAt, intervalMinutes)}
          label={label}
          format={format}
          tone={breached ? 'failed' : 'accent'}
          height={TREND_LINE_HEIGHT}
        />
      </Stat>
    </Card>
  );
}
