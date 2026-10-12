import { FlaskConical, Info, WifiOff } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { useCockpitState, useMaybeSnapshot } from './hooks.ts';

/** Says, as long as it holds, that the projects shown are not real ones or that no remote forge is written. */
export function ModeBanner() {
  const { t } = useI18n();
  const mode = useMaybeSnapshot()?.installation.mode ?? 'live';
  if (mode === 'live') return null;
  return (
    <div className={`mode-banner mode-banner--${mode}`} role="note">
      {mode === 'demo' ? <FlaskConical size={14} aria-hidden="true" /> : <Info size={14} aria-hidden="true" />}
      <span>{mode === 'demo' ? t('banner.demo') : t('banner.rehearsal')}</span>
    </div>
  );
}

export function ConnectionBanner() {
  const { t } = useI18n();
  const connection = useCockpitState((state) => state.connection);
  const loadError = useCockpitState((state) => state.loadError);
  const hasSnapshot = useCockpitState((state) => state.snapshot !== null);
  if (connection.status === 'live' || connection.status === 'connecting') return null;
  const status = t(`connection.${connection.status}`);
  return (
    <div className={`connection-banner connection-banner--${connection.status}`} role="status">
      <WifiOff size={14} aria-hidden="true" />
      <span>{hasSnapshot ? t('connection.bannerStale', { status }) : t('connection.bannerNoData', { status })}</span>
      {loadError === null ? null : <span className="connection-banner__detail mono truncate">{loadError}</span>}
    </div>
  );
}
