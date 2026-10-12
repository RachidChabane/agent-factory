import { useMaybeSnapshot } from '../app/hooks.ts';
import type { UsageAccountView } from '../contract/index.ts';
import type { Translate } from '../i18n/create-i18n.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';

export type AccountIdentity = UsageAccountView['identity'];

const LOGIN_SEPARATOR = ' · ';

function loginParts(identity: AccountIdentity, t: Translate): readonly string[] {
  if (identity === null) return [];
  const plan = identity.plan === null ? null : t('account.plan', { plan: identity.plan });
  return [identity.email, identity.organization, plan].filter((part): part is string => part !== null);
}

interface AccountLabelProps {
  readonly name: string;
  /** Who the account is logged in as; looked up by name among the usage readings when not given. */
  readonly identity?: AccountIdentity | undefined;
  readonly className?: string | undefined;
}

/**
 * An account by its name, followed by who it is logged in as: the email, the organization and the
 * plan the last usage report named, or that the login is unknown. An account no reading holds is
 * shown by its name alone.
 */
export function AccountLabel({ name, identity, className }: AccountLabelProps) {
  const { t, rich } = useI18n();
  const accounts = useMaybeSnapshot()?.usage.accounts;
  const login = identity !== undefined ? identity : accounts?.find((account) => account.name === name)?.identity;
  if (login === undefined) return <span className={className}>{name}</span>;
  const parts = loginParts(login, t);
  return (
    <span className={['account-label', className].filter(Boolean).join(' ')}>
      {rich('account.label', {
        name: <span className="account-label__name">{name}</span>,
        login: <span className="account-label__login subtle">{parts.length === 0 ? t('account.loginUnknown') : parts.join(LOGIN_SEPARATOR)}</span>,
      })}
    </span>
  );
}
