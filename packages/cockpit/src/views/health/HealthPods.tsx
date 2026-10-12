import { Server } from 'lucide-react';
import type { PodView } from '../../contract/index.ts';
import { relativeTime } from '../../format/format.ts';
import { POD_STATUS_LABELS } from '../../i18n/labels.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import type { TableColumn } from '../../ui/components/Table.tsx';
import { DataTable } from '../../ui/components/Table.tsx';
import { POD_MARKS } from './health-metrics.ts';

function podColumns(now: number): readonly TableColumn<PodView>[] {
  return [
    { id: 'name', header: 'Pod', primary: true, cell: (pod) => <span className="mono truncate health-pod__name">{pod.name}</span> },
    {
      id: 'status',
      header: 'Statut',
      cell: (pod) => (
        <span className="health-pod__status">
          <StatusMark mark={POD_MARKS[pod.status]} label={POD_STATUS_LABELS[pod.status]} />
          {POD_STATUS_LABELS[pod.status]}
        </span>
      ),
    },
    {
      id: 'restarts',
      header: 'Redémarrages',
      align: 'end',
      cell: (pod) => (pod.restarts > 0 ? <Badge tone="running">{pod.restarts}</Badge> : <span className="num">{pod.restarts}</span>),
    },
    { id: 'age', header: 'Âge', align: 'end', hideOnMobile: true, cell: (pod) => <span className="num">{relativeTime(pod.startedAt, now)}</span> },
    { id: 'version', header: 'Version', cell: (pod) => <span className="mono">{pod.version}</span> },
  ];
}

interface HealthPodsProps {
  readonly pods: readonly PodView[];
  readonly now: number;
}

export function HealthPods({ pods, now }: HealthPodsProps) {
  return (
    <DataTable
      label="Pods"
      rows={pods}
      columns={podColumns(now)}
      rowKey={(pod) => pod.name}
      empty={<EmptyState compact icon={<Server size={16} />} title="Aucun pod" description="Aucun pod n’est déployé dans cet environnement." />}
    />
  );
}
