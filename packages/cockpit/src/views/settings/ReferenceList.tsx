import type { ReferenceView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { shortSha } from '../../model/identifiers.ts';
import { referenceMark } from '../../model/status.ts';
import { Card } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { ReadStamp } from '../../widgets/ReadStamp.tsx';

const NO_COMMIT = '—';

function ReferenceRow({ reference }: { readonly reference: ReferenceView }) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const { value, readAt, error } = reference.snapshot;
  const status = value?.status ?? null;
  const label = status === null ? t('settings.references.unread') : vocabulary.referenceSnapshotStatus(status);
  const commit = value?.commit ?? null;
  return (
    <li className="reference-row" aria-label={reference.name}>
      <div className="reference-row__identity">
        <span className="reference-row__name mono">{reference.name}</span>
        <span className="reference-row__status">
          <StatusMark mark={referenceMark(status)} label={label} />
          {label}
        </span>
      </div>
      <div className="reference-row__body">
        <p className="reference-row__source mono">
          {reference.repository} @ {reference.ref}
        </p>
        <p className="reference-row__commit">
          <span className="reference-row__label">{t('settings.references.commit')}</span>{' '}
          <span className="mono" title={commit ?? undefined}>
            {commit === null ? NO_COMMIT : shortSha(commit)}
          </span>
        </p>
        {status === null || status === 'ready' ? null : <p className="reference-row__hint subtle">{t(`settings.references.hint.${status}`)}</p>}
        <ReadStamp readAt={readAt} error={error} kind="references" />
      </div>
    </li>
  );
}

/** The repositories the specifications of a project cite, each with the state of its snapshot and when that state was read. */
export function ReferenceList({ references }: { readonly references: readonly ReferenceView[] }) {
  const { t } = useI18n();
  if (references.length === 0) return <EmptyState compact title={t('settings.references.empty')} />;
  return (
    <Card padded={false}>
      <ul className="reference-list" aria-label={t('settings.references.title')}>
        {references.map((reference) => (
          <ReferenceRow key={reference.name} reference={reference} />
        ))}
      </ul>
    </Card>
  );
}
