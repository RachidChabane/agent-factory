import { useState } from 'react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { CommandBody, RequestView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Field, TextArea } from '../../ui/components/Field.tsx';
import { CommandDialog } from '../../widgets/CommandDialog.tsx';

const REASON_ROWS = 3;

interface DeclineDialogProps {
  readonly request: Pick<RequestView, 'id'>;
  readonly onClose: () => void;
}

export function DeclineDialog({ request, onClose }: DeclineDialogProps) {
  const { t } = useI18n();
  const project = useProject();
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const trimmed = reason.trim();
  const body: CommandBody<'request.decline'> | null = trimmed.length === 0 ? null : { project: project.id, requestId: request.id, reason: trimmed };
  return (
    <CommandDialog
      open
      onClose={onClose}
      command="request.decline"
      body={body}
      onInvalid={() => setAttempted(true)}
      title={t('requests.decline.title', { id: request.id })}
      description={t('requests.decline.description')}
      confirmLabel={t('requests.decline.confirm')}
      tone="danger"
    >
      <Field label={t('requests.decline.reason')} error={attempted && body === null ? t('requests.decline.errorReason') : null}>
        {(id, describedBy) => <TextArea id={id} aria-describedby={describedBy} rows={REASON_ROWS} value={reason} autoFocus onChange={(event) => setReason(event.currentTarget.value)} />}
      </Field>
    </CommandDialog>
  );
}
