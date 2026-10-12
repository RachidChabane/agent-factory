import { RotateCw, TriangleAlert } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { paths } from '../model/routes.ts';
import { CodeList } from '../widgets/CodeList.tsx';
import { Time } from '../widgets/Time.tsx';
import { useMaybeSnapshot } from './hooks.ts';

/**
 * Says, as long as they hold, that settings of the configuration file wait for a restart and that
 * the file was refused, so the factory still runs on the settings it had before.
 */
export function ConfigurationBanners() {
  const { t, rich } = useI18n();
  const location = useLocation();
  const configuration = useMaybeSnapshot()?.settings.configuration;
  if (configuration === undefined) return null;
  const { restartRequired, reloadFailure } = configuration;
  if (restartRequired.length === 0 && reloadFailure === null) return null;
  const onSettingsPage = location.pathname === paths.settings();
  const settingsLink = onSettingsPage ? null : (
    <Link className="config-banner__link" to={paths.settings()}>
      {t('configuration.banner.open')}
    </Link>
  );
  return (
    <div className="config-banners">
      {reloadFailure === null ? null : (
        <div className="config-banner config-banner--refused" role="status" aria-label={t('configuration.banner.refusedLabel')}>
          <TriangleAlert size={14} aria-hidden="true" />
          <p className="config-banner__text">
            {rich('configuration.banner.refused', {
              when: <Time iso={reloadFailure.at} mode="dateTime" />,
              age: <Time iso={reloadFailure.at} />,
              reason: <span className="mono">{reloadFailure.reason}</span>,
            })}{' '}
            {t('configuration.banner.keptPrevious')}
          </p>
          {settingsLink}
        </div>
      )}
      {restartRequired.length === 0 ? null : (
        <div className="config-banner config-banner--restart" role="status" aria-label={t('configuration.banner.restartLabel')}>
          <RotateCw size={14} aria-hidden="true" />
          <p className="config-banner__text">{rich('configuration.banner.restart', { sections: <CodeList items={restartRequired} /> })}</p>
          {settingsLink}
        </div>
      )}
    </div>
  );
}
