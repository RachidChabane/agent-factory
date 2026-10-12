import { CircleAlert, CircleCheck } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { LogRowFrame } from './LogRowFrame.tsx';
import type { GateEntry } from './run-log-model.ts';
import { gateStepMark } from './run-log-model.ts';

const ICON_SIZE = 13;
const STEP_MARK_SIZE = 12;

/** A pass of the completion gate in the log: how many steps passed, every step by name, and what the failed ones said. */
export function GateEntryRow({ entry }: { readonly entry: GateEntry }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const passedCount = entry.steps.filter((step) => step.outcome === 'passed').length;
  const failedSteps = entry.steps.filter((step) => step.outcome === 'failed');
  return (
    <LogRowFrame entry={entry} icon={entry.passed ? <CircleCheck size={ICON_SIZE} /> : <CircleAlert size={ICON_SIZE} />} tone={entry.passed ? 'success' : 'failed'}>
      <p className="log-gate__title">{t(entry.passed ? 'runs.log.gate.passed' : 'runs.log.gate.failed', { passed: passedCount, count: entry.steps.length })}</p>
      <ul className="log-gate__steps">
        {entry.steps.map((step) => (
          <li key={step.name} className={`log-gate__step log-gate__step--${step.outcome}`}>
            <StatusMark mark={gateStepMark(step.outcome)} size={STEP_MARK_SIZE} label={vocabulary.gateStepOutcome(step.outcome)} />
            {step.name}
          </li>
        ))}
      </ul>
      {failedSteps.map((step) => (
        <p key={step.name} className="log-gate__detail mono">
          {step.name}: {step.detail}
        </p>
      ))}
    </LogRowFrame>
  );
}
