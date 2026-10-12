interface SkeletonProps {
  readonly width?: string | undefined;
  readonly height?: number | undefined;
  readonly lines?: number | undefined;
}

const DEFAULT_LINE_HEIGHT = 12;

export function Skeleton({ width = '100%', height = DEFAULT_LINE_HEIGHT, lines = 1 }: SkeletonProps) {
  return (
    <span className="ds-skeleton-group" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="ds-skeleton" style={{ width: index === lines - 1 && lines > 1 ? '62%' : width, height }} />
      ))}
    </span>
  );
}
