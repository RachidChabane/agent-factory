import { useMemo } from 'react';
import type { RunLogView } from '../../data/run-log-store.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { Time } from '../../widgets/Time.tsx';
import { gateHistory, gateStepMark } from './run-log-model.ts';

const MARK_SIZE = 14;

/** Every pass of the completion gate the agent went through, the latest first, with each step and what the steps that did not pass said. */
export function GatePanel({ log }: { readonly log: RunLogView }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const history = useMemo(() => gateHistory(log.entries), [log]);
  if (history.length === 0) return <EmptyState compact title={t('runs.gate.empty')} description={t('runs.gate.emptyDescription')} />;
  return (
    <ol className="gate-history" aria-label={t('runs.gate.list')}>
      {history.toReversed().map((gate, position) => (
        <li key={gate.index} className={`gate-run${gate.passed ? ' is-passed' : ' is-failed'}`}>
          <header className="gate-run__header">
            <StatusMark mark={gate.passed ? 'success' : 'failed'} />
            <span className="gate-run__title">{position === 0 ? t('runs.gate.latest') : t('runs.gate.pass', { number: history.length - position })}</span>
            <Badge tone={gate.passed ? 'success' : 'failed'}>{vocabulary.gateStepOutcome(gate.passed ? 'passed' : 'failed')}</Badge>
            <Time iso={gate.at} mode="time" className="gate-run__time num" />
          </header>
          <ul className="gate-run__steps" aria-label={t('runs.gate.steps')}>
            {gate.steps.map((step) => (
              <li key={step.name} className="gate-run__step">
                <StatusMark mark={gateStepMark(step.outcome)} size={MARK_SIZE} label={vocabulary.gateStepOutcome(step.outcome)} />
                <span className="gate-run__step-name mono">{step.name}</span>
                <span className={`gate-run__step-outcome gate-run__step-outcome--${step.outcome}`}>{vocabulary.gateStepOutcome(step.outcome)}</span>
                {step.outcome === 'passed' ? null : <span className="gate-run__step-detail">{step.detail}</span>}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
