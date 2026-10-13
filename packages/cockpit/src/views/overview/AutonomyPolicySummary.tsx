import type { AutonomyView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';

const TYPE_SEPARATOR = ', ';

/** What a project delegates, and to whom, in the words of the cockpit: the same facts `agent-factory validate` states in a sentence. */
export function AutonomyPolicySummary({ autonomy }: { readonly autonomy: AutonomyView }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const delegatesNothing = !autonomy.validateSpecs && !autonomy.answerDecisions && !autonomy.resume && autonomy.merge.length === 0;
  if (delegatesNothing) return <p className="delegated-policy subtle">{t('autonomy.policy.nothing')}</p>;
  return (
    <div className="delegated-policy" aria-label={t('autonomy.policy.label')}>
      <p>{t('autonomy.policy.intro', { actor: autonomy.actor })}</p>
      <ul>
        {autonomy.validateSpecs ? <li>{t('autonomy.policy.validateSpecs')}</li> : null}
        {autonomy.answerDecisions ? <li>{t('autonomy.policy.answerDecisions')}</li> : null}
        {autonomy.resume ? <li>{t('autonomy.policy.resume')}</li> : null}
        {autonomy.merge.map((rule) => {
          const types = rule.types.map((type) => vocabulary.issueType(type)).join(TYPE_SEPARATOR);
          return (
            <li key={`${rule.types.join('/')}:${rule.requires.join('/')}`}>
              {rule.requires.length === 0
                ? t('autonomy.policy.merge', { types })
                : t('autonomy.policy.mergeWhen', { types, conditions: rule.requires.map((condition) => t(`autonomy.condition.${condition}`)).join(TYPE_SEPARATOR) })}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
