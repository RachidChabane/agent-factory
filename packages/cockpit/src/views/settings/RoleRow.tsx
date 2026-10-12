import { useState } from 'react';
import { EFFORT_LEVELS } from '@agent-factory/domain';
import type { RoleSetting } from '../../contract/index.ts';
import { EFFORT_LABELS, ROLE_LABELS } from '../../i18n/labels.ts';
import { Button } from '../../ui/components/Button.tsx';
import { Field, Select, TextInput } from '../../ui/components/Field.tsx';
import { RoleGlyph } from '../../ui/components/RoleGlyph.tsx';
import type { RoleDraft } from './settings-model.ts';
import { BUDGET_STEP, draftFromRole, effortFrom, isRoleChanged, isRoleValid, MIN_TURNS, roleErrors } from './settings-model.ts';

interface RoleRowProps {
  readonly role: RoleSetting;
  readonly models: readonly string[];
  readonly saving: boolean;
  readonly onSave: (role: RoleSetting) => void;
}

function draftToRole(role: RoleSetting, draft: RoleDraft): RoleSetting {
  return {
    role: role.role,
    model: draft.model,
    effort: draft.effort,
    maxBudgetUsd: Number(draft.maxBudgetUsd),
    maxTurns: Number(draft.maxTurns),
  };
}

export function RoleRow({ role, models, saving, onSave }: RoleRowProps) {
  const [draft, setDraft] = useState<RoleDraft>(() => draftFromRole(role));
  const errors = roleErrors(draft);
  const label = ROLE_LABELS[role.role];
  const modelOptions = models.includes(draft.model) ? models : [draft.model, ...models];
  const canSave = isRoleChanged(draft, role) && isRoleValid(draft) && !saving;

  return (
    <li className="settings-role" aria-label={label}>
      <div className="settings-role__identity">
        <RoleGlyph role={role.role} size={16} />
        <span className="settings-role__name">{label}</span>
      </div>
      <Field label="Modèle">
        {(id) => (
          <Select id={id} value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.currentTarget.value })}>
            {modelOptions.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Effort">
        {(id) => (
          <Select
            id={id}
            value={draft.effort}
            onChange={(event) => {
              const effort = effortFrom(event.currentTarget.value);
              if (effort !== null) setDraft({ ...draft, effort });
            }}
          >
            {EFFORT_LEVELS.map((level) => (
              <option key={level} value={level}>
                {EFFORT_LABELS[level]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Budget max ($)" error={errors.maxBudgetUsd}>
        {(id, describedBy) => (
          <TextInput
            id={id}
            type="number"
            inputMode="decimal"
            className="num"
            step={BUDGET_STEP}
            min={BUDGET_STEP}
            aria-describedby={describedBy}
            aria-invalid={errors.maxBudgetUsd !== null}
            value={draft.maxBudgetUsd}
            onChange={(event) => setDraft({ ...draft, maxBudgetUsd: event.currentTarget.value })}
          />
        )}
      </Field>
      <Field label="Tours max" error={errors.maxTurns}>
        {(id, describedBy) => (
          <TextInput
            id={id}
            type="number"
            inputMode="numeric"
            className="num"
            step={1}
            min={MIN_TURNS}
            aria-describedby={describedBy}
            aria-invalid={errors.maxTurns !== null}
            value={draft.maxTurns}
            onChange={(event) => setDraft({ ...draft, maxTurns: event.currentTarget.value })}
          />
        )}
      </Field>
      <div className="settings-role__action">
        <Button
          size="sm"
          variant={canSave ? 'primary' : 'ghost'}
          disabled={!canSave}
          aria-label={`Enregistrer ${label}`}
          onClick={() => onSave(draftToRole(role, draft))}
        >
          Enregistrer
        </Button>
      </div>
    </li>
  );
}
