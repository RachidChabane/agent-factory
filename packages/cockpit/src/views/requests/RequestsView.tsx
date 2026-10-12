import './requests.css';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Inbox, Plus } from 'lucide-react';
import { useNow } from '../../app/context.tsx';
import { useSnapshot } from '../../app/hooks.ts';
import type { RequestView } from '../../contract/index.ts';
import { relativeTime, toEpoch } from '../../format/format.ts';
import { REQUEST_STATE_LABELS } from '../../i18n/labels.ts';
import { NEW_REQUEST_QUERY_PARAMETER, QUERY_FLAG } from '../../model/query-flags.ts';
import { paths, VIEW_TITLES } from '../../model/routes.ts';
import { requestMark } from '../../model/status.ts';
import { Button } from '../../ui/components/Button.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { Skeleton } from '../../ui/components/Skeleton.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { ListItemLink, SplitLayout } from '../../ui/layout/Page.tsx';
import { NewRequestDialog } from './NewRequestDialog.tsx';
import { RequestDetail } from './RequestDetail.tsx';

const NEEDS_OPERATOR: readonly RequestView['state'][] = ['received', 'challenged'];

function sortRequests(requests: readonly RequestView[]): readonly RequestView[] {
  return requests.toSorted(
    (left, right) =>
      Number(NEEDS_OPERATOR.includes(right.state)) - Number(NEEDS_OPERATOR.includes(left.state)) || toEpoch(right.updatedAt) - toEpoch(left.updatedAt),
  );
}

export function RequestsView() {
  const snapshot = useSnapshot();
  const now = useNow();
  const { requestId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const sorted = useMemo(() => sortRequests(snapshot?.requests ?? []), [snapshot]);
  const selected = requestId === undefined ? (sorted[0] ?? null) : (sorted.find((request) => request.id === requestId) ?? null);

  useEffect(() => {
    if (searchParams.get(NEW_REQUEST_QUERY_PARAMETER) !== QUERY_FLAG) return;
    setCreating(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  if (snapshot === null) {
    return (
      <div className="detail">
        <Skeleton width="40%" height={20} />
        <Skeleton lines={8} />
      </div>
    );
  }
  return (
    <>
      <SplitLayout
        listLabel="Liste des demandes"
        hasSelection={requestId !== undefined}
        list={
          <>
            <header className="list-pane__header">
              <div className="list-pane__title-row">
                <h1 className="list-pane__title">
                  {VIEW_TITLES.requests} <span className="list-pane__count num">{sorted.length}</span>
                </h1>
                <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
                  Nouvelle
                </Button>
              </div>
            </header>
            <div className="list-pane__items">
              {sorted.map((request) => (
                <ListItemLink key={request.id} to={paths.request(request.id)} active={request.id === selected?.id}>
                  <StatusMark mark={requestMark(request.state)} />
                  <span className="list-item__body">
                    <span className="list-item__title">{request.title}</span>
                    <span className="list-item__meta">
                      <span className="mono">{request.id}</span>
                      <span className="dot-separator" />
                      <span className="truncate">{request.requester}</span>
                    </span>
                    <span className={`requests-list__state requests-list__state--${requestMark(request.state)}`}>
                      {REQUEST_STATE_LABELS[request.state]}
                      {request.challenge === null ? '' : ` · ${request.challenge.items.length} points`}
                    </span>
                  </span>
                  <span className="list-item__aside num">{relativeTime(request.updatedAt, now)}</span>
                </ListItemLink>
              ))}
            </div>
          </>
        }
        detail={
          selected === null ? (
            <EmptyState
              icon={<Inbox size={16} />}
              title={requestId === undefined ? 'Aucune demande' : 'Demande introuvable'}
              description="Collez une demande reçue pour la faire challenger."
              action={
                <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
                  Nouvelle demande
                </Button>
              }
            />
          ) : (
            <RequestDetail key={selected.id} request={selected} snapshot={snapshot} />
          )
        }
      />
      <NewRequestDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
