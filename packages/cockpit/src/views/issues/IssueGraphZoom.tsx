import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { IconButton } from '../../ui/components/IconButton.tsx';

export const ZOOM_DEFAULT_PERCENT = 100;
const ZOOM_STEP_PERCENT = 10;
const ZOOM_MIN_PERCENT = 40;
const ZOOM_MAX_PERCENT = 160;
const PERCENT = 100;

function clamp(percent: number): number {
  return Math.min(ZOOM_MAX_PERCENT, Math.max(ZOOM_MIN_PERCENT, percent));
}

export function zoomScale(percent: number): number {
  return percent / PERCENT;
}

interface IssueGraphZoomProps {
  readonly percent: number;
  readonly onChange: (percent: number) => void;
}

export function IssueGraphZoom({ percent, onChange }: IssueGraphZoomProps) {
  const { t, fmt } = useI18n();
  return (
    <div className="issue-graph__zoom" role="group" aria-label={t('issues.graph.zoom')}>
      <IconButton size="sm" label={t('issues.graph.zoomOut')} icon={<Minus size={14} />} disabled={percent <= ZOOM_MIN_PERCENT} onClick={() => onChange(clamp(percent - ZOOM_STEP_PERCENT))} />
      <output className="issue-graph__zoom-value num" aria-label={t('issues.graph.zoomValue')}>
        {fmt.percentPoints(percent)}
      </output>
      <IconButton size="sm" label={t('issues.graph.zoomIn')} icon={<Plus size={14} />} disabled={percent >= ZOOM_MAX_PERCENT} onClick={() => onChange(clamp(percent + ZOOM_STEP_PERCENT))} />
      <IconButton size="sm" label={t('issues.graph.zoomReset')} icon={<RotateCcw size={13} />} disabled={percent === ZOOM_DEFAULT_PERCENT} onClick={() => onChange(ZOOM_DEFAULT_PERCENT)} />
    </div>
  );
}
