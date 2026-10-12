import { Link } from 'react-router';
import { MessageCircleQuestionMark } from 'lucide-react';
import type { RequestState } from '@agent-factory/domain';
import type { ChallengeItem, ChallengeReport, ChallengeVerdict, RequestView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { paths } from '../../model/routes.ts';
import type { BadgeTone } from '../../ui/components/Badge.tsx';
import { Badge } from '../../ui/components/Badge.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { Time } from '../../widgets/Time.tsx';
import { verdictCounts } from './request-model.ts';

const VERDICT_TONES: Readonly<Record<ChallengeVerdict, BadgeTone>> = {
  keep: 'success',
  adjust: 'accent',
  split: 'running',
  ask: 'waiting',
  decline: 'failed',
};

const FACETS = ['currentState', 'intent', 'idea', 'method'] as const satisfies readonly (keyof ChallengeItem)[];

function Facet({ item, facet }: { readonly item: ChallengeItem; readonly facet: (typeof FACETS)[number] }) {
  const { t } = useI18n();
  return (
    <div className="challenge-item__facet">
      <dt>{t(`requests.item.${facet}`)}</dt>
      <dd>{item[facet].trim().length === 0 ? <span className="subtle">{t('requests.notStated')}</span> : item[facet]}</dd>
    </div>
  );
}

function ItemCard({ item, position }: { readonly item: ChallengeItem; readonly position: number }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  return (
    <li className={`challenge-item challenge-item--${item.verdict}`}>
      <header className="challenge-item__header">
        <span className="challenge-item__index num" aria-label={t('requests.item.number', { number: position })}>
          {position}
        </span>
        <h3 className="challenge-item__title">{item.title}</h3>
        <Badge tone={VERDICT_TONES[item.verdict]}>{vocabulary.challengeVerdict(item.verdict)}</Badge>
      </header>
      <p className="challenge-item__reason">{item.reason.trim().length === 0 ? <span className="subtle">{t('requests.notStated')}</span> : item.reason}</p>
      {item.question === null ? null : (
        <p className="challenge-item__question">
          <MessageCircleQuestionMark size={14} aria-hidden="true" />
          <span>
            <span className="visually-hidden">{t('requests.item.question')} </span>
            {item.question}
          </span>
        </p>
      )}
      <dl className="challenge-item__facets">
        {FACETS.map((facet) => (
          <Facet key={facet} item={item} facet={facet} />
        ))}
      </dl>
      {item.sources.length === 0 ? null : (
        <ul className="challenge-item__sources" aria-label={t('requests.item.sources')}>
          {item.sources.map((source) => (
            <li key={`${source.label}-${source.reference}`} className="challenge-source" title={source.reference}>
              <span className="challenge-source__label">{source.label}</span>
              <span className="challenge-source__reference mono truncate">{source.reference}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function VerdictSummary({ report }: { readonly report: ChallengeReport }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  return (
    <ul className="verdict-summary" aria-label={t('requests.verdicts')}>
      {verdictCounts(report).map(({ verdict, count }) => (
        <li key={verdict}>
          <Badge tone={VERDICT_TONES[verdict]}>{t('requests.verdictCount', { verdict: vocabulary.challengeVerdict(verdict), count })}</Badge>
        </li>
      ))}
    </ul>
  );
}

function ReportMeta({ report }: { readonly report: ChallengeReport }) {
  const { t, rich } = useI18n();
  return (
    <p className="challenge-meta subtle">
      {rich('requests.challenge.completed', { when: <Time iso={report.completedAt} mode="dateTime" /> })} ·{' '}
      {report.runId === null ? (
        t('requests.challenge.noRun')
      ) : (
        <Link to={paths.run(report.runId)} className="link">
          {t('requests.challenge.run', { run: report.runId })}
        </Link>
      )}
    </p>
  );
}

const NO_REPORT_KINDS: Readonly<Record<RequestState, 'received' | 'challenging' | 'other'>> = {
  received: 'received',
  challenging: 'challenging',
  challenged: 'other',
  'waiting-requester': 'other',
  accepted: 'other',
  declined: 'other',
};

function NoReport({ request }: { readonly request: RequestView }) {
  const { t } = useI18n();
  const kind = NO_REPORT_KINDS[request.state];
  return <EmptyState compact title={t(`requests.challenge.none.${kind}`)} description={t(`requests.challenge.none.${kind}Description`)} />;
}

export function ChallengeReportSection({ request }: { readonly request: RequestView }) {
  const { t } = useI18n();
  const report = request.challenge;
  if (report === null) {
    return (
      <Section title={t('requests.challenge.title')} id="request-challenge">
        <NoReport request={request} />
      </Section>
    );
  }
  return (
    <Section title={t('requests.challenge.title')} id="request-challenge" description={t('requests.points', { count: report.items.length })} actions={<VerdictSummary report={report} />}>
      <ReportMeta report={report} />
      <p className="challenge-summary">{report.summary.trim().length === 0 ? <span className="subtle">{t('requests.notStated')}</span> : report.summary}</p>
      {report.items.length === 0 ? (
        <EmptyState compact title={t('requests.challenge.noItems')} />
      ) : (
        <ol className="challenge-items" aria-label={t('requests.challenge.items')}>
          {report.items.map((item, index) => (
            <ItemCard key={item.id} item={item} position={index + 1} />
          ))}
        </ol>
      )}
    </Section>
  );
}
