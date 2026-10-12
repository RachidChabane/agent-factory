import type { MessageKey } from '../../i18n/catalog/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { latestReadFailed } from '../../model/usage.ts';
import type { UsageAccountView } from '../../contract/index.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Card } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { AccountLabel } from '../../widgets/AccountLabel.tsx';
import { ReadStamp } from '../../widgets/ReadStamp.tsx';
import { Time } from '../../widgets/Time.tsx';
import { LimitRow } from './LimitRow.tsx';
import type { NoLimitsReason } from './usage-model.ts';
import { limitKey, noLimitsReason } from './usage-model.ts';

const NO_LIMITS_DESCRIPTIONS = {
  'api-key': 'usage.account.noLimitsApiKey',
  'never-read': 'usage.account.noLimitsNeverRead',
  'none-reported': 'usage.account.noLimitsReported',
} as const satisfies Readonly<Record<NoLimitsReason, MessageKey>>;

interface AccountCardProps {
  readonly account: UsageAccountView;
  /** How old a reading of the account may be before it is called stale. */
  readonly staleAfterMs: number;
}

/** An account of the installation: who it is, when and from where it was read, and each limit of its subscription. */
export function AccountCard({ account, staleAfterMs }: AccountCardProps) {
  const { t, rich } = useI18n();
  const vocabulary = useVocabulary();
  const failed = latestReadFailed(account);
  const pastFailure = failed ? null : account.lastFailure;
  return (
    <Card className="usage-account" role="group" aria-label={account.name}>
      <header className="usage-account__header">
        <h3 className="usage-account__name">
          <AccountLabel name={account.name} identity={account.identity} />
        </h3>
        <Badge>{vocabulary.billing(account.billing)}</Badge>
      </header>
      <div className="usage-account__reading">
        {account.source === null ? null : <span>{t('usage.account.source', { source: vocabulary.usageSource(account.source) })}</span>}
        <ReadStamp readAt={account.readAt} error={failed ? (account.lastFailure?.reason ?? null) : null} staleAfterMs={staleAfterMs} />
      </div>
      {pastFailure === null ? null : <p className="usage-account__history subtle">{rich('usage.account.failedBefore', { when: <Time iso={pastFailure.at} />, reason: pastFailure.reason })}</p>}
      {account.limits.length === 0 ? (
        <EmptyState compact title={t('usage.account.noLimits')} description={t(NO_LIMITS_DESCRIPTIONS[noLimitsReason(account)])} />
      ) : (
        <ul className="usage-limits" aria-label={t('usage.account.limits', { account: account.name })}>
          {account.limits.map((limit) => (
            <LimitRow key={limitKey(limit)} limit={limit} />
          ))}
        </ul>
      )}
    </Card>
  );
}
