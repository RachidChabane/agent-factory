import type { AuditView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { CodeBlock } from '../../ui/components/CodeBlock.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { PublishedIssueLink } from './PublishedIssueLink.tsx';

const DRAFT_BODY_MAX_HEIGHT = 280;

/** The follow-up issue the auditor drafted, and whether it has been published on the repository. */
export function AuditDraft({ audit }: { readonly audit: AuditView }) {
  const { t } = useI18n();
  const { draft, publishedIssueNumber, publishedIssueUrl } = audit;
  return (
    <Section
      title={t('audits.draft.title')}
      id="audit-draft"
      description={draft !== null && publishedIssueNumber === null ? t('audits.draft.unpublished') : undefined}
      actions={publishedIssueNumber === null ? undefined : <PublishedIssueLink number={publishedIssueNumber} url={publishedIssueUrl} />}
    >
      {draft === null ? (
        publishedIssueNumber === null ? <EmptyState compact title={t('audits.draft.none')} description={t('audits.draft.noneDescription')} /> : null
      ) : (
        <div className="audit-draft">
          <p className="audit-draft__title">{draft.title}</p>
          <CodeBlock code={draft.body} wrap title={t('audits.draft.bodyTitle')} maxHeight={DRAFT_BODY_MAX_HEIGHT} />
        </div>
      )}
    </Section>
  );
}
