import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { CostsView } from '../../contract/index.ts';
import { compact, plural, usd } from '../../format/format.ts';
import { paths } from '../../model/routes.ts';
import { Card } from '../../ui/components/Card.tsx';
import type { BarListItem } from '../../ui/components/Charts.tsx';
import { BarList } from '../../ui/components/Charts.tsx';
import { RoleGlyph } from '../../ui/components/RoleGlyph.tsx';

interface Usage {
  readonly costUsd: number;
  readonly tokens: number;
  readonly runs: number;
}

function usageHint(usage: Usage): string {
  return `${usd(usage.costUsd)} · ${compact(usage.tokens)} tokens · ${plural(usage.runs, 'run', 'runs')}`;
}

function entryLabel(name: ReactNode, usage: Usage): ReactNode {
  return (
    <span className="costs-entry">
      {name}
      <span className="costs-entry__tokens num">{compact(usage.tokens)} tokens</span>
    </span>
  );
}

function item(key: string, name: ReactNode, usage: Usage): BarListItem {
  return { key, label: entryLabel(name, usage), value: usage.costUsd, display: usd(usage.costUsd), hint: usageHint(usage) };
}

function BreakdownCard({ title, items }: { readonly title: string; readonly items: readonly BarListItem[] }) {
  return (
    <Card className="costs-breakdown" role="group" aria-label={title}>
      <h3 className="costs-breakdown__title">{title}</h3>
      <BarList items={items} label={title} />
    </Card>
  );
}

export function CostsBreakdown({ costs }: { readonly costs: CostsView }) {
  return (
    <div className="costs-breakdowns">
      <BreakdownCard title="Par rôle" items={costs.byRole.map((entry) => item(entry.role, <RoleGlyph role={entry.role} labelled />, entry))} />
      <BreakdownCard
        title="Par modèle"
        items={costs.byModel.map((entry) => item(entry.key, <span className="mono truncate">{entry.key}</span>, entry))}
      />
      <BreakdownCard
        title="Par issue"
        items={costs.byIssue.map((entry) =>
          item(
            String(entry.issueNumber),
            <Link to={paths.issue(entry.issueNumber)} className="costs-link num">
              #{entry.issueNumber}
            </Link>,
            entry,
          ),
        )}
      />
    </div>
  );
}
