import { useI18n } from '../i18n/I18nProvider.tsx';
import { Skeleton } from '../ui/components/Skeleton.tsx';

export function PageFallback() {
  const { t } = useI18n();
  return (
    <div className="page page--wide" aria-busy="true" aria-label={t('common.pageLoading')}>
      <div className="page-fallback">
        <Skeleton width="220px" height={22} />
        <Skeleton width="100%" height={36} />
        <div className="page-fallback__grid">
          <Skeleton height={180} />
          <Skeleton height={180} />
          <Skeleton height={180} />
        </div>
      </div>
    </div>
  );
}
