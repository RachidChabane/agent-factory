import type { TokenTotals } from '../contract/index.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';

interface TokenTotalsViewProps {
  readonly totals: TokenTotals;
  /** One line for dense places, or the full breakdown. */
  readonly layout?: 'line' | 'breakdown' | undefined;
}

/** Token totals always stated both ways, so that nobody mistakes a total with the cache for one without it. */
export function TokenTotalsView({ totals, layout = 'line' }: TokenTotalsViewProps) {
  const { t, fmt } = useI18n();
  if (layout === 'line') {
    return (
      <span className="token-totals num">
        <span>{t('tokens.withCache', { total: fmt.compact(totals.withCache) })}</span>
        <span className="token-totals__separator" aria-hidden="true">
          ·
        </span>
        <span>{t('tokens.withoutCache', { total: fmt.compact(totals.withoutCache) })}</span>
      </span>
    );
  }
  return (
    <div className="token-breakdown">
      <dl className="token-breakdown__totals">
        <div>
          <dt>{t('tokens.withCacheLabel')}</dt>
          <dd className="num">{fmt.integer(totals.withCache)}</dd>
        </div>
        <div>
          <dt>{t('tokens.withoutCacheLabel')}</dt>
          <dd className="num">{fmt.integer(totals.withoutCache)}</dd>
        </div>
      </dl>
      <dl className="token-breakdown__parts">
        <div>
          <dt>{t('tokens.input')}</dt>
          <dd className="num">{fmt.integer(totals.input)}</dd>
        </div>
        <div>
          <dt>{t('tokens.output')}</dt>
          <dd className="num">{fmt.integer(totals.output)}</dd>
        </div>
        <div>
          <dt>{t('tokens.cacheRead')}</dt>
          <dd className="num">{fmt.integer(totals.cacheRead)}</dd>
        </div>
        <div>
          <dt>{t('tokens.cacheCreation')}</dt>
          <dd className="num">{fmt.integer(totals.cacheCreation)}</dd>
        </div>
      </dl>
      <p className="token-breakdown__explain">{t('tokens.explain')}</p>
    </div>
  );
}
