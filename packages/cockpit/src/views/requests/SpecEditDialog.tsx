import { useState } from 'react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { CommandBody, ProposedSpec, RequestView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { Field, Select, TextArea, TextInput } from '../../ui/components/Field.tsx';
import { CommandDialog } from '../../widgets/CommandDialog.tsx';
import type { SpecForm } from './spec-form.ts';
import { specDraftOf, specFormGaps, specFormOf } from './spec-form.ts';

const NEED_ROWS = 3;
const CRITERIA_ROWS = 5;
const OUT_OF_SCOPE_ROWS = 3;
const PROOF_ROWS = 3;

interface SpecEditDialogProps {
  readonly request: Pick<RequestView, 'id'>;
  readonly spec: ProposedSpec;
  readonly onClose: () => void;
}

/** Rewrites a proposed spec before it becomes an issue. The type offered are the project's own, with the spec's current one kept even when the project dropped it. */
export function SpecEditDialog({ request, spec, onClose }: SpecEditDialogProps) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const project = useProject();
  const [form, setForm] = useState<SpecForm>(() => specFormOf(spec));
  const [attempted, setAttempted] = useState(false);
  const gaps = specFormGaps(form);
  const draft = specDraftOf(form);
  const body: CommandBody<'request.update-spec'> | null = draft === null ? null : { project: project.id, requestId: request.id, specId: spec.id, spec: draft };
  const typeIds = project.issueTypes.some((type) => type.id === form.type) ? project.issueTypes.map((type) => type.id) : [form.type, ...project.issueTypes.map((type) => type.id)];
  const change = (patch: Partial<SpecForm>) => setForm((current) => ({ ...current, ...patch }));
  return (
    <CommandDialog
      open
      onClose={onClose}
      size="lg"
      command="request.update-spec"
      body={body}
      onInvalid={() => setAttempted(true)}
      title={t('requests.spec.edit.title')}
      description={t('requests.spec.edit.description')}
      confirmLabel={t('requests.spec.edit.save')}
    >
      <div className="spec-edit__row">
        <Field label={t('requests.spec.field.title')} error={attempted && gaps.title ? t('requests.spec.error.title') : null}>
          {(id, describedBy) => <TextInput id={id} aria-describedby={describedBy} value={form.title} autoFocus onChange={(event) => change({ title: event.currentTarget.value })} />}
        </Field>
        <Field label={t('requests.spec.field.type')}>
          {(id) => (
            <Select id={id} value={form.type} onChange={(event) => change({ type: event.currentTarget.value })}>
              {typeIds.map((type) => (
                <option key={type} value={type}>
                  {vocabulary.issueType(type)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label={t('issues.spec.need')} error={attempted && gaps.need ? t('requests.spec.error.need') : null}>
        {(id, describedBy) => <TextArea id={id} aria-describedby={describedBy} rows={NEED_ROWS} value={form.need} onChange={(event) => change({ need: event.currentTarget.value })} />}
      </Field>
      <Field label={t('issues.spec.criteria')} hint={t('requests.spec.field.criteriaHint')} error={attempted && gaps.criteria ? t('requests.spec.error.criteria') : null}>
        {(id, describedBy) => <TextArea id={id} aria-describedby={describedBy} rows={CRITERIA_ROWS} value={form.criteria} onChange={(event) => change({ criteria: event.currentTarget.value })} />}
      </Field>
      <Field label={t('issues.spec.outOfScope')} hint={t('requests.spec.field.outOfScopeHint')}>
        {(id, describedBy) => <TextArea id={id} aria-describedby={describedBy} rows={OUT_OF_SCOPE_ROWS} value={form.outOfScope} onChange={(event) => change({ outOfScope: event.currentTarget.value })} />}
      </Field>
      <Field label={t('issues.spec.proof')} error={attempted && gaps.expectedProof ? t('requests.spec.error.proof') : null}>
        {(id, describedBy) => <TextArea id={id} aria-describedby={describedBy} rows={PROOF_ROWS} value={form.expectedProof} onChange={(event) => change({ expectedProof: event.currentTarget.value })} />}
      </Field>
    </CommandDialog>
  );
}
