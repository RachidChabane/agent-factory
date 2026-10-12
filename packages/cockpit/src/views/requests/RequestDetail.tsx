import { useState } from 'react';
import { CalendarClock, MessageSquare, RefreshCw, User } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { RequestView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { paths } from '../../model/routes.ts';
import { requestMark } from '../../model/status.ts';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { DetailHeader, MetaItem } from '../../ui/layout/Page.tsx';
import { Time } from '../../widgets/Time.tsx';
import { ChallengeReply } from './ChallengeReply.tsx';
import { ChallengeReportSection } from './ChallengeReportSection.tsx';
import { CreatedIssues } from './CreatedIssues.tsx';
import { DeclineDialog } from './DeclineDialog.tsx';
import { ProposedSpecs } from './ProposedSpecs.tsx';
import { RequestActions } from './RequestActions.tsx';
import { RequestNotices } from './RequestNotices.tsx';
import { RequestSource } from './RequestSource.tsx';

const ICON_SIZE = 13;

export function RequestDetail({ request }: { readonly request: RequestView }) {
  const { t, rich } = useI18n();
  const vocabulary = useVocabulary();
  const project = useProject();
  const [declining, setDeclining] = useState(false);
  return (
    <article className="detail request-detail">
      <DetailHeader
        back={{ to: paths.requests(project.id), label: t('requests.back') }}
        eyebrow={
          <>
            <StatusMark mark={requestMark(request.state)} />
            <span>{vocabulary.requestState(request.state)}</span>
            <span className="mono">{request.id}</span>
          </>
        }
        title={request.title}
        actions={<RequestActions request={request} onDecline={() => setDeclining(true)} />}
        meta={
          <>
            <MetaItem icon={<User size={ICON_SIZE} />}>
              <span className="visually-hidden">{t('requests.meta.requester')} </span>
              {request.requester}
            </MetaItem>
            <MetaItem icon={<MessageSquare size={ICON_SIZE} />}>
              <span className="visually-hidden">{t('requests.meta.channel')} </span>
              {request.channel}
            </MetaItem>
            <MetaItem icon={<CalendarClock size={ICON_SIZE} />}>{rich('requests.meta.received', { when: <Time iso={request.receivedAt} mode="dateTime" /> })}</MetaItem>
            <MetaItem icon={<RefreshCw size={ICON_SIZE} />}>{rich('requests.meta.updated', { when: <Time iso={request.updatedAt} /> })}</MetaItem>
          </>
        }
      />
      <RequestNotices request={request} />
      <RequestSource request={request} />
      <ChallengeReportSection request={request} />
      {request.challenge === null ? null : (
        <>
          <ChallengeReply report={request.challenge} />
          <ProposedSpecs key={request.challenge.completedAt} request={request} report={request.challenge} />
        </>
      )}
      <CreatedIssues request={request} />
      {declining ? <DeclineDialog request={request} onClose={() => setDeclining(false)} /> : null}
    </article>
  );
}
