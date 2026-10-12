import { FileText } from 'lucide-react';
import type { AuditView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { Section } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';

const ICON_SIZE = 13;

/**
 * The files the change touches. They are read from the forge after the change is detected, so a
 * missing list means "not read yet", which is not the same as a change that touches no file.
 */
export function AuditFiles({ audit }: { readonly audit: AuditView }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const files = audit.changedFiles;
  return (
    <Section title={t('audits.files.title')} id="audit-files" description={files === null ? undefined : t('audits.files.count', { count: files.length })}>
      {files === null ? (
        <EmptyState compact title={t('audits.files.notRead')} description={t('audits.files.notReadDescription')} />
      ) : files.length === 0 ? (
        <EmptyState compact title={t('audits.files.empty')} />
      ) : (
        <>
          <ul className="audit-files" aria-label={t('audits.files.list')}>
            {files.map((file) => (
              <li key={file} className="audit-file mono">
                <FileText size={ICON_SIZE} aria-hidden="true" />
                <span className="audit-file__path">{file}</span>
              </li>
            ))}
          </ul>
          <p className="subtle">{audit.suggestedType === null ? t('audits.files.noSuggestion') : t('audits.files.suggested', { type: vocabulary.issueType(audit.suggestedType) })}</p>
        </>
      )}
    </Section>
  );
}
