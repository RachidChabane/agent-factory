import { Bell, BellOff, ExternalLink } from 'lucide-react';
import type { PullRequestView, ReadyHoldView } from '../../contract/index.ts';
import { useI18n, type LocalizedI18n } from '../../i18n/I18nProvider.tsx';
import { shortSha } from '../../model/identifiers.ts';
import { Section } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { ReadStamp } from '../../widgets/ReadStamp.tsx';
import { Time } from '../../widgets/Time.tsx';

const ICON_SIZE = 14;
const SCENARIO_SEPARATOR = ', ';
const SECTION_ID = 'pull-request-ready-notice';

type ReadyNoticeView = PullRequestView['readyNotice'];

/** Why the notice is held, in the words of the cockpit: the checks, or the scenarios of the films that block it. */
function holdText(t: LocalizedI18n['t'], hold: ReadyHoldView): string {
  switch (hold.kind) {
    case 'checks-running':
      return t('pullRequests.ready.hold.checks-running');
    case 'checks-failed':
      return t('pullRequests.ready.hold.checks-failed');
    case 'films-pending':
      return t('pullRequests.ready.hold.films-pending', { count: hold.scenarios.length, scenarios: hold.scenarios.join(SCENARIO_SEPARATOR) });
    case 'films-failed':
      return t('pullRequests.ready.hold.films-failed', { count: hold.scenarios.length, scenarios: hold.scenarios.join(SCENARIO_SEPARATOR) });
  }
}

function SentNotice({ notice }: { readonly notice: Extract<ReadyNoticeView, { status: 'sent' }> }) {
  const { t, rich } = useI18n();
  return (
    <>
      <p className="ready-notice__line">
        <Bell size={ICON_SIZE} aria-hidden="true" />
        <span>{rich('pullRequests.ready.sent', { when: <Time iso={notice.sentAt} />, sha: <span className="mono">{shortSha(notice.headSha)}</span> })}</span>
      </p>
      {notice.links.length === 0 ? (
        <p className="subtle">{t('pullRequests.ready.linksNone')}</p>
      ) : (
        <ul className="ready-notice__links" aria-label={t('pullRequests.ready.links')}>
          {notice.links.map((link) => (
            <li key={`${link.label}/${link.url}`}>
              <a className="link" href={link.url} target="_blank" rel="noreferrer" aria-label={t('pullRequests.ready.open', { label: link.label })}>
                {link.label} <ExternalLink size={ICON_SIZE} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {notice.failures.length === 0 ? null : (
        <div className="ready-notice__failures">
          <p className="callout__title">{t('pullRequests.ready.failures')}</p>
          <ul className="bullets">
            {notice.failures.map((failure) => (
              <li key={failure.label}>{t('pullRequests.ready.failure', { label: failure.label, reason: failure.reason })}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function HeldNotice({ notice }: { readonly notice: Extract<ReadyNoticeView, { status: 'held' }> }) {
  const { t } = useI18n();
  return (
    <>
      <p className="ready-notice__line">
        <BellOff size={ICON_SIZE} aria-hidden="true" />
        <span>{t('pullRequests.ready.held')}</span>
      </p>
      <ul className="bullets" aria-label={t('pullRequests.ready.holds')}>
        {notice.holds.map((hold) => (
          <li key={`${hold.kind}/${'scenarios' in hold ? hold.scenarios.join('/') : ''}`}>{holdText(t, hold)}</li>
        ))}
      </ul>
      <ReadStamp readAt={notice.checksReadAt} kind="forge" neverLabel={t('pullRequests.ready.checksNeverRead')} />
    </>
  );
}

/** The notice that tells the operator the pull request is ready: when it was sent and the links it carried, or what holds it. */
export function ReadyNotice({ pullRequest }: { readonly pullRequest: PullRequestView }) {
  const { t } = useI18n();
  const notice = pullRequest.readyNotice;
  return (
    <Section title={t('pullRequests.ready.title')} id={SECTION_ID} description={t('pullRequests.ready.description')}>
      {notice.status === 'sent' ? <SentNotice notice={notice} /> : null}
      {notice.status === 'held' ? <HeldNotice notice={notice} /> : null}
      {notice.status === 'due' ? <EmptyState compact title={t('pullRequests.ready.due')} /> : null}
      {notice.status === 'none' ? <EmptyState compact title={t('pullRequests.ready.none')} /> : null}
    </Section>
  );
}
