import { Bell, BellOff, ExternalLink } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { FilmToolWaitView, PullRequestView, ReadyHoldView } from '../../contract/index.ts';
import { useI18n, type LocalizedI18n } from '../../i18n/I18nProvider.tsx';
import { shortSha } from '../../model/identifiers.ts';
import { Section } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { ReadStamp } from '../../widgets/ReadStamp.tsx';
import { Time } from '../../widgets/Time.tsx';

const ICON_SIZE = 14;
const LIST_SEPARATOR = ', ';
const SECTION_ID = 'pull-request-ready-notice';

type ReadyNoticeView = PullRequestView['readyNotice'];

/** The checks or the scenarios a hold names. */
function namesOf(hold: ReadyHoldView): readonly string[] {
  return 'scenarios' in hold ? hold.scenarios : hold.checks;
}

/** Why the notice is held, in the words of the cockpit: each check, or the scenarios of the films that block it and the tool they wait for. */
function holdText(t: LocalizedI18n['t'], hold: ReadyHoldView, wait: FilmToolWaitView | null): string {
  const count = namesOf(hold).length;
  const names = namesOf(hold).join(LIST_SEPARATOR);
  switch (hold.kind) {
    case 'checks-running':
      return count === 0 ? t('pullRequests.ready.hold.checks-unreported') : t('pullRequests.ready.hold.checks-running', { count, checks: names });
    case 'checks-failed':
      return t('pullRequests.ready.hold.checks-failed', { count, checks: names });
    case 'films-pending':
      return wait === null
        ? t('pullRequests.ready.hold.films-pending', { count, scenarios: names })
        : t('pullRequests.ready.hold.films-waiting', { count, scenarios: names, tool: wait.tool });
    case 'films-failed':
      return t('pullRequests.ready.hold.films-failed', { count, scenarios: names });
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

function HeldNotice({ notice, wait }: { readonly notice: Extract<ReadyNoticeView, { status: 'held' }>; readonly wait: FilmToolWaitView | null }) {
  const { t } = useI18n();
  return (
    <>
      <p className="ready-notice__line">
        <BellOff size={ICON_SIZE} aria-hidden="true" />
        <span>{t('pullRequests.ready.held')}</span>
      </p>
      <ul className="bullets" aria-label={t('pullRequests.ready.holds')}>
        {notice.holds.map((hold) => (
          <li key={`${hold.kind}/${namesOf(hold).join('/')}`}>{holdText(t, hold, wait)}</li>
        ))}
      </ul>
      <ReadStamp readAt={notice.checksReadAt} kind="forge" neverLabel={t('pullRequests.ready.checksNeverRead')} />
    </>
  );
}

function DueNotice({ checksReadAt }: { readonly checksReadAt: string | null }) {
  const { t } = useI18n();
  return (
    <>
      <EmptyState compact title={t('pullRequests.ready.due')} />
      <ReadStamp readAt={checksReadAt} kind="forge" neverLabel={t('pullRequests.ready.checksNeverRead')} />
    </>
  );
}

/** The notice that tells the operator the pull request is ready: when it was sent and the links it carried, or what holds it. */
export function ReadyNotice({ pullRequest }: { readonly pullRequest: PullRequestView }) {
  const { t } = useI18n();
  const project = useProject();
  const notice = pullRequest.readyNotice;
  return (
    <Section title={t('pullRequests.ready.title')} id={SECTION_ID} description={t('pullRequests.ready.description')}>
      {notice.status === 'sent' ? <SentNotice notice={notice} /> : null}
      {notice.status === 'held' ? <HeldNotice notice={notice} wait={project.filmToolWait} /> : null}
      {notice.status === 'due' ? <DueNotice checksReadAt={notice.checksReadAt} /> : null}
      {notice.status === 'none' ? <EmptyState compact title={t('pullRequests.ready.none')} /> : null}
    </Section>
  );
}
