import { useState } from 'react';
import { dailyCapAmount, MAX_DAILY_CAP_USD, MAX_RUN_BUDGET_USD } from '@agent-factory/domain';
import type { CostBasisView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Card } from '../../ui/components/Card.tsx';
import { Money } from '../../widgets/Money.tsx';
import type { BudgetDraft, BudgetSetting } from './budget-form.ts';
import { budgetChangeOf, budgetDraftOf, budgetProblems, isBudgetChanged } from './budget-form.ts';
import { NumberField } from './NumberField.tsx';
import { SaveButton } from './SaveButton.tsx';
import { useDecimalNotation } from './use-decimal-notation.ts';
import { useSaveCommand } from './use-save-command.ts';

interface BudgetFormProps {
  readonly setting: BudgetSetting;
  /** What the dollar figures mean, since a cap is an amount of dollars. */
  readonly basis: CostBasisView;
}

/** The spending caps: a day's total and one run's, each an amount or no cap at all. */
export function BudgetForm({ setting, basis }: BudgetFormProps) {
  const { t, rich } = useI18n();
  const notation = useDecimalNotation();
  const [edited, setEdited] = useState<BudgetDraft | null>(null);
  const draft = edited ?? budgetDraftOf(setting, notation);
  const problems = budgetProblems(draft, notation);
  const save = useSaveCommand('settings.update-budget', budgetChangeOf(draft, notation), isBudgetChanged(draft, setting, notation));
  const daily = dailyCapAmount(setting.dailyCap);
  return (
    <Card>
      <form
        className="settings-form"
        aria-label={t('settings.budget.title')}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save.save();
        }}
      >
        <div className="settings-form__fields">
          <NumberField
            label={t('settings.budget.dailyCap')}
            hint={daily === null ? t('settings.budget.noDailyCap') : rich('settings.budget.dailyCapIs', { amount: <Money amount={daily} basis={basis} /> })}
            inputMode="decimal"
            placeholder={t('settings.budget.noCapPlaceholder')}
            value={draft.dailyCap}
            onChange={(dailyCap) => setEdited({ ...draft, dailyCap })}
            error={problems.dailyCap ? t('settings.budget.errorCap', { max: MAX_DAILY_CAP_USD }) : null}
          />
          <NumberField
            label={t('settings.budget.perRunCap')}
            hint={
              setting.perRunCapUsd === null
                ? t('settings.budget.noPerRunCap')
                : rich('settings.budget.perRunCapIs', { amount: <Money amount={setting.perRunCapUsd} basis={basis} /> })
            }
            inputMode="decimal"
            placeholder={t('settings.budget.noCapPlaceholder')}
            value={draft.perRunCap}
            onChange={(perRunCap) => setEdited({ ...draft, perRunCap })}
            error={problems.perRunCap ? t('settings.budget.errorCap', { max: MAX_RUN_BUDGET_USD }) : null}
          />
        </div>
        <div className="settings-form__actions">
          <SaveButton command={save} />
        </div>
      </form>
    </Card>
  );
}
