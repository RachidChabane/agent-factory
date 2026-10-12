import type { FormEvent } from 'react';
import { useState } from 'react';
import { useCommand } from '../../app/hooks.ts';
import type { CostCaps } from '../../contract/index.ts';
import { Button } from '../../ui/components/Button.tsx';
import { Card } from '../../ui/components/Card.tsx';
import { Field, TextInput } from '../../ui/components/Field.tsx';
import type { CapsDraft, CapsField } from './costs-model.ts';
import { draftFromCaps, MAX_PAUSE_PERCENT, MIN_PAUSE_PERCENT, parseCaps, sameDraft } from './costs-model.ts';

const SUCCESS_MESSAGE = 'Plafonds mis à jour';

interface FieldSpec {
  readonly id: CapsField;
  readonly label: string;
  readonly hint: string;
  readonly min: number;
  readonly max?: number | undefined;
}

const FIELDS: readonly FieldSpec[] = [
  { id: 'dailyUsd', label: 'Plafond quotidien ($)', hint: 'Dépense maximale par jour pour toute l’usine.', min: 0 },
  { id: 'perRunUsd', label: 'Plafond par run ($)', hint: 'Un run qui dépasse ce budget est interrompu.', min: 0 },
  {
    id: 'pausePercent',
    label: 'Seuil de pause (%)',
    hint: 'Utilisation de l’abonnement à partir de laquelle l’ordonnanceur se met en pause.',
    min: MIN_PAUSE_PERCENT,
    max: MAX_PAUSE_PERCENT,
  },
];

export function CostsCaps({ caps }: { readonly caps: CostCaps }) {
  const command = useCommand();
  const initial = draftFromCaps(caps);
  const [edited, setEdited] = useState<CapsDraft | null>(null);
  const [attempted, setAttempted] = useState(false);
  const draft = edited ?? initial;
  const parsing = parseCaps(draft);
  const unchanged = sameDraft(draft, initial);
  const pending = command.pending === 'costs.update-caps';

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (parsing.caps !== null) void command.run('costs.update-caps', parsing.caps, SUCCESS_MESSAGE);
  };

  return (
    <Card>
      <form className="costs-caps" onSubmit={onSubmit} noValidate aria-label="Plafonds">
        <div className="costs-caps__fields">
          {FIELDS.map((spec) => (
            <Field key={spec.id} label={spec.label} hint={spec.hint} error={attempted ? parsing.errors[spec.id] : null}>
              {(id, describedBy) => (
                <TextInput
                  id={id}
                  type="number"
                  inputMode="decimal"
                  min={spec.min}
                  max={spec.max}
                  step="any"
                  value={draft[spec.id]}
                  aria-describedby={describedBy}
                  aria-invalid={attempted && parsing.errors[spec.id] !== null ? true : undefined}
                  onChange={(event) => setEdited({ ...draft, [spec.id]: event.currentTarget.value })}
                />
              )}
            </Field>
          ))}
        </div>
        <div className="costs-caps__actions">
          <Button type="submit" variant="primary" loading={pending} disabled={unchanged}>
            Ajuster les plafonds
          </Button>
        </div>
      </form>
    </Card>
  );
}
