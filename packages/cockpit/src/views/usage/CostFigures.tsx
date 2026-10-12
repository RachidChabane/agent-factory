import type { ReactNode } from 'react';
import type { CostsView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Card } from '../../ui/components/Card.tsx';
import { Meter } from '../../ui/components/Charts.tsx';
import { Money } from '../../widgets/Money.tsx';
import { consumptionOf } from './consumption.ts';
import { dailyCapAmount } from './costs-model.ts';

function Figure({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <Card className="usage-figure">
      <span className="usage-figure__label">{label}</span>
      {children}
    </Card>
  );
}

function DailyCapFigure({ costs }: { readonly costs: CostsView }) {
  const { t, fmt } = useI18n();
  const cap = dailyCapAmount(costs.dailyCap);
  if (cap === null) {
    return (
      <Figure label={t('usage.costs.dailyCap')}>
        <span className="usage-figure__value usage-figure__value--text">{t('usage.costs.noDailyCap')}</span>
        <span className="usage-figure__hint">{t('usage.costs.noDailyCapHint')}</span>
      </Figure>
    );
  }
  const used = consumptionOf(costs.today.costUsd, cap);
  return (
    <Figure label={t('usage.costs.dailyCap')}>
      <span className="usage-figure__value">
        <Money amount={cap} basis={costs.basis} />
      </span>
      <Meter size="sm" value={used.ratio} tone={used.tone} label={t('usage.costs.dailyCapMeter')} valueText={fmt.percent(used.ratio)} />
      <span className="usage-figure__hint">{t('usage.costs.dailyCapUsed', { percent: fmt.percent(used.ratio) })}</span>
      <span className="usage-figure__hint">{t('usage.costs.dailyCapHint')}</span>
    </Figure>
  );
}

function PerRunCapFigure({ costs }: { readonly costs: CostsView }) {
  const { t } = useI18n();
  return (
    <Figure label={t('usage.costs.perRunCap')}>
      {costs.perRunCapUsd === null ? (
        <>
          <span className="usage-figure__value usage-figure__value--text">{t('usage.costs.noPerRunCap')}</span>
          <span className="usage-figure__hint">{t('usage.costs.noPerRunCapHint')}</span>
        </>
      ) : (
        <>
          <span className="usage-figure__value">
            <Money amount={costs.perRunCapUsd} basis={costs.basis} />
          </span>
          <span className="usage-figure__hint">{t('usage.costs.perRunCapHint')}</span>
        </>
      )}
    </Figure>
  );
}

/** The cost of today and of the month, and the two caps the factory holds itself to. */
export function CostFigures({ costs }: { readonly costs: CostsView }) {
  const { t, fmt } = useI18n();
  return (
    <div className="usage-figures" role="group" aria-label={t('usage.costs.figures')}>
      <Figure label={t('usage.costs.today')}>
        <span className="usage-figure__value">
          <Money amount={costs.today.costUsd} basis={costs.basis} />
        </span>
        <span className="usage-figure__hint num">{t('usage.costs.todayRuns', { date: fmt.calendarDay(costs.today.date), count: costs.today.runs })}</span>
      </Figure>
      <Figure label={t('usage.costs.monthToDate')}>
        <span className="usage-figure__value">
          <Money amount={costs.monthToDateUsd} basis={costs.basis} />
        </span>
        <span className="usage-figure__hint">{t('usage.costs.monthToDateHint')}</span>
      </Figure>
      <DailyCapFigure costs={costs} />
      <PerRunCapFigure costs={costs} />
    </div>
  );
}
