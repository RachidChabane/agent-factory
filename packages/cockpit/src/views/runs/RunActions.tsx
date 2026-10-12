import { RotateCcw, Square } from 'lucide-react';
import type { RunView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import type { SubjectReference } from '../../model/subjects.ts';
import { CommandButton } from '../../widgets/CommandButton.tsx';
import { canResumeRun, canStopRun, isIssueRun } from './run-model.ts';

const ICON_SIZE = 14;
const STOP_ICON_SIZE = 13;

interface RunActionsProps {
  readonly run: RunView;
  readonly subject: SubjectReference;
}

/** Stopping a run asks first, since it interrupts the agent; resuming offers itself only where the factory can resume. */
export function RunActions({ run, subject }: RunActionsProps) {
  const { t } = useI18n();
  const body = { runId: run.id };
  return (
    <>
      {canResumeRun(run) ? (
        <CommandButton command="run.resume" body={body} variant="secondary" icon={<RotateCcw size={ICON_SIZE} />} title={t('runs.action.resumeHint', { subject: subject.reference })}>
          {t('runs.action.resume')}
        </CommandButton>
      ) : null}
      {canStopRun(run) ? (
        <CommandButton
          command="run.stop"
          body={body}
          variant="danger"
          icon={<Square size={STOP_ICON_SIZE} />}
          confirm={{
            title: t('runs.stop.title'),
            description: isIssueRun(run) ? t('runs.stop.issue', { subject: subject.reference }) : t('runs.stop.other'),
            confirmLabel: t('runs.stop.confirm'),
            tone: 'danger',
          }}
        >
          {t('runs.action.stop')}
        </CommandButton>
      ) : null}
    </>
  );
}
