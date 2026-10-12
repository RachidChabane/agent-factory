import { useState } from 'react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { CommandBody, IssueView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Field, TextArea } from '../../ui/components/Field.tsx';
import { CommandDialog } from '../../widgets/CommandDialog.tsx';

const REASON_ROWS = 3;

interface AbandonDialogProps {
  readonly issue: Pick<IssueView, 'number'>;
  readonly onClose: () => void;
}

export function AbandonDialog({ issue, onClose }: AbandonDialogProps) {
  const { t } = useI18n();
  const project = useProject();
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const trimmed = reason.trim();
  const body: CommandBody<'issue.abandon'> | null = trimmed.length === 0 ? null : { project: project.id, issueNumber: issue.number, reason: trimmed };
  return (
    <CommandDialog
      open
      onClose={onClose}
      command="issue.abandon"
      body={body}
      onInvalid={() => setAttempted(true)}
      title={t('issues.abandon.title', { number: issue.number })}
      description={t('issues.abandon.description')}
      confirmLabel={t('issues.abandon.confirm')}
      tone="danger"
    >
      <Field label={t('issues.abandon.reason')} hint={t('issues.abandon.reasonHint')} error={attempted && body === null ? t('issues.abandon.errorReason') : null}>
        {(id, describedBy) => (
          <TextArea
            id={id}
            aria-describedby={describedBy}
            rows={REASON_ROWS}
            placeholder={t('issues.abandon.reasonPlaceholder')}
            value={reason}
            autoFocus
            onChange={(event) => setReason(event.currentTarget.value)}
          />
        )}
      </Field>
    </CommandDialog>
  );
}
