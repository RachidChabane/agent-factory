import './costs.css';
import { useNow } from '../../app/context.tsx';
import { useSnapshot } from '../../app/hooks.ts';
import type { CockpitSnapshot } from '../../contract/index.ts';
import { usd } from '../../format/format.ts';
import { VIEW_TITLES } from '../../model/routes.ts';
import { Section } from '../../ui/components/Card.tsx';
import { Skeleton } from '../../ui/components/Skeleton.tsx';
import { Page, PageHeader } from '../../ui/layout/Page.tsx';
import { CostsBreakdown } from './CostsBreakdown.tsx';
import { CostsCaps } from './CostsCaps.tsx';
import { CostsDaily } from './CostsDaily.tsx';
import { CostsRuns } from './CostsRuns.tsx';
import { CostsSubscription } from './CostsSubscription.tsx';

const SKELETON_CARD_COUNT = 2;
const SKELETON_CARD_HEIGHT = 120;
const SKELETON_PANEL_HEIGHT = 220;

function CostsSkeleton() {
  return (
    <div className="costs-stack" aria-busy="true" aria-label="Chargement des coûts">
      <div className="costs-windows">
        {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
          <Skeleton key={index} height={SKELETON_CARD_HEIGHT} />
        ))}
      </div>
      <Skeleton height={SKELETON_PANEL_HEIGHT} />
      <Skeleton height={SKELETON_PANEL_HEIGHT} />
    </div>
  );
}

function CostsContent({ snapshot, now }: { readonly snapshot: CockpitSnapshot; readonly now: number }) {
  const { costs } = snapshot;
  return (
    <div className="costs-stack">
      <Section title="Abonnement Claude">
        <CostsSubscription windows={costs.subscription} pauseAt={costs.caps.pauseAtUtilization} now={now} />
      </Section>
      <Section title="Coût quotidien">
        <CostsDaily daily={costs.daily} dailyCapUsd={costs.caps.dailyUsd} />
      </Section>
      <Section title="Répartition">
        <CostsBreakdown costs={costs} />
      </Section>
      <Section title="Runs">
        <CostsRuns runs={snapshot.runs} now={now} />
      </Section>
      <Section title="Plafonds">
        <CostsCaps caps={costs.caps} />
      </Section>
    </div>
  );
}

export function CostsView() {
  const snapshot = useSnapshot();
  const now = useNow();
  return (
    <Page>
      <PageHeader
        title={VIEW_TITLES['costs']}
        description={snapshot === null ? undefined : `Depuis le début du mois : ${usd(snapshot.costs.monthToDateUsd)}`}
      />
      {snapshot === null ? <CostsSkeleton /> : <CostsContent snapshot={snapshot} now={now} />}
    </Page>
  );
}
