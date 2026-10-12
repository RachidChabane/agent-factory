import { Link } from 'react-router';
import { Ban, CircleAlert, Loader } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import { useSnapshot } from '../../app/hooks.ts';
import type { RequestView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { paths } from '../../model/routes.ts';
import { Time } from '../../widgets/Time.tsx';
import { liveRunsOfSubject } from '../issues/subject-runs.ts';

function LiveChallenge({ request }: { readonly request: RequestView }) {
  const { t } = useI18n();
  const project = useProject();
  const { runs } = useSnapshot();
  const run = liveRunsOfSubject(runs, project.id, 'request', request.id)[0];
  if (run === undefined) return null;
  return (
    <Link to={paths.run(run.id)} className="callout callout--running request-notice--link">
      <Loader size={16} aria-hidden="true" />
      <div className="callout__body">
        <p className="callout__title">{t('requests.live.title')}</p>
        <p className="request-notice__text">{run.lastLine ?? t('requests.live.noOutput')}</p>
        <span className="link">{t('requests.live.open', { run: run.id })}</span>
      </div>
    </Link>
  );
}

function ChallengeFailure({ request }: { readonly request: RequestView }) {
  const { t, rich } = useI18n();
  if (request.lastChallengeFailure === null) return null;
  return (
    <section className="callout callout--failed" aria-label={t('requests.failure.title')}>
      <CircleAlert size={16} aria-hidden="true" />
      <div className="callout__body">
        <p className="callout__title">{t('requests.failure.title')}</p>
        <p className="request-notice__text">{request.lastChallengeFailure.reason.length === 0 ? t('requests.failure.noReason') : request.lastChallengeFailure.reason}</p>
        <p className="subtle">{rich('requests.failure.at', { when: <Time iso={request.lastChallengeFailure.at} /> })}</p>
      </div>
    </section>
  );
}

function Declined({ request }: { readonly request: RequestView }) {
  const { t } = useI18n();
  if (request.state !== 'declined' && request.declineReason === null) return null;
  return (
    <section className="callout" aria-label={t('requests.declined.title')}>
      <Ban size={16} aria-hidden="true" />
      <div className="callout__body">
        <p className="callout__title">{t('requests.declined.title')}</p>
        <p className="request-notice__text">{request.declineReason === null ? t('requests.declined.noReason') : request.declineReason}</p>
      </div>
    </section>
  );
}

export function RequestNotices({ request }: { readonly request: RequestView }) {
  return (
    <>
      <LiveChallenge request={request} />
      <ChallengeFailure request={request} />
      <Declined request={request} />
    </>
  );
}
