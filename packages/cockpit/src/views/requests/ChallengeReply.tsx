import type { ChallengeReport } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { CopyButton } from '../../ui/components/CopyButton.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';

export function ChallengeReply({ report }: { readonly report: ChallengeReport }) {
  const { t } = useI18n();
  const hasReply = report.reply.trim().length > 0;
  return (
    <Section title={t('requests.reply.title')} id="request-reply" actions={hasReply ? <CopyButton text={report.reply} label={t('requests.reply.copy')} withText /> : undefined}>
      {hasReply ? <div className="request-reply">{report.reply}</div> : <EmptyState compact title={t('requests.reply.empty')} />}
    </Section>
  );
}
