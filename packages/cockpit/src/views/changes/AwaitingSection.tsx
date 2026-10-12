import { Link } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import type { AttentionItem } from '../../model/attention.ts';
import { Card, Section } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { ProjectTag } from '../../widgets/ProjectTag.tsx';
import { Time } from '../../widgets/Time.tsx';

const SECTION_ID = 'changes-awaiting';

/** What waits for the operator in any project, whatever the period: the same items as the board's. */
export function AwaitingSection({ items }: { readonly items: readonly AttentionItem[] }) {
  const { t } = useI18n();
  return (
    <Section title={t('changes.awaiting.title')} id={SECTION_ID} description={t('changes.awaiting.description')}>
      {items.length === 0 ? (
        <Card>
          <EmptyState compact title={t('changes.awaiting.empty')} />
        </Card>
      ) : (
        <Card padded={false}>
          <ul className="changes-awaiting">
            {items.map((item) => (
              <li key={item.key}>
                <Link to={item.href} className="changes-awaiting__item">
                  <span className="changes-awaiting__text">
                    <span className="changes-awaiting__title truncate">
                      {item.project === null ? null : <ProjectTag project={item.project} />} <span className="subtle">{item.reference}</span> {item.title}
                    </span>
                    <span className="changes-awaiting__kind">{t(`attention.${item.kind}`)}</span>
                  </span>
                  <Time iso={item.at} className="num subtle" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Section>
  );
}
