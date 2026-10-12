import { Lock } from 'lucide-react';
import type { AcceptanceCheck, IssueView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { Time } from '../../widgets/Time.tsx';
import { beforeResultTone, shortHash } from './issue-model.ts';

const SCORE_FRACTION_DIGITS = 2;

function Facts({ check }: { readonly check: AcceptanceCheck }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  return (
    <span className="issue-check__facts">
      <span>{check.runner === null ? t('issues.checks.runnerUnknown') : t('issues.checks.runner', { runner: vocabulary.testRunner(check.runner) })}</span>
      <span>{check.onBase === null ? t('issues.checks.onBaseUnknown') : vocabulary.baseExpectation(check.onBase)}</span>
    </span>
  );
}

function Score({ before }: { readonly before: AcceptanceCheck['before'] }) {
  const { t, fmt } = useI18n();
  if (before.score !== null) return <span className="num">{t('issues.checks.score', { score: fmt.decimal(before.score, SCORE_FRACTION_DIGITS) })}</span>;
  return before.result === 'scored' ? <span className="subtle">{t('issues.checks.scoreMissing')}</span> : null;
}

function Proof({ check }: { readonly check: AcceptanceCheck }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const { before } = check;
  return (
    <div className="issue-check__proof">
      <Badge tone={beforeResultTone(check)}>{vocabulary.beforeResult(before.result)}</Badge>
      <Score before={before} />
      {check.sha256 === null ? (
        <Badge tone="idle">{t('issues.checks.notFrozenCheck')}</Badge>
      ) : (
        <span className="issue-check__hash mono" title={check.sha256}>
          <Lock size={11} aria-hidden="true" /> {t('issues.checks.frozen')} {shortHash(check.sha256)}
        </span>
      )}
    </div>
  );
}

function CheckItem({ check }: { readonly check: AcceptanceCheck }) {
  const { t } = useI18n();
  const { before } = check;
  return (
    <li className="issue-check">
      <div className="issue-check__main">
        <span className="issue-check__path mono">{check.path}</span>
        <Facts check={check} />
      </div>
      <Proof check={check} />
      {before.detail.length === 0 ? null : <p className="issue-check__detail mono">{before.detail}</p>}
      {before.screenshotUrl === null ? null : (
        <a className="issue-check__screenshot" href={before.screenshotUrl} target="_blank" rel="noreferrer">
          <img src={before.screenshotUrl} alt={t('issues.checks.screenshotAlt', { path: check.path })} loading="lazy" />
        </a>
      )}
    </li>
  );
}

export function IssueChecks({ issue }: { readonly issue: IssueView }) {
  const { t, rich } = useI18n();
  const vocabulary = useVocabulary();
  return (
    <Section
      title={t('issues.checks.title')}
      id="issue-checks"
      description={
        <>
          {vocabulary.beforeProofKind(issue.beforeProofKind)} · {issue.checksFrozenAt === null ? t('issues.checks.notFrozen') : rich('issues.checks.frozenAt', { when: <Time iso={issue.checksFrozenAt} mode="dateTime" /> })}
        </>
      }
    >
      {issue.checks.length === 0 ? (
        <EmptyState compact title={t('issues.checks.none')} description={t('issues.checks.noneDescription')} />
      ) : (
        <ul className="issue-checks" aria-label={t('issues.checks.list')}>
          {issue.checks.map((check) => (
            <CheckItem key={check.path} check={check} />
          ))}
        </ul>
      )}
    </Section>
  );
}
