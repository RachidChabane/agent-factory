import type { CostsView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Card, Section } from '../../ui/components/Card.tsx';
import { BarChart } from '../../ui/components/Charts.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { Money } from '../../widgets/Money.tsx';
import { axisDates, dailyCapAmount, endsOnDay, summarizeDaily } from './costs-model.ts';

const CHART_HEIGHT = 168;

/** The cost of each day of the period, today in full colour, the daily cap drawn across when there is one. */
export function DailyCosts({ costs }: { readonly costs: CostsView }) {
  const { t, fmt } = useI18n();
  const { daily } = costs;
  const summary = summarizeDaily(daily);
  const cap = dailyCapAmount(costs.dailyCap);
  const basisLabel = t(`money.basis.${costs.basis}`);
  return (
    <Section id="usage-daily" title={t('usage.daily.title')} description={t('usage.daily.description', { count: daily.length })}>
      {daily.length === 0 ? (
        <EmptyState compact title={t('usage.daily.empty')} />
      ) : (
        <Card className="usage-daily">
          <BarChart
            points={daily.map((day) => ({ label: fmt.calendarDay(day.date), value: day.costUsd }))}
            label={t('usage.daily.chart', { count: daily.length })}
            format={(value) => `${fmt.usd(value)} · ${basisLabel}`}
            height={CHART_HEIGHT}
            highlightLast={endsOnDay(daily, costs.today.date)}
            axisLabels={axisDates(daily).map((date) => fmt.calendarDay(date))}
            reference={cap === null ? undefined : { value: cap, label: t('usage.daily.capLine', { amount: fmt.usd(cap), basis: basisLabel }) }}
          />
          {cap === null ? <p className="usage-daily__no-cap subtle">{t('usage.daily.noCap')}</p> : null}
          <dl className="usage-daily__summary">
            <div>
              <dt>{t('usage.daily.total')}</dt>
              <dd>
                <Money amount={summary.totalUsd} basis={costs.basis} />
              </dd>
            </div>
            <div>
              <dt>{t('usage.daily.average')}</dt>
              <dd>
                <Money amount={summary.averageUsd} basis={costs.basis} />
              </dd>
            </div>
            <div>
              <dt>{t('usage.daily.runs')}</dt>
              <dd className="num">{fmt.integer(summary.runs)}</dd>
            </div>
          </dl>
        </Card>
      )}
    </Section>
  );
}
