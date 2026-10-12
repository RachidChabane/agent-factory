import './runs.css';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { SquareTerminal } from 'lucide-react';
import { useNow } from '../../app/context.tsx';
import { useSnapshot } from '../../app/hooks.ts';
import type { CockpitSnapshot, RunView } from '../../contract/index.ts';
import { relativeTime, toEpoch } from '../../format/format.ts';
import { ROLE_LABELS } from '../../i18n/labels.ts';
import { paths, VIEW_TITLES } from '../../model/routes.ts';
import { runMark } from '../../model/status.ts';
import { describeSubject } from '../../model/subjects.ts';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { Skeleton } from '../../ui/components/Skeleton.tsx';
import { AgentGlyph } from '../../ui/components/AgentGlyph.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { ListItemLink, SplitLayout } from '../../ui/layout/Page.tsx';
import { RunDetail } from './RunDetail.tsx';
import { LIVE_RUN_STATUSES, runCost } from './run-cost.ts';


function byStart(left: RunView, right: RunView): number {
  return toEpoch(right.startedAt) - toEpoch(left.startedAt);
}

function RunListItem({ run, snapshot, active, now }: { readonly run: RunView; readonly snapshot: CockpitSnapshot; readonly active: boolean; readonly now: number }) {
  const subject = describeSubject(snapshot, run.subject);
  const live = LIVE_RUN_STATUSES.includes(run.status);
  return (
    <ListItemLink to={paths.run(run.id)} active={active}>
      {live && run.status === 'running' ? <AgentGlyph size={15} label="Agent en cours" /> : <StatusMark mark={runMark(run.status)} />}
      <span className="list-item__body">
        <span className="list-item__title">
          {ROLE_LABELS[run.role]} · {subject.reference}
        </span>
        <span className="list-item__meta">
          <span className="truncate">{subject.title}</span>
        </span>
        <span className="list-item__meta">
          <span className="mono">{run.model}</span>
          {run.status === 'waiting' ? <span className="runs-list__waiting">attend une réponse</span> : null}
        </span>
      </span>
      <span className="list-item__aside">
        <span className="num">{relativeTime(run.startedAt, now)}</span>
        <span className="runs-list__cost num">{runCost(run)}</span>
      </span>
    </ListItemLink>
  );
}

function RunList({ snapshot, activeId, now }: { readonly snapshot: CockpitSnapshot; readonly activeId: string | null; readonly now: number }) {
  const live = snapshot.runs.filter((run) => LIVE_RUN_STATUSES.includes(run.status)).toSorted(byStart);
  const past = snapshot.runs.filter((run) => !LIVE_RUN_STATUSES.includes(run.status)).toSorted(byStart);
  return (
    <>
      <header className="list-pane__header">
        <div className="list-pane__title-row">
          <h1 className="list-pane__title">
            {VIEW_TITLES.runs} <span className="list-pane__count num">{snapshot.runs.length}</span>
          </h1>
        </div>
      </header>
      <div className="list-pane__items">
        <p className="list-pane__section-title small-caps">En cours · {live.length}</p>
        {live.length === 0 ? <p className="runs-list__empty">Aucun agent ne travaille.</p> : null}
        {live.map((run) => (
          <RunListItem key={run.id} run={run} snapshot={snapshot} active={run.id === activeId} now={now} />
        ))}
        <p className="list-pane__section-title small-caps">Terminés · {past.length}</p>
        {past.map((run) => (
          <RunListItem key={run.id} run={run} snapshot={snapshot} active={run.id === activeId} now={now} />
        ))}
      </div>
    </>
  );
}

export function RunsView() {
  const snapshot = useSnapshot();
  const now = useNow();
  const { runId } = useParams();
  const selected = useMemo(() => {
    if (snapshot === null) return null;
    if (runId !== undefined) return snapshot.runs.find((run) => run.id === runId) ?? null;
    return snapshot.runs.filter((run) => LIVE_RUN_STATUSES.includes(run.status)).toSorted(byStart)[0] ?? snapshot.runs.toSorted(byStart)[0] ?? null;
  }, [snapshot, runId]);

  if (snapshot === null) {
    return (
      <div className="detail">
        <Skeleton width="40%" height={20} />
        <Skeleton lines={8} />
      </div>
    );
  }
  return (
    <SplitLayout
      listLabel="Liste des runs"
      hasSelection={runId !== undefined}
      list={<RunList snapshot={snapshot} activeId={selected?.id ?? null} now={now} />}
      detail={
        selected === null ? (
          <EmptyState icon={<SquareTerminal size={16} />} title={runId === undefined ? 'Aucun run' : 'Run introuvable'} description="Les runs d’agents apparaissent ici dès leur démarrage." />
        ) : (
          <RunDetail key={selected.id} run={selected} snapshot={snapshot} />
        )
      }
    />
  );
}
