import { Globe, GlobeLock } from 'lucide-react';
import type { NamedCommandView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';

const ICON_SIZE = 13;

interface NamedCommandListProps {
  readonly label: string;
  readonly commands: readonly NamedCommandView[];
  /** Why there is nothing to list. */
  readonly empty: string;
}

/** The commands a project runs, each with the line it runs and whether it may reach the network, and why. */
export function NamedCommandList({ label, commands, empty }: NamedCommandListProps) {
  const { t } = useI18n();
  if (commands.length === 0) return <p className="subtle">{empty}</p>;
  return (
    <ul className="command-list" aria-label={label}>
      {commands.map((command, index) => (
        <li key={`${command.name}-${index}`} className="command-list__item">
          <span className="command-list__name mono">{command.name}</span>
          <code className="command-list__run">{command.run}</code>
          <span className={`command-list__network${command.network === null ? '' : ' is-declared'}`}>
            {command.network === null ? <GlobeLock size={ICON_SIZE} aria-hidden="true" /> : <Globe size={ICON_SIZE} aria-hidden="true" />}
            {command.network === null ? t('settings.commands.noNetwork') : t('settings.commands.network', { reason: command.network })}
          </span>
        </li>
      ))}
    </ul>
  );
}
