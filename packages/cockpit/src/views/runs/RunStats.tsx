import type { ReactNode } from 'react';
import { Clock, Coins, Hash, Wrench } from 'lucide-react';
import type { CostBasisView, RunView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { tokenTotalsOfUsage } from '../../model/tokens.ts';
import { Card } from '../../ui/components/Card.tsx';
import { Meter } from '../../ui/components/Charts.tsx';
import { Money } from '../../widgets/Money.tsx';
import { Time } from '../../widgets/Time.tsx';
import { TokenTotalsView } from '../../widgets/TokenTotalsView.tsx';
import { consumptionOf } from '../usage/consumption.ts';
import { describeTiming, isCostPending } from './run-model.ts';

const ICON_SIZE = 13;

function Stat({ icon, label, children }: { readonly icon?: ReactNode | undefined; readonly label: string; readonly children: ReactNode }) {
  return (
    <Card className="run-stat">
      <span className="run-stat__label">
        {icon}
        {label}
      </span>
      {children}
    </Card>
  );
}

function DurationStat({ run, now }: { readonly run: RunView; readonly now: number }) {
  const { t, fmt, rich } = useI18n();
  const timing = describeTiming(run, now);
  return (
    <Stat icon={<Clock size={ICON_SIZE} aria-hidden="true" />} label={t('runs.stats.duration')}>
      {timing.kind === 'unknown-end' ? <span className="run-stat__value run-stat__value--text">{t('runs.stats.noEnd')}</span> : <span className="run-stat__value num">{fmt.duration(timing.elapsedMs)}</span>}
      {timing.kind === 'running' ? <span className="run-stat__hint">{t('runs.stats.running')}</span> : null}
      {timing.kind === 'waiting' && timing.since !== null ? <span className="run-stat__hint">{rich('runs.stats.asked', { when: <Time iso={timing.since} /> })}</span> : null}
      {timing.kind === 'ended' ? <span className="run-stat__hint">{rich('runs.stats.ended', { when: <Time iso={timing.endedAt} /> })}</span> : null}
    </Stat>
  );
}

function CostStat({ run, basis }: { readonly run: RunView; readonly basis: CostBasisView }) {
  const { t, fmt, rich } = useI18n();
  const budget = consumptionOf(run.costUsd, run.maxBudgetUsd);
  const pending = isCostPending(run);
  return (
    <Stat icon={<Coins size={ICON_SIZE} aria-hidden="true" />} label={t('runs.stats.cost')}>
      {pending ? (
        <span className="run-stat__value run-stat__value--text">{t('runs.cost.pending')}</span>
      ) : (
        <>
          <span className="run-stat__value">
            <Money amount={run.costUsd} basis={basis} />
          </span>
          <Meter size="sm" value={budget.ratio} tone={budget.tone} label={t('runs.stats.budgetUsed')} valueText={fmt.percent(budget.ratio)} />
        </>
      )}
      <span className="run-stat__hint">{rich('runs.stats.budget', { amount: <Money amount={run.maxBudgetUsd} basis={basis} /> })}</span>
    </Stat>
  );
}

function TurnsStat({ run }: { readonly run: RunView }) {
  const { t, fmt } = useI18n();
  const turns = consumptionOf(run.turns, run.maxTurns);
  return (
    <Stat icon={<Hash size={ICON_SIZE} aria-hidden="true" />} label={t('runs.stats.turns')}>
      <span className="run-stat__value num">{t('runs.stats.turnsOf', { turns: run.turns, max: run.maxTurns })}</span>
      <Meter size="sm" value={turns.ratio} tone={turns.tone} label={t('runs.stats.turnsUsed')} valueText={fmt.percent(turns.ratio)} />
    </Stat>
  );
}

function ToolStat({ run }: { readonly run: RunView }) {
  const { t } = useI18n();
  return (
    <Stat icon={<Wrench size={ICON_SIZE} aria-hidden="true" />} label={t('runs.stats.tool')}>
      {run.currentTool === null ? <span className="run-stat__value run-stat__value--text">{t('runs.stats.noTool')}</span> : <span className="run-stat__value run-stat__value--tool mono">{run.currentTool}</span>}
      <span className="run-stat__hint">{t('runs.stats.subagents', { count: run.subagents.length })}</span>
    </Stat>
  );
}

interface RunStatsProps {
  readonly run: RunView;
  /** What the dollar figures of this run mean, which follows the account that ran it. */
  readonly basis: CostBasisView;
  readonly now: number;
}

/** The figures of a run. They change with every sample, so assistive technology is not told each time. */
export function RunStats({ run, basis, now }: RunStatsProps) {
  const { t } = useI18n();
  return (
    <div className="run-stats" role="group" aria-label={t('runs.stats.label')} aria-live="off">
      <DurationStat run={run} now={now} />
      <CostStat run={run} basis={basis} />
      <TurnsStat run={run} />
      <Stat label={t('tokens.heading')}>
        <TokenTotalsView totals={tokenTotalsOfUsage(run.usage)} />
      </Stat>
      <ToolStat run={run} />
    </div>
  );
}
