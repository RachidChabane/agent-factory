import type { IssueTypeInfo } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Card } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { commitPrefix } from './issue-type-model.ts';

function IssueTypeItem({ type }: { readonly type: IssueTypeInfo }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  return (
    <li className="issue-type">
      <div className="issue-type__head">
        <span className="issue-type__name">{vocabulary.issueType(type.id)}</span>
        <Badge mono title={t('settings.issueTypes.label')}>
          {type.label}
        </Badge>
      </div>
      <dl className="issue-type__facts">
        <div>
          <dt>{t('settings.issueTypes.proof')}</dt>
          <dd>{vocabulary.proofStrategy(type.proof)}</dd>
        </div>
        <div>
          <dt>{t('settings.issueTypes.commit')}</dt>
          <dd>
            <code>{commitPrefix(type)}</code>
          </dd>
        </div>
        <div className="issue-type__checks">
          <dt>{t('settings.issueTypes.checks')}</dt>
          <dd>{type.checks}</dd>
        </div>
      </dl>
    </li>
  );
}

/** The kinds of issue the project accepts, with the proof each one needs and how its commits are typed. */
export function IssueTypeList({ types }: { readonly types: readonly IssueTypeInfo[] }) {
  const { t } = useI18n();
  if (types.length === 0) return <EmptyState compact title={t('settings.issueTypes.empty')} />;
  return (
    <Card padded={false}>
      <ul className="issue-type-list" aria-label={t('settings.issueTypes.title')}>
        {types.map((type) => (
          <IssueTypeItem key={type.id} type={type} />
        ))}
      </ul>
    </Card>
  );
}
