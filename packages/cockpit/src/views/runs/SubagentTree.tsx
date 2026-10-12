import { Bot, SquareTerminal } from 'lucide-react';
import type { LogEntry } from '../../data/run-log-entries.ts';
import { duration, toEpoch } from '../../format/format.ts';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import type { SubagentNode } from './run-log-model.ts';
import { buildSubagentTree } from './run-log-model.ts';

const NODE_MARKS = { running: 'running', done: 'success', failed: 'failed' } as const;

function Node({ node, now }: { readonly node: SubagentNode; readonly now: number }) {
  const elapsed = duration((node.endedAt === null ? now : toEpoch(node.endedAt)) - toEpoch(node.startedAt));
  return (
    <li className="subagent">
      <div className="subagent__row">
        <StatusMark mark={NODE_MARKS[node.status]} size={14} />
        <Bot size={14} aria-hidden="true" className="subagent__icon" />
        <span className="subagent__title truncate">{node.description}</span>
        <span className="subagent__type mono">{node.agentType}</span>
        <span className="subagent__meta num">
          {node.toolCalls} outils · {elapsed}
        </span>
      </div>
      {node.lastText === null ? null : <p className="subagent__text">{node.lastText}</p>}
      {node.children.length === 0 ? null : (
        <ul className="subagent__children">
          {node.children.map((child) => (
            <Node key={child.toolUseId} node={child} now={now} />
          ))}
        </ul>
      )}
    </li>
  );
}

interface SubagentTreeProps {
  readonly entries: readonly LogEntry[];
  readonly now: number;
  readonly sessionLabel: string;
}

export function SubagentTree({ entries, now, sessionLabel }: SubagentTreeProps) {
  const tree = buildSubagentTree(entries);
  return (
    <div className="subagent-tree">
      <div className="subagent-tree__root">
        <SquareTerminal size={14} aria-hidden="true" />
        <span>{sessionLabel}</span>
      </div>
      {tree.length === 0 ? (
        <EmptyState compact title="Aucun sous-agent" description="Les sous-agents lancés par l’agent apparaîtront ici avec leurs outils." />
      ) : (
        <ul className="subagent-tree__list">
          {tree.map((node) => (
            <Node key={node.toolUseId} node={node} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}
