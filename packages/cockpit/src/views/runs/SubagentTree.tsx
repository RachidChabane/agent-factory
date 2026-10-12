import { useMemo } from 'react';
import { Bot, SquareTerminal } from 'lucide-react';
import type { RunLogView } from '../../data/run-log-store.ts';
import { toEpoch } from '../../i18n/formatters.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import type { StatusMark as StatusMarkKind } from '../../model/status.ts';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import type { SubagentNode } from './run-log-model.ts';
import { buildSubagentTree } from './run-log-model.ts';

const ICON_SIZE = 14;
const SUBAGENT_MARKS: Readonly<Record<SubagentNode['status'], StatusMarkKind>> = { running: 'running', done: 'success', failed: 'failed' };

function SubagentItem({ node, now }: { readonly node: SubagentNode; readonly now: number }) {
  const { t, fmt } = useI18n();
  const vocabulary = useVocabulary();
  const elapsed = fmt.duration((node.endedAt === null ? now : toEpoch(node.endedAt)) - toEpoch(node.startedAt));
  return (
    <li className="subagent">
      <div className="subagent__row">
        <StatusMark mark={SUBAGENT_MARKS[node.status]} size={ICON_SIZE} label={vocabulary.subagentStatus(node.status)} />
        <Bot size={ICON_SIZE} aria-hidden="true" className="subagent__icon" />
        <span className="subagent__title">{node.description}</span>
        <span className="subagent__type mono">{node.agentType}</span>
        <span className="subagent__meta num">
          {t('runs.subagents.toolCalls', { count: node.toolCalls })} · {elapsed}
        </span>
      </div>
      {node.lastText === null ? null : <p className="subagent__text">{node.lastText}</p>}
      {node.children.length === 0 ? null : (
        <ul className="subagent__children">
          {node.children.map((child) => (
            <SubagentItem key={child.toolUseId} node={child} now={now} />
          ))}
        </ul>
      )}
    </li>
  );
}

interface SubagentTreeProps {
  readonly log: RunLogView;
  readonly now: number;
}

/** The agents the main agent started, with the tool calls each one made and the last thing it said. */
export function SubagentTree({ log, now }: SubagentTreeProps) {
  const { t } = useI18n();
  const tree = useMemo(() => buildSubagentTree(log.entries), [log]);
  if (tree.length === 0) return <EmptyState compact title={t('runs.subagents.empty')} description={t('runs.subagents.emptyDescription')} />;
  return (
    <div className="subagent-tree">
      <div className="subagent-tree__root">
        <SquareTerminal size={ICON_SIZE} aria-hidden="true" />
        <span>{t('runs.subagents.session')}</span>
      </div>
      <ul className="subagent-tree__list" aria-label={t('runs.subagents.list')}>
        {tree.map((node) => (
          <SubagentItem key={node.toolUseId} node={node} now={now} />
        ))}
      </ul>
    </div>
  );
}
