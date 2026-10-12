import './requests.css';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { Inbox, Plus } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Button } from '../../ui/components/Button.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { ListPane, ListSection, SplitLayout } from '../../ui/layout/Page.tsx';
import { NewRequestDialog } from '../../widgets/NewRequestDialog.tsx';
import { RequestDetail } from './RequestDetail.tsx';
import { RequestListItem } from './RequestListItem.tsx';
import type { RequestGroup } from './request-model.ts';
import { groupRequests, orderedRequests, REQUEST_GROUPS } from './request-model.ts';
import { useNewRequestDialog } from './use-new-request-dialog.ts';

const ICON_SIZE = 14;

export function RequestsView() {
  const { t } = useI18n();
  const project = useProject();
  const { requestId } = useParams();
  const newRequest = useNewRequestDialog();
  const groups = useMemo(() => groupRequests(project.requests), [project.requests]);
  const selected = requestId === undefined ? (orderedRequests(groups)[0] ?? null) : (project.requests.find((request) => request.id === requestId) ?? null);
  const headings: Readonly<Record<RequestGroup, string>> = {
    attention: t('requests.group.attention'),
    inProgress: t('requests.group.inProgress'),
    closed: t('requests.group.closed'),
  };
  const create = (
    <Button variant="primary" icon={<Plus size={ICON_SIZE} />} onClick={() => newRequest.setOpen(true)}>
      {t('requests.new')}
    </Button>
  );
  return (
    <>
      <SplitLayout
        listLabel={t('requests.listLabel')}
        hasSelection={requestId !== undefined}
        list={
          <ListPane
            title={t('requests.title')}
            count={project.requests.length}
            actions={
              <Button size="sm" icon={<Plus size={ICON_SIZE} />} onClick={() => newRequest.setOpen(true)}>
                {t('requests.new')}
              </Button>
            }
          >
            {project.requests.length === 0 ? <EmptyState compact icon={<Inbox size={16} />} title={t('requests.empty')} description={t('requests.emptyDescription')} /> : null}
            {REQUEST_GROUPS.map((group) =>
              groups[group].length === 0 ? null : (
                <ListSection key={group} title={headings[group]} count={groups[group].length}>
                  {groups[group].map((request) => (
                    <RequestListItem key={request.id} request={request} projectId={project.id} active={request.id === selected?.id} />
                  ))}
                </ListSection>
              ),
            )}
          </ListPane>
        }
        detail={
          selected === null ? (
            <EmptyState
              icon={<Inbox size={16} />}
              headingLevel={1}
              title={requestId === undefined ? t('requests.empty') : t('requests.notFound')}
              description={requestId === undefined ? t('requests.emptyDescription') : t('requests.notFoundDescription')}
              action={requestId === undefined ? create : undefined}
            />
          ) : (
            <RequestDetail key={`${project.id}:${selected.id}`} request={selected} />
          )
        }
      />
      <NewRequestDialog open={newRequest.open} onClose={() => newRequest.setOpen(false)} projectId={project.id} pickProject={false} />
    </>
  );
}
