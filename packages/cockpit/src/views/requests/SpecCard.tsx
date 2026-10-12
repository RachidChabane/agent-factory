import { useState } from 'react';
import { Link } from 'react-router';
import { Pencil } from 'lucide-react';
import { ISSUE_TYPES } from '@agent-factory/domain';
import { useCommand } from '../../app/hooks.ts';
import type { ProposedSpec } from '../../contract/index.ts';
import { ISSUE_TYPE_LABELS } from '../../i18n/labels.ts';
import { paths } from '../../model/routes.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Button } from '../../ui/components/Button.tsx';
import { Field, Select, TextArea, TextInput } from '../../ui/components/Field.tsx';

const LINE_SEPARATOR = '\n';

function lines(text: string): string[] {
  return text
    .split(LINE_SEPARATOR)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function isIssueType(value: string): value is ProposedSpec['type'] {
  return ISSUE_TYPES.some((type) => type === value);
}

interface SpecCardProps {
  readonly requestId: string;
  readonly spec: ProposedSpec;
  readonly selected: boolean;
  readonly selectable: boolean;
  readonly onToggle: (specId: string) => void;
}

export function SpecCard({ requestId, spec, selected, selectable, onToggle }: SpecCardProps) {
  const command = useCommand();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    title: spec.title,
    type: spec.type,
    need: spec.need,
    criteria: spec.acceptanceCriteria.join(LINE_SEPARATOR),
    outOfScope: spec.outOfScope.join(LINE_SEPARATOR),
    expectedProof: spec.expectedProof,
  });
  const valid = draft.title.trim().length > 0 && draft.need.trim().length > 0 && lines(draft.criteria).length > 0 && draft.expectedProof.trim().length > 0;
  const save = () => {
    if (!valid) return;
    void command
      .run(
        'request.update-spec',
        {
          requestId,
          specId: spec.id,
          spec: {
            title: draft.title.trim(),
            type: draft.type,
            need: draft.need.trim(),
            acceptanceCriteria: lines(draft.criteria),
            outOfScope: lines(draft.outOfScope),
            expectedProof: draft.expectedProof.trim(),
          },
        },
        'Spec mise à jour',
      )
      .then((saved) => {
        if (saved) setEditing(false);
      });
  };
  if (editing) {
    return (
      <form
        className="spec-card spec-card--editing"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        aria-label={`Modifier la spec ${spec.title}`}
      >
        <div className="spec-card__edit-row">
          <Field label="Titre">
            {(id) => <TextInput id={id} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.currentTarget.value })} />}
          </Field>
          <Field label="Type">
            {(id) => (
              <Select
                id={id}
                value={draft.type}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  if (isIssueType(value)) setDraft({ ...draft, type: value });
                }}
              >
                {ISSUE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {ISSUE_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Besoin">{(id) => <TextArea id={id} rows={2} value={draft.need} onChange={(event) => setDraft({ ...draft, need: event.currentTarget.value })} />}</Field>
        <Field label="Critères d’acceptation" hint="Un critère observable par ligne.">
          {(id, describedBy) => (
            <TextArea id={id} aria-describedby={describedBy} rows={4} value={draft.criteria} onChange={(event) => setDraft({ ...draft, criteria: event.currentTarget.value })} />
          )}
        </Field>
        <Field label="Hors périmètre" hint="Un élément par ligne.">
          {(id, describedBy) => (
            <TextArea id={id} aria-describedby={describedBy} rows={2} value={draft.outOfScope} onChange={(event) => setDraft({ ...draft, outOfScope: event.currentTarget.value })} />
          )}
        </Field>
        <Field label="Preuve attendue">
          {(id) => <TextArea id={id} rows={2} value={draft.expectedProof} onChange={(event) => setDraft({ ...draft, expectedProof: event.currentTarget.value })} />}
        </Field>
        <div className="spec-card__edit-actions">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Annuler
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={!valid} loading={command.pending === 'request.update-spec'}>
            Enregistrer la spec
          </Button>
        </div>
      </form>
    );
  }
  return (
    <article className={`spec-card${selected ? ' is-selected' : ''}`}>
      <header className="spec-card__header">
        {selectable ? (
          <input type="checkbox" className="spec-card__check" checked={selected} onChange={() => onToggle(spec.id)} aria-label={`Retenir la spec ${spec.title}`} />
        ) : null}
        <h4 className="spec-card__title">{spec.title}</h4>
        <Badge>{ISSUE_TYPE_LABELS[spec.type]}</Badge>
        {spec.issueNumber === null ? null : (
          <Link to={paths.issue(spec.issueNumber)} className="spec-card__issue">
            <Badge tone="success">issue #{spec.issueNumber}</Badge>
          </Link>
        )}
        {selectable ? <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setEditing(true)} aria-label={`Modifier la spec ${spec.title}`} /> : null}
      </header>
      <p className="spec-card__need">{spec.need}</p>
      <ol className="numbered spec-card__criteria">
        {spec.acceptanceCriteria.map((criterion) => (
          <li key={criterion}>{criterion}</li>
        ))}
      </ol>
      <dl className="spec-card__facts">
        <div>
          <dt>Hors périmètre</dt>
          <dd>{spec.outOfScope.length === 0 ? '—' : spec.outOfScope.join(' · ')}</dd>
        </div>
        <div>
          <dt>Preuve attendue</dt>
          <dd>{spec.expectedProof}</dd>
        </div>
      </dl>
    </article>
  );
}
