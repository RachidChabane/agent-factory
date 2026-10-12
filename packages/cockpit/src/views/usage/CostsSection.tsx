import { Link } from 'react-router';
import { useSnapshot } from '../../app/hooks.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { paths } from '../../model/routes.ts';
import { Card, Section } from '../../ui/components/Card.tsx';
import { CostBasisNote } from '../../widgets/Money.tsx';
import { TokenTotalsView } from '../../widgets/TokenTotalsView.tsx';
import { CostBreakdown } from './CostBreakdown.tsx';
import { CostFigures } from './CostFigures.tsx';
import { DailyCosts } from './DailyCosts.tsx';

/** What the agent runs cost: today, the month, the caps, each day, the tokens, and the groups the cost splits into. */
export function CostsSection() {
  const { t } = useI18n();
  const { costs } = useSnapshot();
  return (
    <>
      <Section
        id="usage-costs"
        title={t('usage.costs.title')}
        actions={
          <Link to={paths.settings()} className="link">
            {t('usage.costs.settings')}
          </Link>
        }
      >
        <CostBasisNote basis={costs.basis} />
        <CostFigures costs={costs} />
      </Section>
      <DailyCosts costs={costs} />
      <Section id="usage-tokens" title={t('usage.tokens.title')} description={t('usage.tokens.description')}>
        <Card>
          <TokenTotalsView totals={costs.tokens} layout="breakdown" />
        </Card>
      </Section>
      <CostBreakdown costs={costs} />
    </>
  );
}
