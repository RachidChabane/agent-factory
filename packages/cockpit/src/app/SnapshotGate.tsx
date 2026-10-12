import type { ReactNode } from 'react';
import { CloudOff } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { EmptyState } from '../ui/components/EmptyState.tsx';
import { Page } from '../ui/layout/Page.tsx';
import { useCockpitState } from './hooks.ts';
import { PageFallback } from './PageFallback.tsx';

/** Draws its children once the factory's snapshot is loaded; until then, a skeleton or the reason it cannot be. */
export function SnapshotGate({ children }: { readonly children: ReactNode }) {
  const { t } = useI18n();
  const loaded = useCockpitState((state) => state.snapshot !== null);
  const loadError = useCockpitState((state) => state.loadError);
  if (loaded) return <>{children}</>;
  if (loadError === null) return <PageFallback />;
  return (
    <Page width="narrow">
      <EmptyState icon={<CloudOff size={16} />} title={t('shell.loadFailedTitle')} description={t('shell.loadFailedDescription', { error: loadError })} />
    </Page>
  );
}
