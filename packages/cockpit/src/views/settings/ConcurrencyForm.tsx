import { useState } from 'react';
import { MIN_CONCURRENT_ISSUES } from '@agent-factory/domain';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Card } from '../../ui/components/Card.tsx';
import type { ConcurrencyDraft, ConcurrencySetting } from './concurrency-form.ts';
import { concurrencyChangeOf, concurrencyDraftOf, concurrencyProblems, isConcurrencyChanged } from './concurrency-form.ts';
import { NumberField } from './NumberField.tsx';
import { SaveButton } from './SaveButton.tsx';
import { useDecimalNotation } from './use-decimal-notation.ts';
import { useSaveCommand } from './use-save-command.ts';

interface ConcurrencyFormProps {
  readonly project: string;
  readonly setting: ConcurrencySetting;
}

/** How many issues of the project the factory works on at once, and the most that may be set. */
export function ConcurrencyForm({ project, setting }: ConcurrencyFormProps) {
  const { t } = useI18n();
  const notation = useDecimalNotation();
  const [edited, setEdited] = useState<ConcurrencyDraft | null>(null);
  const draft = edited ?? concurrencyDraftOf(setting, notation);
  const problems = concurrencyProblems(draft, notation);
  const save = useSaveCommand('settings.update-concurrency', concurrencyChangeOf(project, draft, notation), isConcurrencyChanged(draft, setting, notation));
  const wholeNumber = t('settings.concurrency.errorWhole', { min: MIN_CONCURRENT_ISSUES });
  return (
    <Card>
      <form
        className="settings-form"
        aria-label={t('settings.concurrency.title')}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save.save();
        }}
      >
        <div className="settings-form__fields">
          <NumberField
            label={t('settings.concurrency.issues')}
            hint={t('settings.concurrency.issuesHint')}
            inputMode="numeric"
            value={draft.issues}
            onChange={(issues) => setEdited({ ...draft, issues })}
            error={problems.issues ? wholeNumber : null}
          />
          <NumberField
            label={t('settings.concurrency.ceiling')}
            hint={t('settings.concurrency.ceilingHint')}
            inputMode="numeric"
            value={draft.ceiling}
            onChange={(ceiling) => setEdited({ ...draft, ceiling })}
            error={problems.ceiling === null ? null : problems.ceiling === 'invalid' ? wholeNumber : t('settings.concurrency.errorCeilingBelow')}
          />
        </div>
        <div className="settings-form__actions">
          <SaveButton command={save} />
        </div>
      </form>
    </Card>
  );
}
