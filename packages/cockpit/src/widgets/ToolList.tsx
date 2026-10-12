import { useMemo } from 'react';
import { LogIn } from 'lucide-react';
import { useCommand } from '../app/hooks.ts';
import type { ToolSessionView, ToolView } from '../contract/index.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { useVocabulary } from '../i18n/vocabulary.ts';
import { toolMark } from '../model/status.ts';
import { Badge } from '../ui/components/Badge.tsx';
import { Button } from '../ui/components/Button.tsx';
import { Card } from '../ui/components/Card.tsx';
import { InlineCommand } from '../ui/components/CodeBlock.tsx';
import { EmptyState } from '../ui/components/EmptyState.tsx';
import { StatusMark } from '../ui/components/StatusMark.tsx';
import { ReadStamp } from './ReadStamp.tsx';
import { Time } from './Time.tsx';

const MINUTE_MS = 60_000;

interface ToolListProps {
  readonly tools: readonly ToolView[];
  /** The project the tools belong to, or null for the installation's own tools. */
  readonly project: string | null;
}

function SessionLine({ label, session, none }: { readonly label: string; readonly session: ToolSessionView | null; readonly none: string }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  return (
    <p className="tool-row__session">
      <span className="tool-row__fix-label">{label}</span>{' '}
      {session === null ? (
        <span className="subtle">{none}</span>
      ) : (
        <>
          <Badge tone={session.outcome === 'succeeded' ? 'success' : 'failed'}>{vocabulary.toolSessionOutcome(session.outcome)}</Badge> <Time iso={session.at} />{' '}
          <span className="subtle">{t('tools.session.by', { operator: session.operator })}</span>
          {session.detail.length === 0 ? null : <span className="tool-row__session-detail subtle"> · {session.detail}</span>}
        </>
      )}
    </p>
  );
}

/** What the tool's login and its scheduled keep-alive did last; nothing is said for a tool that declares neither. */
function ToolSessions({ tool }: { readonly tool: ToolView }) {
  const { t, rich, fmt } = useI18n();
  return (
    <>
      {tool.loginCommand === null ? null : (
        <>
          <SessionLine label={t('tools.lastLogin')} session={tool.lastLogin} none={t('tools.lastLogin.none')} />
          <p className="tool-row__install subtle">{rich('tools.loginHint', { command: <code className="mono">{tool.loginCommand}</code> })}</p>
        </>
      )}
      {tool.keepAlive === null ? null : (
        <>
          <p className="tool-row__session">
            <span className="tool-row__fix-label">{t('tools.keepAlive')}</span>{' '}
            {rich('tools.keepAlive.every', { command: <code className="mono">{tool.keepAlive.command}</code>, interval: fmt.duration(tool.keepAlive.everyMinutes * MINUTE_MS) })}
          </p>
          <SessionLine label={t('tools.keepAlive.last')} session={tool.keepAlive.last} none={t('tools.keepAlive.none')} />
        </>
      )}
    </>
  );
}

function ToolRow({ tool, project }: { readonly tool: ToolView; readonly project: string | null }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const runner = useCommand();
  const pending = runner.pending === 'tools.check';
  const loggingIn = runner.pending === 'tools.login';
  const statusLabel = tool.status === null ? t('tools.neverChecked') : vocabulary.toolStatus(tool.status);
  return (
    <li className="tool-row" aria-label={tool.name}>
      <div className="tool-row__identity">
        <span className="tool-row__name mono">{tool.name}</span>
        <span className="tool-row__status">
          <StatusMark mark={toolMark(tool.status)} label={statusLabel} />
          {statusLabel}
        </span>
        <Badge tone="neutral">{tool.builtIn ? t('tools.builtIn') : t('tools.declared')}</Badge>
        <span className="tool-row__version mono">{tool.version ?? t('tools.noVersion')}</span>
      </div>
      <div className="tool-row__body">
        {tool.description === null ? null : <p className="tool-row__description">{tool.description}</p>}
        <p className="tool-row__detail">{tool.detail ?? t('tools.noResult')}</p>
        {tool.checkedAt === null ? null : <ReadStamp readAt={tool.checkedAt} kind="tools" verb="checked" />}
        {tool.fixCommand === null ? null : (
          <div className="tool-row__fix">
            <span className="tool-row__fix-label">{t('tools.fix')}</span>
            <InlineCommand command={tool.fixCommand} />
          </div>
        )}
        <ToolSessions tool={tool} />
        {tool.installHint === null ? null : (
          <p className="tool-row__install">
            <span className="tool-row__fix-label">{t('tools.install')}</span> {tool.installHint}
          </p>
        )}
      </div>
      <div className="tool-row__action">
        <Button size="sm" aria-label={t('tools.checkLabel', { tool: tool.name })} loading={pending} onClick={() => void runner.run('tools.check', { project, tool: tool.name })}>
          {t('tools.check')}
        </Button>
        {tool.loginCommand === null ? null : (
          <Button
            size="sm"
            variant="primary"
            icon={<LogIn size={13} />}
            aria-label={t('tools.loginLabel', { tool: tool.name })}
            title={t('tools.loginHint', { command: tool.loginCommand })}
            loading={loggingIn}
            onClick={() => void runner.run('tools.login', { project, tool: tool.name })}
          >
            {t('tools.login')}
          </Button>
        )}
      </div>
    </li>
  );
}

/** The tools an installation or a project depends on, each with its last check and a button that checks it again. */
export function ToolList({ tools, project }: ToolListProps) {
  const { t } = useI18n();
  const connected = useMemo(() => tools.filter((tool) => tool.status === 'connected').length, [tools]);
  if (tools.length === 0) return <EmptyState compact title={t('tools.empty')} />;
  return (
    <Card padded={false}>
      <p className="tool-list__summary">{t('tools.connectedCount', { connected, total: tools.length })}</p>
      <ul className="tool-list">
        {tools.map((tool) => (
          <ToolRow key={tool.name} tool={tool} project={project} />
        ))}
      </ul>
    </Card>
  );
}
