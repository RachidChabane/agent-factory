import { KeyRound, LogIn } from 'lucide-react';
import type { FilmToolWaitView } from '../contract/index.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { useVocabulary } from '../i18n/vocabulary.ts';
import { InlineCommand } from '../ui/components/CodeBlock.tsx';
import { CommandButton } from './CommandButton.tsx';
import { ReadStamp } from './ReadStamp.tsx';
import { Time } from './Time.tsx';

const ICON_SIZE = 16;
const BUTTON_ICON_SIZE = 13;

interface FilmToolWaitNoticeProps {
  readonly wait: FilmToolWaitView;
  /** The project whose films wait: a tool of the project is addressed through it, a tool of the installation is not. */
  readonly project: string;
}

/** What to run to restore the tool: the login it declares, else what its check says, else a word that it declares neither. */
function Recovery({ wait }: { readonly wait: FilmToolWaitView }) {
  const { t, rich } = useI18n();
  if (wait.loginCommand !== null) return <p>{rich('tools.loginHint', { command: <InlineCommand command={wait.loginCommand} /> })}</p>;
  if (wait.fixCommand !== null) {
    return (
      <p>
        {t('tools.fix')} <InlineCommand command={wait.fixCommand} />
      </p>
    );
  }
  return <p>{t('filmWait.noCommand')}</p>;
}

/**
 * The tool the films of a project wait for: why its check fails, the command that restores it, since when the films wait
 * and when the tool was last checked, with the buttons that check it again and, when it declares a login, log in.
 */
export function FilmToolWaitNotice({ wait, project }: FilmToolWaitNoticeProps) {
  const { t, rich } = useI18n();
  const vocabulary = useVocabulary();
  const toolProject = wait.scope === 'project' ? project : null;
  return (
    <section className="callout callout--waiting" aria-label={t('filmWait.label', { tool: wait.tool })}>
      <KeyRound size={ICON_SIZE} aria-hidden="true" />
      <div className="callout__body">
        <p className="callout__title">{t('filmWait.title', { tool: wait.tool })}</p>
        <p>
          {t('filmWait.status', { status: vocabulary.toolStatus(wait.status) })}
          {wait.detail === '' ? null : <span className="subtle"> {wait.detail}</span>}
        </p>
        <Recovery wait={wait} />
        <p>{t('filmWait.queued')}</p>
        <p className="subtle">{rich('filmWait.since', { when: <Time iso={wait.since} /> })}</p>
        <ReadStamp readAt={wait.checkedAt} kind="tools" verb="checked" />
        <div className="film-wait__actions">
          <CommandButton size="sm" command="tools.check" body={{ project: toolProject, tool: wait.tool }} aria-label={t('tools.checkLabel', { tool: wait.tool })}>
            {t('tools.check')}
          </CommandButton>
          {wait.loginCommand === null ? null : (
            <CommandButton
              size="sm"
              variant="primary"
              icon={<LogIn size={BUTTON_ICON_SIZE} />}
              command="tools.login"
              body={{ project: toolProject, tool: wait.tool }}
              aria-label={t('tools.loginLabel', { tool: wait.tool })}
              title={t('tools.loginHint', { command: wait.loginCommand })}
            >
              {t('tools.login')}
            </CommandButton>
          )}
        </div>
      </div>
    </section>
  );
}
