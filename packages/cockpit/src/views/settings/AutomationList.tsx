import type { ProjectSettingsView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Card } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';

type Automation = ProjectSettingsView['automations'][number];

function GlobList({ label, globs, any }: { readonly label: string; readonly globs: readonly string[]; readonly any: string }) {
  return (
    <div className="automation__rule">
      <dt>{label}</dt>
      <dd>
        {globs.length === 0 ? (
          <span className="subtle">{any}</span>
        ) : (
          <ul className="automation__globs">
            {globs.map((glob) => (
              <li key={glob}>
                <code>{glob}</code>
              </li>
            ))}
          </ul>
        )}
      </dd>
    </div>
  );
}

function AutomationItem({ automation }: { readonly automation: Automation }) {
  const { t } = useI18n();
  const matchesNothing = automation.branches.length === 0 && automation.authors.length === 0;
  return (
    <li className="automation">
      <p className="automation__name mono">{automation.name}</p>
      {matchesNothing ? (
        <p className="subtle">{t('settings.automations.matchesNothing')}</p>
      ) : (
        <dl className="automation__rules">
          <GlobList label={t('settings.automations.branches')} globs={automation.branches} any={t('settings.automations.anyBranch')} />
          <GlobList label={t('settings.automations.authors')} globs={automation.authors} any={t('settings.automations.anyAuthor')} />
        </dl>
      )}
    </li>
  );
}

/** The other automations of the repository: the changes they bring are recorded without an audit. */
export function AutomationList({ automations }: { readonly automations: ProjectSettingsView['automations'] }) {
  const { t } = useI18n();
  if (automations.length === 0) return <EmptyState compact title={t('settings.automations.empty')} />;
  return (
    <Card padded={false}>
      <ul className="automation-list" aria-label={t('settings.automations.title')}>
        {automations.map((automation) => (
          <AutomationItem key={automation.name} automation={automation} />
        ))}
      </ul>
    </Card>
  );
}
