import type { DailyCost } from '../../contract/index.ts';
import { integer, shortDate, usd } from '../../format/format.ts';
import { Card, Stat } from '../../ui/components/Card.tsx';
import { BarChart } from '../../ui/components/Charts.tsx';
import { axisDates, COST_CHART_HEIGHT, summarizeDaily } from './costs-model.ts';

export const NO_DAILY_CAP = 0;

interface CostsDailyProps {
  readonly daily: readonly DailyCost[];
  readonly dailyCapUsd: number;
}

export function CostsDaily({ daily, dailyCapUsd }: CostsDailyProps) {
  const summary = summarizeDaily(daily);
  return (
    <Card className="costs-daily">
      <BarChart
        points={daily.map((day) => ({ label: shortDate(day.date), value: day.costUsd }))}
        label="Coût quotidien sur 30 jours"
        format={usd}
        height={COST_CHART_HEIGHT}
        axisLabels={axisDates(daily).map(shortDate)}
        reference={dailyCapUsd === NO_DAILY_CAP ? undefined : { value: dailyCapUsd, label: `Plafond quotidien ${usd(dailyCapUsd)}` }}
      />
      {dailyCapUsd === NO_DAILY_CAP ? <span className="costs-daily__no-cap">Aucun plafond quotidien</span> : null}
      <div className="costs-daily__summary">
        <Stat label="Total sur 30 jours" value={usd(summary.totalUsd)} />
        <Stat label="Moyenne par jour" value={usd(summary.averageUsd)} />
        <Stat label="Runs" value={integer(summary.runs)} />
      </div>
    </Card>
  );
}
