import './usage.css';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Page, PageHeader } from '../../ui/layout/Page.tsx';
import { CostsSection } from './CostsSection.tsx';
import { SubscriptionSection } from './SubscriptionSection.tsx';

export function UsageView() {
  const { t } = useI18n();
  return (
    <Page>
      <PageHeader title={t('nav.usage')} description={t('usage.description')} />
      <SubscriptionSection />
      <CostsSection />
    </Page>
  );
}
