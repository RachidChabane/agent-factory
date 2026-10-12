import { useState } from 'react';
import type { MemoryPressure, SettingsView } from '../../contract/index.ts';
import { MEMORY_PRESSURES } from '../../contract/index.ts';
import { plural } from '../../format/format.ts';
import { Button } from '../../ui/components/Button.tsx';
import { Card } from '../../ui/components/Card.tsx';
import { Field, Select, TextInput } from '../../ui/components/Field.tsx';
import type { LimitsDraft } from './settings-model.ts';
import {
  limitsErrors,
  MAX_MEMORY_THRESHOLD_PERCENT,
  MIN_CONCURRENCY,
  MIN_MEMORY_THRESHOLD_PERCENT,
  parseNumber,
  pauseLabel,
  pressureFrom,
} from './settings-model.ts';

export interface LimitsValues {
  readonly concurrencyCeiling: number;
  readonly freeMemoryThresholdPercent: number;
  readonly pauseAbovePressure: MemoryPressure;
}

interface LimitsFormProps {
  readonly settings: Pick<SettingsView, 'concurrency' | 'resourceGuard'>;
  readonly saving: boolean;
  readonly onSave: (values: LimitsValues) => void;
}

function initialDraft(settings: LimitsFormProps['settings']): LimitsDraft {
  return {
    concurrencyCeiling: String(settings.concurrency.ceiling),
    freeMemoryThresholdPercent: String(settings.resourceGuard.freeMemoryThresholdPercent),
    pauseAbovePressure: settings.resourceGuard.pauseAbovePressure,
  };
}

export function LimitsForm({ settings, saving, onSave }: LimitsFormProps) {
  const [draft, setDraft] = useState<LimitsDraft>(() => initialDraft(settings));
  const [submitted, setSubmitted] = useState(false);
  const errors = limitsErrors(draft, settings.concurrency.maximum);
  const visible = (message: string | null) => (submitted ? message : null);

  const submit = () => {
    setSubmitted(true);
    const ceiling = parseNumber(draft.concurrencyCeiling);
    const threshold = parseNumber(draft.freeMemoryThresholdPercent);
    if (errors.concurrencyCeiling !== null || errors.freeMemoryThresholdPercent !== null) return;
    if (ceiling === null || threshold === null) return;
    onSave({ concurrencyCeiling: ceiling, freeMemoryThresholdPercent: threshold, pauseAbovePressure: draft.pauseAbovePressure });
  };

  return (
    <Card>
      <form
        className="settings-limits"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field
          label="Plafond de concurrence"
          error={visible(errors.concurrencyCeiling)}
          hint={`${plural(settings.concurrency.active, 'run actif', 'runs actifs')} sur ${settings.concurrency.maximum} au maximum`}
        >
          {(id, describedBy) => (
            <TextInput
              id={id}
              type="number"
              className="num"
              min={MIN_CONCURRENCY}
              max={settings.concurrency.maximum}
              step={1}
              aria-describedby={describedBy}
              aria-invalid={visible(errors.concurrencyCeiling) !== null}
              value={draft.concurrencyCeiling}
              onChange={(event) => setDraft({ ...draft, concurrencyCeiling: event.currentTarget.value })}
            />
          )}
        </Field>
        <Field
          label="Seuil de mémoire libre (%)"
          error={visible(errors.freeMemoryThresholdPercent)}
          hint="Sous ce seuil, l’usine cesse de lancer de nouveaux runs."
        >
          {(id, describedBy) => (
            <TextInput
              id={id}
              type="number"
              className="num"
              min={MIN_MEMORY_THRESHOLD_PERCENT}
              max={MAX_MEMORY_THRESHOLD_PERCENT}
              step={1}
              aria-describedby={describedBy}
              aria-invalid={visible(errors.freeMemoryThresholdPercent) !== null}
              value={draft.freeMemoryThresholdPercent}
              onChange={(event) => setDraft({ ...draft, freeMemoryThresholdPercent: event.currentTarget.value })}
            />
          )}
        </Field>
        <Field label="Mettre en pause" hint="Niveau de pression mémoire au-delà duquel le planificateur se met en pause.">
          {(id, describedBy) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={draft.pauseAbovePressure}
              onChange={(event) => {
                const pressure = pressureFrom(event.currentTarget.value);
                if (pressure !== null) setDraft({ ...draft, pauseAbovePressure: pressure });
              }}
            >
              {MEMORY_PRESSURES.map((pressure) => (
                <option key={pressure} value={pressure}>
                  {pauseLabel(pressure)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="settings-limits__action">
          <Button type="submit" variant="primary" loading={saving}>
            Enregistrer les limites
          </Button>
        </div>
      </form>
    </Card>
  );
}
