import { useProject } from '../../app/ProjectRoute.tsx';
import { useSnapshot } from '../../app/hooks.ts';
import type { IssueView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { CostBasisNote, Money } from '../../widgets/Money.tsx';
import { TokenTotalsView } from '../../widgets/TokenTotalsView.tsx';
import { costEntryOf } from './issue-model.ts';

export function IssueCost({ issue }: { readonly issue: IssueView }) {
  const { t } = useI18n();
  const project = useProject();
  const { costs } = useSnapshot();
  const entry = costEntryOf(costs.byIssue, project.id, issue.number);
  return (
    <Section title={t('issues.cost.title')} id="issue-cost">
      <CostBasisNote basis={costs.basis} />
      <div className="issue-cost">
        <Money amount={issue.costUsd} basis={costs.basis} className="issue-cost__amount" />
        {entry === null ? (
          <p className="subtle">{t('issues.cost.noBreakdown')}</p>
        ) : (
          <>
            <p className="subtle">{t('issues.cost.runs', { count: entry.runs })}</p>
            <TokenTotalsView totals={entry.tokens} layout="breakdown" />
          </>
        )}
      </div>
    </Section>
  );
}
