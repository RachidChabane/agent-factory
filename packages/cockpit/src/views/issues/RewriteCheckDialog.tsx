import { useState } from 'react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { CommandBody, IssueView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { frozenChecks } from '../../model/actions.ts';
import { Field, Select, TextArea } from '../../ui/components/Field.tsx';
import { CommandDialog } from '../../widgets/CommandDialog.tsx';

const INSTRUCTION_ROWS = 4;

interface RewriteCheckDialogProps {
  readonly issue: Pick<IssueView, 'number' | 'checks'>;
  readonly onClose: () => void;
}

export function RewriteCheckDialog({ issue, onClose }: RewriteCheckDialogProps) {
  const { t } = useI18n();
  const project = useProject();
  const frozen = frozenChecks(issue);
  const [chosen, setChosen] = useState(frozen[0]?.path ?? '');
  const [instruction, setInstruction] = useState('');
  const [attempted, setAttempted] = useState(false);
  const path = frozen.some((check) => check.path === chosen) ? chosen : (frozen[0]?.path ?? '');
  const trimmed = instruction.trim();
  const body: CommandBody<'issue.rewrite-check'> | null = path.length === 0 || trimmed.length === 0 ? null : { project: project.id, issueNumber: issue.number, path, instruction: trimmed };
  return (
    <CommandDialog
      open
      onClose={onClose}
      command="issue.rewrite-check"
      body={body}
      onInvalid={() => setAttempted(true)}
      title={t('issues.rewrite.title')}
      description={t('issues.rewrite.description')}
      confirmLabel={t('issues.rewrite.confirm')}
    >
      <Field label={t('issues.rewrite.check')}>
        {(id) => (
          <Select id={id} value={path} onChange={(event) => setChosen(event.currentTarget.value)}>
            {frozen.map((check) => (
              <option key={check.path} value={check.path}>
                {check.path}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t('issues.rewrite.instruction')} hint={t('issues.rewrite.instructionHint')} error={attempted && trimmed.length === 0 ? t('issues.rewrite.errorInstruction') : null}>
        {(id, describedBy) => (
          <TextArea
            id={id}
            aria-describedby={describedBy}
            rows={INSTRUCTION_ROWS}
            placeholder={t('issues.rewrite.instructionPlaceholder')}
            value={instruction}
            onChange={(event) => setInstruction(event.currentTarget.value)}
          />
        )}
      </Field>
    </CommandDialog>
  );
}
