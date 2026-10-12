import type { ClipboardEvent, DragEvent } from 'react';
import { useReducer, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { useSnapshot } from '../app/hooks.ts';
import type { CommandBody } from '../contract/index.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { Field, Select, TextArea, TextInput } from '../ui/components/Field.tsx';
import { EMPTY_TRAY, holdsImage, MAX_ATTACHMENTS, readFiles, reduceTray } from './attachment-intake.ts';
import type { IntakeProblem } from './attachment-intake.ts';
import { CommandDialog } from './CommandDialog.tsx';

interface NewRequestDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The project the request is for, or the one offered first when the operator may pick. */
  readonly projectId: string | null;
  /** Whether the dialog asks which project the request is for. */
  readonly pickProject: boolean;
}

/** Records a request exactly as the requester wrote it, for one project, with the screenshots pasted into it. */
export function NewRequestDialog({ open, onClose, projectId, pickProject }: NewRequestDialogProps) {
  const { t } = useI18n();
  const snapshot = useSnapshot();
  const operator = snapshot.installation.operator;
  const [chosenProject, setChosenProject] = useState<string | null>(projectId);
  const [title, setTitle] = useState('');
  const [requester, setRequester] = useState(operator);
  const [text, setText] = useState('');
  const [tray, dispatchTray] = useReducer(reduceTray, EMPTY_TRAY);
  const [dragging, setDragging] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const project = pickProject ? (chosenProject ?? projectId ?? snapshot.projects[0]?.id ?? null) : (projectId ?? snapshot.projects[0]?.id ?? null);

  const addFiles = (files: readonly File[]) => {
    void readFiles(files, t('newRequest.defaultAttachmentName')).then((read) => dispatchTray({ kind: 'received', read }));
  };
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...event.clipboardData.files];
    if (holdsImage(files)) {
      event.preventDefault();
      addFiles(files);
    }
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles([...event.dataTransfer.files]);
  };
  const describeProblem = (problem: IntakeProblem): string => {
    switch (problem) {
      case 'not-image':
        return t('newRequest.problemNotImage');
      case 'unreadable':
        return t('newRequest.problemUnreadable');
      case 'too-many':
        return t('newRequest.problemTooMany', { max: MAX_ATTACHMENTS });
    }
  };
  const errors = {
    title: attempted && title.trim().length === 0 ? t('newRequest.errorTitle') : null,
    requester: attempted && requester.trim().length === 0 ? t('newRequest.errorRequester') : null,
    body: attempted && text.trim().length === 0 ? t('newRequest.errorBody') : null,
  };
  const valid = project !== null && title.trim().length > 0 && requester.trim().length > 0 && text.trim().length > 0;
  const body: CommandBody<'request.create'> | null = valid
    ? { project, title: title.trim(), requester: requester.trim(), body: text.trim(), attachments: [...tray.attachments] }
    : null;
  const reset = () => {
    setTitle('');
    setRequester(operator);
    setText('');
    dispatchTray({ kind: 'cleared' });
    setAttempted(false);
  };

  return (
    <CommandDialog
      open={open}
      onClose={onClose}
      size="lg"
      title={t('newRequest.title')}
      description={t('newRequest.description')}
      confirmLabel={t('newRequest.submit')}
      command="request.create"
      body={body}
      onInvalid={() => setAttempted(true)}
      onAccepted={reset}
    >
      <div className="new-request__row">
        {pickProject ? (
          <Field label={t('newRequest.project')}>
            {(id) => (
              <Select id={id} value={project ?? ''} onChange={(event) => setChosenProject(event.currentTarget.value)}>
                {snapshot.projects.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <Field label={t('newRequest.titleField')} error={errors.title}>
          {(id, describedBy) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              value={title}
              autoFocus
              placeholder={t('newRequest.titlePlaceholder')}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          )}
        </Field>
        <Field label={t('newRequest.requester')} error={errors.requester}>
          {(id, describedBy) => <TextInput id={id} aria-describedby={describedBy} value={requester} onChange={(event) => setRequester(event.currentTarget.value)} />}
        </Field>
      </div>
      <Field label={t('newRequest.body')} error={errors.body} hint={t('newRequest.bodyHint')}>
        {(id, describedBy) => <TextArea id={id} aria-describedby={describedBy} rows={7} value={text} onPaste={onPaste} onChange={(event) => setText(event.currentTarget.value)} />}
      </Field>
      <div
        role="group"
        aria-label={t('newRequest.attach')}
        className={`new-request__drop${dragging ? ' is-dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <ImagePlus size={16} aria-hidden="true" />
        <span>{t('newRequest.dropBefore')}</span>
        <label className="new-request__browse link">
          {t('newRequest.browse')}
          <input
            type="file"
            accept="image/*"
            multiple
            className="visually-hidden"
            onChange={(event) => {
              addFiles([...(event.currentTarget.files ?? [])]);
              event.currentTarget.value = '';
            }}
          />
        </label>
        <span className="subtle">{t('newRequest.attachedCount', { count: tray.attachments.length, max: MAX_ATTACHMENTS })}</span>
      </div>
      {tray.problems.length === 0 ? null : (
        <ul className="new-request__problems" role="alert">
          {tray.problems.map((problem) => (
            <li key={problem}>{describeProblem(problem)}</li>
          ))}
        </ul>
      )}
      {tray.attachments.length === 0 ? null : (
        <ul className="new-request__previews" aria-label={t('newRequest.attachments')}>
          {tray.attachments.map((attachment, index) => (
            <li key={`${attachment.name}-${index}`} className="new-request__preview">
              <img src={attachment.dataUrl} alt={attachment.name} />
              <button
                type="button"
                className="new-request__remove"
                aria-label={t('newRequest.removeAttachment', { name: attachment.name })}
                onClick={() => dispatchTray({ kind: 'removed', index })}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </CommandDialog>
  );
}
