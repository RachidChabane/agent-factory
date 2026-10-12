import type { LogEntry } from '../../data/run-log-entries.ts';
import { clockTime } from '../../format/format.ts';
import { GATE_STEP_OUTCOME_LABELS } from '../../i18n/labels.ts';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { gateHistory } from './run-log-model.ts';

const STEP_MARKS = { passed: 'success', failed: 'failed', skipped: 'idle' } as const;

export function GatePanel({ entries }: { readonly entries: readonly LogEntry[] }) {
  const history = gateHistory(entries);
  if (history.length === 0) {
    return <EmptyState compact title="Le gate n’a pas encore tourné" description="Le hook Stop exécute le gate déterministe avant que l’agent puisse terminer." />;
  }
  return (
    <ol className="gate-history">
      {history.toReversed().map((gate, position) => (
        <li key={gate.index} className={`gate-run${gate.passed ? ' is-passed' : ' is-failed'}`}>
          <header className="gate-run__header">
            <StatusMark mark={gate.passed ? 'success' : 'failed'} />
            <span className="gate-run__title">
              {position === 0 ? 'Dernier passage' : `Passage ${history.length - position}`} · {gate.passed ? 'réussi' : 'en échec'}
            </span>
            <time className="gate-run__time num" dateTime={gate.at}>
              {clockTime(gate.at)}
            </time>
          </header>
          <ul className="gate-run__steps">
            {gate.steps.map((step) => (
              <li key={step.name} className="gate-run__step">
                <StatusMark mark={STEP_MARKS[step.outcome]} size={14} />
                <span className="gate-run__step-name mono">{step.name}</span>
                <span className={`gate-run__step-outcome gate-run__step-outcome--${step.outcome}`}>{GATE_STEP_OUTCOME_LABELS[step.outcome]}</span>
                {step.outcome === 'failed' ? <span className="gate-run__step-detail">{step.detail}</span> : null}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
