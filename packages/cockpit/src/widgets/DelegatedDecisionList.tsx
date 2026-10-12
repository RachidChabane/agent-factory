import './delegated-decisions.css';
import { Link } from 'react-router';
import type { DelegatedDecisionView } from '../contract/index.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { useVocabulary } from '../i18n/vocabulary.ts';
import { paths } from '../model/routes.ts';
import { Time } from './Time.tsx';

interface DelegatedDecisionListProps {
  readonly project: string;
  readonly decisions: readonly DelegatedDecisionView[];
  /** The label the list is announced under. */
  readonly label: string;
}

function TargetLink({ project, decision }: { readonly project: string; readonly decision: DelegatedDecisionView }) {
  const { t } = useI18n();
  const { target } = decision;
  return target.kind === 'pull-request' ? (
    <Link to={paths.pullRequest(project, target.number)} className="link">
      {t('autonomy.decision.pullRequest', { number: target.number })}
    </Link>
  ) : (
    <Link to={paths.issue(project, target.number)} className="link">
      {t('autonomy.decision.issue', { number: target.number })}
    </Link>
  );
}

/** The gestures the delegate made, each with what it did, on what, when, who, the reason it gave and the rule that allowed it. */
export function DelegatedDecisionList({ project, decisions, label }: DelegatedDecisionListProps) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  return (
    <ul className="delegated-decisions" aria-label={label}>
      {decisions.map((decision) => (
        <li key={`${decision.at}/${decision.gesture}/${decision.target.kind}/${decision.target.number}`} className="delegated-decision">
          <p className="delegated-decision__head">
            <span className="delegated-decision__gesture">{vocabulary.delegableGesture(decision.gesture)}</span>
            <TargetLink project={project} decision={decision} />
            <span className="subtle">{t('autonomy.decision.by', { actor: decision.actor })}</span>
            <Time iso={decision.at} className="num subtle" />
          </p>
          <p className="delegated-decision__reason">{t('autonomy.decision.reason', { reason: decision.reason })}</p>
          <p className="delegated-decision__rule subtle mono">{t('autonomy.decision.rule', { rule: decision.rule })}</p>
        </li>
      ))}
    </ul>
  );
}
