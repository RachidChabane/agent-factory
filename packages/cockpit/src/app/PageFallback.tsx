import { Skeleton } from '../ui/components/Skeleton.tsx';

export function PageFallback() {
  return (
    <div className="page page--wide" aria-busy="true" aria-label="Chargement">
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
