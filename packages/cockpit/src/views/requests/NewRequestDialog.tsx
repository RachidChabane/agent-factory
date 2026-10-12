import type { ClipboardEvent, DragEvent } from 'react';
import { useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { useCommand, useSnapshot } from '../../app/hooks.ts';
import type { PastedAttachment } from '../../contract/index.ts';
import { Button } from '../../ui/components/Button.tsx';
import { Dialog } from '../../ui/components/Dialog.tsx';
import { Field, TextArea, TextInput } from '../../ui/components/Field.tsx';

const IMAGE_MEDIA_PREFIX = 'image/';
const MAX_ATTACHMENTS = 6;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('unreadable file'))));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('unreadable file')));
    reader.readAsDataURL(file);
  });
}

export async function filesToAttachments(files: readonly File[]): Promise<readonly PastedAttachment[]> {
  const images = files.filter((file) => file.type.startsWith(IMAGE_MEDIA_PREFIX));
  return Promise.all(images.map(async (file) => ({ name: file.name || 'capture.png', mediaType: file.type, dataUrl: await readAsDataUrl(file) })));
}

interface NewRequestDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function NewRequestDialog({ open, onClose }: NewRequestDialogProps) {
  const snapshot = useSnapshot();
  const command = useCommand();
  const [title, setTitle] = useState('');
  const [requester, setRequester] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<readonly PastedAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const addFiles = (files: readonly File[]) => {
    void filesToAttachments(files).then((added) => setAttachments((current) => [...current, ...added].slice(0, MAX_ATTACHMENTS)));
  };
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...event.clipboardData.files];
    if (files.some((file) => file.type.startsWith(IMAGE_MEDIA_PREFIX))) {
      event.preventDefault();
      addFiles(files);
    }
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles([...event.dataTransfer.files]);
  };
  const errors = {
    title: attempted && title.trim().length === 0 ? 'Donnez un titre court à la demande.' : null,
    requester: attempted && requester.trim().length === 0 ? 'Indiquez qui demande.' : null,
    body: attempted && body.trim().length === 0 ? 'Collez le texte de la demande.' : null,
  };
  const reset = () => {
    setTitle('');
    setRequester('');
    setBody('');
    setAttachments([]);
    setAttempted(false);
  };
  const submit = () => {
    setAttempted(true);
    if (title.trim().length === 0 || requester.trim().length === 0 || body.trim().length === 0) return;
    void command
      .run('request.create', { title: title.trim(), requester: requester.trim(), body: body.trim(), attachments: [...attachments] }, 'Demande enregistrée')
      .then((sent) => {
        if (!sent) return;
        reset();
        onClose();
      });
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Nouvelle demande"
      description="Collez la demande telle que reçue, avec ses captures. Le challengeur l’examinera avant toute issue."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" loading={command.pending === 'request.create'} onClick={submit}>
            Enregistrer la demande
          </Button>
        </>
      }
    >
      <div className="new-request__row">
        <Field label="Titre" error={errors.title}>
          {(id, describedBy) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              value={title}
              autoFocus
              placeholder="Ex. : Exporter les briefs en PDF"
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          )}
        </Field>
        <Field label="Demandeur" error={errors.requester}>
          {(id, describedBy) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              value={requester}
              placeholder={snapshot?.factory.operator ?? 'Nom'}
              onChange={(event) => setRequester(event.currentTarget.value)}
            />
          )}
        </Field>
      </div>
      <Field label="Texte de la demande" error={errors.body} hint="Vous pouvez coller des images directement dans ce champ.">
        {(id, describedBy) => (
          <TextArea id={id} aria-describedby={describedBy} rows={7} value={body} onPaste={onPaste} onChange={(event) => setBody(event.currentTarget.value)} />
        )}
      </Field>
      <div
        className={`new-request__drop${dragging ? ' is-dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <ImagePlus size={16} aria-hidden="true" />
        <span>Glissez des captures ici ou</span>
        <label className="new-request__browse link">
          parcourez
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
        <span className="subtle">({attachments.length}/{MAX_ATTACHMENTS})</span>
      </div>
      {attachments.length === 0 ? null : (
        <ul className="new-request__previews" aria-label="Captures jointes">
          {attachments.map((attachment, index) => (
            <li key={`${attachment.name}-${index}`} className="new-request__preview">
              <img src={attachment.dataUrl} alt={attachment.name} />
              <button
                type="button"
                className="new-request__remove"
                aria-label={`Retirer ${attachment.name}`}
                onClick={() => setAttachments((current) => current.filter((_, position) => position !== index))}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
