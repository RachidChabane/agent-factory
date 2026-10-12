import { useId, useState } from 'react';
import { Archive, CircleCheck, FilePen, Pause, Play, RotateCcw } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { CommandBody, IssueView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { canAbandonIssue, canPauseIssue, canResumeEscalation, canResumePausedIssue, canRewriteCheck, canValidateSpec } from '../../model/actions.ts';
import { Button } from '../../ui/components/Button.tsx';
import { CommandButton } from '../../widgets/CommandButton.tsx';
import { AbandonDialog } from './AbandonDialog.tsx';
import { startAvailability } from './issue-model.ts';
import { RewriteCheckDialog } from './RewriteCheckDialog.tsx';

const ICON_SIZE = 14;

type IssueRef = CommandBody<'issue.start'>;
type DialogName = 'rewrite' | 'abandon';

function StartAction({ issue, target }: { readonly issue: IssueView; readonly target: IssueRef }) {
  const { t, fmt } = useI18n();
  const { issues } = useProject();
  const hintId = useId();
  const start = startAvailability(issue, issues);
  if (start.kind === 'unavailable') return null;
  const waiting = start.kind === 'waiting';
  return (
    <>
      <CommandButton command="issue.start" body={target} variant="primary" icon={<Play size={ICON_SIZE} />} disabled={waiting} aria-describedby={waiting ? hintId : undefined}>
        {t('issues.action.start')}
      </CommandButton>
      {waiting ? (
        <span id={hintId} className="issue-actions__hint">
          {t('issues.action.startWaiting', { issues: fmt.list(start.on.map((dependency) => `#${dependency.number}`)) })}
        </span>
      ) : null}
    </>
  );
}

function ResumeAction({ issue, target }: { readonly issue: IssueView; readonly target: IssueRef }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const escalated = canResumeEscalation(issue);
  if (!escalated && !canResumePausedIssue(issue)) return null;
  const label = escalated && issue.resumeTarget !== null ? t('issues.action.resumeEscalation', { state: vocabulary.issueState(issue.resumeTarget) }) : t('issues.action.resume');
  return (
    <CommandButton command="issue.resume" body={target} variant={escalated ? 'primary' : 'secondary'} icon={<RotateCcw size={ICON_SIZE} />}>
      {label}
    </CommandButton>
  );
}

export function IssueActions({ issue }: { readonly issue: IssueView }) {
  const { t } = useI18n();
  const project = useProject();
  const [dialog, setDialog] = useState<DialogName | null>(null);
  const target: IssueRef = { project: project.id, issueNumber: issue.number };
  const close = () => setDialog(null);
  return (
    <>
      {canValidateSpec(issue) ? (
        <CommandButton command="issue.validate-spec" body={target} variant="primary" icon={<CircleCheck size={ICON_SIZE} />}>
          {t('issues.action.validate')}
        </CommandButton>
      ) : null}
      <StartAction issue={issue} target={target} />
      <ResumeAction issue={issue} target={target} />
      {canPauseIssue(issue) ? (
        <CommandButton
          command="issue.pause"
          body={target}
          icon={<Pause size={ICON_SIZE} />}
          confirm={{ title: t('issues.pause.title', { number: issue.number }), description: t('issues.pause.description'), confirmLabel: t('issues.pause.confirm') }}
        >
          {t('issues.action.pause')}
        </CommandButton>
      ) : null}
      {canRewriteCheck(issue) ? (
        <Button icon={<FilePen size={ICON_SIZE} />} onClick={() => setDialog('rewrite')}>
          {t('issues.action.rewrite')}
        </Button>
      ) : null}
      {canAbandonIssue(issue) ? (
        <Button icon={<Archive size={ICON_SIZE} />} onClick={() => setDialog('abandon')}>
          {t('issues.action.abandon')}
        </Button>
      ) : null}
      {dialog === 'rewrite' ? <RewriteCheckDialog issue={issue} onClose={close} /> : null}
      {dialog === 'abandon' ? <AbandonDialog issue={issue} onClose={close} /> : null}
    </>
  );
}
