import { useState } from 'react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { AuditView, CommandBody } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { shortSha } from '../../model/identifiers.ts';
import { Field, TextArea } from '../../ui/components/Field.tsx';
import { CommandDialog } from '../../widgets/CommandDialog.tsx';

const NOTE_ROWS = 3;

interface ResolveDialogProps {
  readonly audit: Pick<AuditView, 'id' | 'commitSha'>;
  readonly onClose: () => void;
}

/** Records that an audit was dealt with, and how: the note is mandatory and stays with the audit. */
export function ResolveDialog({ audit, onClose }: ResolveDialogProps) {
  const { t } = useI18n();
  const project = useProject();
  const [note, setNote] = useState('');
  const [attempted, setAttempted] = useState(false);
  const trimmed = note.trim();
  const body: CommandBody<'audit.resolve'> | null = trimmed.length === 0 ? null : { project: project.id, auditId: audit.id, note: trimmed };
  return (
    <CommandDialog
      open
      onClose={onClose}
      command="audit.resolve"
      body={body}
      onInvalid={() => setAttempted(true)}
      title={t('audits.resolve.title', { commit: shortSha(audit.commitSha) })}
      description={t('audits.resolve.description')}
      confirmLabel={t('audits.resolve.confirm')}
    >
      <Field label={t('audits.resolve.note')} error={attempted && body === null ? t('audits.resolve.errorNote') : null}>
        {(id, describedBy) => (
          <TextArea
            id={id}
            aria-describedby={describedBy}
            rows={NOTE_ROWS}
            placeholder={t('audits.resolve.notePlaceholder')}
            value={note}
            autoFocus
            onChange={(event) => setNote(event.currentTarget.value)}
          />
        )}
      </Field>
    </CommandDialog>
  );
}
