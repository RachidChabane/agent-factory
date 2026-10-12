import { CircleAlert } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';

interface IssueCycleNoticeProps {
  readonly cycles: readonly (readonly number[])[];
}

export function IssueCycleNotice({ cycles }: IssueCycleNoticeProps) {
  const { t, fmt } = useI18n();
  return (
    <div className="callout callout--failed" role="note">
      <CircleAlert size={16} aria-hidden="true" />
      <div className="callout__body">
        <p className="callout__title">{t('issues.cycle.title', { count: cycles.length })}</p>
        <ul className="bullets">
          {cycles.map((cycle) => (
            <li key={cycle.join('-')}>{t('issues.cycle.members', { count: cycle.length, issues: fmt.list(cycle.map((number) => `#${number}`)) })}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
