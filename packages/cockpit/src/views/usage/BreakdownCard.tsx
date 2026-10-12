import type { ReactNode } from 'react';
import { useState } from 'react';
import type { CostBasisView, CostEntry } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Button } from '../../ui/components/Button.tsx';
import { Card } from '../../ui/components/Card.tsx';
import { Money } from '../../widgets/Money.tsx';
import { TokenTotalsView } from '../../widgets/TokenTotalsView.tsx';
import { byCostDescending, shareOfLargest } from './costs-model.ts';

/** How many entries a card lists before the rest is asked for. */
const ENTRIES_SHOWN = 8;
const PERCENT = 100;

interface BreakdownCardProps<Entry extends CostEntry> {
  readonly title: string;
  readonly entries: readonly Entry[];
  readonly basis: CostBasisView;
  readonly renderLabel: (entry: Entry) => ReactNode;
}

/** What each group of runs cost, the dearest first: its cost, how many runs and how many tokens, with and without the cache. */
export function BreakdownCard<Entry extends CostEntry>({ title, entries, basis, renderLabel }: BreakdownCardProps<Entry>) {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  const sorted = byCostDescending(entries);
  const shown = all ? sorted : sorted.slice(0, ENTRIES_SHOWN);
  return (
    <Card className="usage-breakdown">
      <h3 className="usage-breakdown__title">{title}</h3>
      {sorted.length === 0 ? (
        <p className="subtle">{t('usage.breakdown.empty')}</p>
      ) : (
        <ul className="usage-breakdown__list" aria-label={title}>
          {shown.map((entry) => (
            <li key={entry.key} className="usage-entry">
              <div className="usage-entry__row">
                <span className="usage-entry__label">{renderLabel(entry)}</span>
                <Money amount={entry.costUsd} basis={basis} />
              </div>
              <span className="ds-bar-list__track" aria-hidden="true">
                <span className="ds-bar-list__fill" style={{ width: `${shareOfLargest(entry.costUsd, sorted) * PERCENT}%` }} />
              </span>
              <p className="usage-entry__meta">
                <span className="num">{t('usage.breakdown.runs', { count: entry.runs })}</span> · <TokenTotalsView totals={entry.tokens} />
              </p>
            </li>
          ))}
        </ul>
      )}
      {sorted.length > ENTRIES_SHOWN ? (
        <Button size="sm" variant="ghost" aria-expanded={all} onClick={() => setAll((current) => !current)}>
          {all ? t('pager.showLess') : t('pager.showMore')}
        </Button>
      ) : null}
    </Card>
  );
}
