import { useRef, useState } from 'react';
import { Gauge, MemoryStick } from 'lucide-react';
import type { MemoryPressure, ResourceSample, SubscriptionWindowView } from '../contract/index.ts';
import { percent, percentValue, untilTime } from '../format/format.ts';
import { CONNECTION_STATUS_LABELS, MEMORY_PRESSURE_LABELS, WINDOW_LABELS, WINDOW_SHORT_LABELS } from '../i18n/labels.ts';
import { Meter } from '../ui/components/Charts.tsx';
import { Popover } from '../ui/components/Popover.tsx';
import { useNow } from './context.tsx';
import { useCockpitState, useSnapshot } from './hooks.ts';

const SUBSCRIPTION_WARN_RATIO = 0.75;
const SUBSCRIPTION_CRITICAL_RATIO = 0.9;

type MeterTone = 'success' | 'running' | 'failed';

const PRESSURE_TONES: Readonly<Record<MemoryPressure, MeterTone>> = { normal: 'success', warn: 'running', critical: 'failed' };

export function memoryTone(resources: ResourceSample): MeterTone {
  if (resources.pressure !== 'normal') return PRESSURE_TONES[resources.pressure];
  return resources.freeMemoryPercent < resources.thresholdPercent ? 'failed' : 'success';
}

export function subscriptionTone(utilization: number): MeterTone {
  if (utilization >= SUBSCRIPTION_CRITICAL_RATIO) return 'failed';
  if (utilization >= SUBSCRIPTION_WARN_RATIO) return 'running';
  return 'success';
}

function ResourceGauge({ resources }: { readonly resources: ResourceSample }) {
  return (
    <span className="gauge gauge--memory">
      <MemoryStick size={14} aria-hidden="true" className="gauge__icon" />
      <span className="gauge__value num">{percentValue(resources.freeMemoryPercent)}</span>
      <Meter
        size="sm"
        value={resources.freeMemoryPercent / 100}
        marker={resources.thresholdPercent / 100}
        tone={memoryTone(resources)}
        label="Mémoire libre"
        valueText={`${percentValue(resources.freeMemoryPercent)} libre, pression ${MEMORY_PRESSURE_LABELS[resources.pressure]}`}
      />
    </span>
  );
}

function SubscriptionGauge({ windows }: { readonly windows: readonly SubscriptionWindowView[] }) {
  return (
    <span className="gauge gauge--subscription">
      <Gauge size={14} aria-hidden="true" className="gauge__icon" />
      {windows.map((window) => (
        <span key={window.window} className={`gauge__window gauge__window--${window.window}`}>
          <span className="gauge__label">{WINDOW_SHORT_LABELS[window.window]}</span>
          <span className="gauge__value num">{percent(window.utilization)}</span>
          <Meter
            size="sm"
            value={window.utilization}
            tone={subscriptionTone(window.utilization)}
            label={WINDOW_LABELS[window.window]}
            valueText={percent(window.utilization)}
          />
        </span>
      ))}
    </span>
  );
}

export function SystemStatus() {
  const snapshot = useSnapshot();
  const connection = useCockpitState((state) => state.connection);
  const now = useNow();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  if (snapshot === null) return <span className="system-status system-status--loading" aria-hidden="true" />;
  const { resources } = snapshot;
  const windows = snapshot.costs.subscription;
  return (
    <span className="system-status-anchor">
      <button
        ref={anchor}
        type="button"
        className="system-status"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="État de la machine et de l’abonnement"
        onClick={() => setOpen((value) => !value)}
      >
        <ResourceGauge resources={resources} />
        <span className="system-status__divider" aria-hidden="true" />
        <SubscriptionGauge windows={windows} />
        <span className={`connection-dot connection-dot--${connection.status}`} aria-hidden="true" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchor} label="État du système" width={320}>
        <div className="system-panel">
          <section className="system-panel__section">
            <p className="small-caps">Machine</p>
            <div className="system-panel__row">
              <span>Mémoire libre</span>
              <strong className="num">{percentValue(resources.freeMemoryPercent)}</strong>
            </div>
            <Meter
              value={resources.freeMemoryPercent / 100}
              marker={resources.thresholdPercent / 100}
              tone={memoryTone(resources)}
              label="Mémoire libre"
              valueText={percentValue(resources.freeMemoryPercent)}
            />
            <p className="system-panel__hint">
              Pression {MEMORY_PRESSURE_LABELS[resources.pressure]} · seuil {percentValue(resources.thresholdPercent)} ·{' '}
              {resources.schedulingPaused ? 'nouveaux runs suspendus' : 'nouveaux runs autorisés'}
            </p>
          </section>
          <section className="system-panel__section">
            <p className="small-caps">Abonnement Claude</p>
            {windows.map((window) => (
              <div key={window.window} className="system-panel__window">
                <div className="system-panel__row">
                  <span>{WINDOW_LABELS[window.window]}</span>
                  <strong className="num">{percent(window.utilization)}</strong>
                </div>
                <Meter value={window.utilization} tone={subscriptionTone(window.utilization)} label={WINDOW_LABELS[window.window]} valueText={percent(window.utilization)} />
                <p className="system-panel__hint">Réinitialisation {untilTime(window.resetsAt, now)}</p>
              </div>
            ))}
          </section>
          <section className="system-panel__section system-panel__section--inline">
            <span className={`connection-dot connection-dot--${connection.status}`} aria-hidden="true" />
            <span>{CONNECTION_STATUS_LABELS[connection.status]}</span>
          </section>
        </div>
      </Popover>
    </span>
  );
}
