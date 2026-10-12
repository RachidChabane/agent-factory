import { useId, useState } from 'react';
import { EFFORT_LEVELS, MAX_ROLE_TURNS, MIN_ROLE_TURNS, MAX_RUN_BUDGET_USD } from '@agent-factory/domain';
import type { RoleSetting } from '../../contract/index.ts';
import { MINUTE_MS } from '../../i18n/formatters.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Field, Select } from '../../ui/components/Field.tsx';
import { RoleGlyph } from '../../ui/components/RoleGlyph.tsx';
import { NumberField } from './NumberField.tsx';
import type { RoleDraft } from './role-form.ts';
import { effortLevelOf, isRoleChanged, modelOptions, roleChangeOf, roleDraftOf, roleProblems } from './role-form.ts';
import { SaveButton } from './SaveButton.tsx';
import { useDecimalNotation } from './use-decimal-notation.ts';
import { useSaveCommand } from './use-save-command.ts';

const ROLE_ICON_SIZE = 16;

interface RoleRowProps {
  /** The project the role is set for, or null for the installation defaults. */
  readonly project: string | null;
  readonly setting: RoleSetting;
  readonly models: readonly string[];
  readonly promptOverridden: boolean;
}

/** One role: its model and limits as fields, saved on their own, and its read-only timeout. */
export function RoleRow({ project, setting, models, promptOverridden }: RoleRowProps) {
  const { t, fmt } = useI18n();
  const vocabulary = useVocabulary();
  const notation = useDecimalNotation();
  const nameId = useId();
  const [edited, setEdited] = useState<RoleDraft | null>(null);
  const draft = edited ?? roleDraftOf(setting, notation);
  const problems = roleProblems(draft, notation);
  const change = roleChangeOf(setting.role, draft, notation);
  const save = useSaveCommand('settings.update-role', change === null ? null : { project, change }, isRoleChanged(draft, setting, notation));
  const patch = (update: Partial<RoleDraft>) => setEdited({ ...draft, ...update });
  const roleName = vocabulary.role(setting.role);
  return (
    <li className="role-row">
      <form
        className="role-row__form"
        aria-labelledby={nameId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save.save();
        }}
      >
        <div className="role-row__header">
          <div className="role-row__identity">
            <span id={nameId} className="role-row__name">
              <RoleGlyph role={setting.role} size={ROLE_ICON_SIZE} labelled />
            </span>
            {promptOverridden ? (
              <Badge tone="accent" title={t('settings.roles.overriddenHint')}>
                {t('settings.roles.overridden')}
              </Badge>
            ) : null}
            <span className="role-row__timeout">{t('settings.roles.timeout', { duration: fmt.duration(setting.timeoutMinutes * MINUTE_MS) })}</span>
          </div>
          <SaveButton command={save} label={t('settings.roles.saveLabel', { role: roleName })} />
        </div>
        <div className="role-row__fields">
          <Field label={t('settings.roles.model')} error={problems.model ? t('settings.roles.errorModel') : null}>
            {(id, describedBy) => (
              <Select id={id} aria-describedby={describedBy} value={draft.model} onChange={(event) => patch({ model: event.currentTarget.value })}>
                {modelOptions(models, setting.model).map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('settings.roles.effort')}>
            {(id) => (
              <Select
                id={id}
                value={draft.effort}
                onChange={(event) => {
                  const effort = effortLevelOf(event.currentTarget.value);
                  if (effort !== undefined) patch({ effort });
                }}
              >
                {EFFORT_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {vocabulary.effort(level)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <NumberField
            label={t('settings.roles.maxBudget')}
            inputMode="decimal"
            value={draft.maxBudget}
            onChange={(maxBudget) => patch({ maxBudget })}
            error={problems.maxBudget ? t('settings.roles.errorBudget', { max: MAX_RUN_BUDGET_USD }) : null}
          />
          <NumberField
            label={t('settings.roles.maxTurns')}
            inputMode="numeric"
            value={draft.maxTurns}
            onChange={(maxTurns) => patch({ maxTurns })}
            error={problems.maxTurns ? t('settings.roles.errorTurns', { min: MIN_ROLE_TURNS, max: MAX_ROLE_TURNS }) : null}
          />
        </div>
      </form>
    </li>
  );
}
