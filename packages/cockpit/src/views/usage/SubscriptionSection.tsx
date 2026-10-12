import { RefreshCw } from 'lucide-react';
import { useSnapshot } from '../../app/hooks.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { MINUTE_MS } from '../../i18n/formatters.ts';
import { Section } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { CommandButton } from '../../widgets/CommandButton.tsx';
import { AccountCard } from './AccountCard.tsx';

const ICON_SIZE = 14;

/** The subscription accounts and their limits, with the cadence they are read at and the button that reads them on order. */
export function SubscriptionSection() {
  const { t, fmt } = useI18n();
  const { usage } = useSnapshot();
  const staleAfterMs = usage.staleAfterMinutes * MINUTE_MS;
  return (
    <Section
      id="usage-subscription"
      title={t('usage.subscription.title')}
      description={t('usage.subscription.cadence', { refresh: fmt.duration(usage.refreshMinutes * MINUTE_MS), stale: fmt.duration(staleAfterMs) })}
      actions={
        <CommandButton command="usage.refresh" body={{}} icon={<RefreshCw size={ICON_SIZE} />}>
          {t('usage.refresh')}
        </CommandButton>
      }
    >
      {usage.accounts.length === 0 ? (
        <EmptyState compact title={t('usage.accounts.empty')} description={t('usage.accounts.emptyDescription')} />
      ) : (
        <ul className="usage-accounts" aria-label={t('usage.accounts.label')}>
          {usage.accounts.map((account) => (
            <li key={account.name}>
              <AccountCard account={account} staleAfterMs={staleAfterMs} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
