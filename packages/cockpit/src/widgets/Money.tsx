import { Info } from 'lucide-react';
import type { CostBasisView } from '../contract/index.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';

interface MoneyProps {
  readonly amount: number;
  /** What the figure means: the API price of subscription usage, the metered price, or a mix. */
  readonly basis: CostBasisView;
  readonly className?: string | undefined;
}

/** A dollar amount that always says what it is: an API-equivalent price of subscription usage is not money spent. */
export function Money({ amount, basis, className }: MoneyProps) {
  const { t, fmt } = useI18n();
  return (
    <span className={['money', className].filter(Boolean).join(' ')}>
      <span className="money__amount num">{fmt.usd(amount)}</span>
      <span className={`money__basis money__basis--${basis}`} title={t(`money.basisHint.${basis}`)}>
        {t(`money.basis.${basis}`)}
      </span>
    </span>
  );
}

/** The sentence that explains the dollar figures of a page, to put once at its top. */
export function CostBasisNote({ basis }: { readonly basis: CostBasisView }) {
  const { t } = useI18n();
  return (
    <div className="callout callout--running" role="note">
      <Info size={16} aria-hidden="true" />
      <div className="callout__body">
        <p className="callout__title">{t(`money.noteTitle.${basis}`)}</p>
        <p>{t(`money.note.${basis}`)}</p>
      </div>
    </div>
  );
}
