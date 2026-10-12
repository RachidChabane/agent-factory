import { useState } from 'react';
import { MAX_CONCURRENT_RUNS, MAX_FREE_MEMORY_THRESHOLD_PERCENT, MIN_CONCURRENT_RUNS, MIN_FREE_MEMORY_THRESHOLD_PERCENT, PAUSE_ABOVE_PRESSURE_LEVELS } from '@agent-factory/domain';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { Card } from '../../ui/components/Card.tsx';
import { Field, Select } from '../../ui/components/Field.tsx';
import { NumberField } from './NumberField.tsx';
import type { ResourcesDraft, ResourcesSetting } from './resources-form.ts';
import { isPauseAbovePressure, isResourcesChanged, resourcesChangeOf, resourcesDraftOf, resourcesProblems } from './resources-form.ts';
import { SaveButton } from './SaveButton.tsx';
import { useDecimalNotation } from './use-decimal-notation.ts';
import { useSaveCommand } from './use-save-command.ts';

/** The limits of the machine the factory keeps to: free memory, memory pressure and agent runs at once. */
export function ResourcesForm({ setting }: { readonly setting: ResourcesSetting }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const notation = useDecimalNotation();
  const [edited, setEdited] = useState<ResourcesDraft | null>(null);
  const draft = edited ?? resourcesDraftOf(setting, notation);
  const problems = resourcesProblems(draft, notation);
  const save = useSaveCommand('settings.update-resources', resourcesChangeOf(draft, notation), isResourcesChanged(draft, setting, notation));
  return (
    <Card>
      <form
        className="settings-form"
        aria-label={t('settings.resources.title')}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save.save();
        }}
      >
        <div className="settings-form__fields">
          <NumberField
            label={t('settings.resources.minimumFreeMemory')}
            hint={t('settings.resources.minimumFreeMemoryHint')}
            inputMode="decimal"
            value={draft.minimumFreeMemory}
            onChange={(minimumFreeMemory) => setEdited({ ...draft, minimumFreeMemory })}
            error={problems.minimumFreeMemory ? t('settings.resources.errorMemory', { min: MIN_FREE_MEMORY_THRESHOLD_PERCENT, max: MAX_FREE_MEMORY_THRESHOLD_PERCENT }) : null}
          />
          <Field label={t('settings.resources.pauseAbove')} hint={t('settings.resources.pauseAboveHint')}>
            {(id, describedBy) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={draft.pauseAbovePressure}
                onChange={(event) => {
                  const level = event.currentTarget.value;
                  if (isPauseAbovePressure(level)) setEdited({ ...draft, pauseAbovePressure: level });
                }}
              >
                {PAUSE_ABOVE_PRESSURE_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {vocabulary.memoryPressure(level)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <NumberField
            label={t('settings.resources.maxConcurrentRuns')}
            hint={t('settings.resources.maxConcurrentRunsHint')}
            inputMode="numeric"
            value={draft.maxConcurrentRuns}
            onChange={(maxConcurrentRuns) => setEdited({ ...draft, maxConcurrentRuns })}
            error={problems.maxConcurrentRuns ? t('settings.resources.errorRuns', { min: MIN_CONCURRENT_RUNS, max: MAX_CONCURRENT_RUNS }) : null}
          />
        </div>
        <div className="settings-form__actions">
          <SaveButton command={save} />
        </div>
      </form>
    </Card>
  );
}
