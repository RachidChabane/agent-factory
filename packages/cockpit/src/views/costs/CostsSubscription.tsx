import type { CostsView, SubscriptionWindowView } from '../../contract/index.ts';
import { dateTime, percent, untilTime } from '../../format/format.ts';
import { WINDOW_LABELS } from '../../i18n/labels.ts';
import { Card, Stat } from '../../ui/components/Card.tsx';
import { Meter } from '../../ui/components/Charts.tsx';
import { utilizationTone } from './costs-model.ts';

interface CostsSubscriptionProps {
  readonly windows: CostsView['subscription'];
  readonly pauseAt: number;
  readonly now: number;
}

function WindowCard({ window, pauseAt, now }: { readonly window: SubscriptionWindowView; readonly pauseAt: number; readonly now: number }) {
  const label = WINDOW_LABELS[window.window];
  const used = percent(window.utilization);
  return (
    <Card className="costs-window" role="group" aria-label={label}>
      <Stat label={label} value={used}>
        <Meter value={window.utilization} label={`Utilisation ${label}`} valueText={used} tone={utilizationTone(window.utilization)} marker={pauseAt} />
        <p className="costs-window__reset">
          <span>Réinitialisation {untilTime(window.resetsAt, now)}</span>
          <span className="costs-window__absolute num">{dateTime(window.resetsAt)}</span>
        </p>
        <p className="costs-window__hint">L’ordonnanceur se met en pause à {percent(pauseAt)}</p>
      </Stat>
    </Card>
  );
}

export function CostsSubscription({ windows, pauseAt, now }: CostsSubscriptionProps) {
  return (
    <div className="costs-windows">
      {windows.map((window) => (
        <WindowCard key={window.window} window={window} pauseAt={pauseAt} now={now} />
      ))}
    </div>
  );
}
