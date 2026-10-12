import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { Gauge, MemoryStick } from 'lucide-react';
import type { MemoryPressure, UsageAccountView, UsageLimitView } from '../contract/index.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { MINUTE_MS } from '../i18n/formatters.ts';
import { useVocabulary } from '../i18n/vocabulary.ts';
import { paths } from '../model/routes.ts';
import { currentLimits, effectiveFreshness, latestReadFailed, limitTone } from '../model/usage.ts';
import { Meter } from '../ui/components/Charts.tsx';
import { Popover } from '../ui/components/Popover.tsx';
import { AccountLabel } from '../widgets/AccountLabel.tsx';
import { ReadStamp } from '../widgets/ReadStamp.tsx';
import { useNow } from './context.tsx';
import { useCockpitState, useMaybeSnapshot } from './hooks.ts';

type MeterTone = 'success' | 'running' | 'failed';

const PRESSURE_TONES: Readonly<Record<MemoryPressure, MeterTone>> = { normal: 'success', warn: 'running', critical: 'failed' };

export function memoryTone(sample: { readonly freeMemoryPercent: number; readonly pressure: MemoryPressure }, minimumFreeMemoryPercent: number): MeterTone {
  if (sample.pressure !== 'normal') return PRESSURE_TONES[sample.pressure];
  return sample.freeMemoryPercent < minimumFreeMemoryPercent ? 'failed' : 'success';
}

function highestUtilization(accounts: readonly UsageAccountView[], now: number): number | null {
  const utilizations = accounts.flatMap((account) => currentLimits(account, now)).map((limit) => limit.utilization);
  return utilizations.length === 0 ? null : Math.max(...utilizations);
}

function LimitRow({ limit }: { readonly limit: UsageLimitView }) {
  const { t, fmt } = useI18n();
  const vocabulary = useVocabulary();
  const now = useNow();
  const name = limit.scope === null ? vocabulary.usageLimitKind(limit.kind) : `${vocabulary.usageLimitKind(limit.kind)} · ${limit.scope}`;
  const freshness = effectiveFreshness(limit, now);
  const showValue = freshness === 'fresh';
  return (
    <div className="system-panel__window">
      <div className="system-panel__row">
        <span>{name}</span>
        <strong className="num">{showValue ? fmt.percent(limit.utilization) : vocabulary.usageFreshness(freshness)}</strong>
      </div>
      {showValue ? <Meter value={limit.utilization} marker={limit.pauseAt} tone={limitTone(limit)} label={name} valueText={fmt.percent(limit.utilization)} /> : null}
      {limit.resetsAt === null || freshness === 'window-reset' ? (
        freshness === 'window-reset' ? <p className="system-panel__hint">{t('status.limitWindowReset')}</p> : null
      ) : (
        <p className="system-panel__hint">{t('status.limitResets', { when: fmt.until(limit.resetsAt, now) })}</p>
      )}
    </div>
  );
}

export function SystemStatus() {
  const { t, fmt } = useI18n();
  const vocabulary = useVocabulary();
  const snapshot = useMaybeSnapshot();
  const connection = useCockpitState((state) => state.connection);
  const now = useNow();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  if (snapshot === null) return <span className="system-status system-status--loading" aria-hidden="true" />;
  const { resources, usage, installation } = snapshot;
  const sample = resources.sample.value;
  const highest = highestUtilization(usage.accounts, now);
  const slots = installation.runSlots;
  return (
    <span className="system-status-anchor">
      <button ref={anchor} type="button" className="system-status" aria-expanded={open} aria-haspopup="dialog" aria-label={t('status.label')} onClick={() => setOpen((value) => !value)}>
        {sample === null ? null : (
          <span className="gauge gauge--memory">
            <MemoryStick size={14} aria-hidden="true" className="gauge__icon" />
            <span className="gauge__value num">{fmt.percentPoints(sample.freeMemoryPercent)}</span>
            <Meter
              size="sm"
              value={sample.freeMemoryPercent / 100}
              marker={resources.minimumFreeMemoryPercent / 100}
              tone={memoryTone(sample, resources.minimumFreeMemoryPercent)}
              label={t('status.memory')}
              valueText={fmt.percentPoints(sample.freeMemoryPercent)}
            />
          </span>
        )}
        <span className="system-status__divider" aria-hidden="true" />
        <span className="gauge gauge--slots">
          <span className="gauge__label">{t('sidebar.slots', { running: fmt.integer(slots.running), limit: fmt.integer(slots.limit) })}</span>
        </span>
        {highest === null ? null : (
          <>
            <span className="system-status__divider" aria-hidden="true" />
            <span className="gauge gauge--subscription">
              <Gauge size={14} aria-hidden="true" className="gauge__icon" />
              <span className="gauge__label">{t('status.gaugeUsage')}</span>
              <span className="gauge__value num">{fmt.percent(highest)}</span>
            </span>
          </>
        )}
        <span className={`connection-dot connection-dot--${connection.status}`} aria-hidden="true" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchor} label={t('status.label')} width={340}>
        <div className="system-panel">
          <section className="system-panel__section">
            <p className="small-caps">{t('status.machine')}</p>
            {sample === null ? (
              <p className="system-panel__hint">{t('status.noSample')}</p>
            ) : (
              <>
                <div className="system-panel__row">
                  <span>{t('status.memory')}</span>
                  <strong className="num">{fmt.percentPoints(sample.freeMemoryPercent)}</strong>
                </div>
                <Meter
                  value={sample.freeMemoryPercent / 100}
                  marker={resources.minimumFreeMemoryPercent / 100}
                  tone={memoryTone(sample, resources.minimumFreeMemoryPercent)}
                  label={t('status.memory')}
                  valueText={fmt.percentPoints(sample.freeMemoryPercent)}
                />
                <p className="system-panel__hint">
                  {t('status.memoryDetail', { pressure: vocabulary.memoryPressure(sample.pressure), threshold: fmt.percentPoints(resources.minimumFreeMemoryPercent) })} ·{' '}
                  {resources.schedulingPaused ? t('status.schedulingPaused') : t('status.schedulingAllowed')}
                </p>
              </>
            )}
            <ReadStamp readAt={resources.sample.readAt} error={resources.sample.error} kind="resources" />
          </section>
          <section className="system-panel__section">
            <p className="small-caps">{t('status.slots')}</p>
            <div className="system-panel__row">
              <span>{t('status.slotsValue', { running: fmt.integer(slots.running), limit: fmt.integer(slots.limit) })}</span>
              {slots.queued > 0 ? <strong className="num">{t('sidebar.queued', { count: fmt.integer(slots.queued) })}</strong> : null}
            </div>
          </section>
          <section className="system-panel__section">
            <p className="small-caps">{t('status.subscription')}</p>
            {usage.accounts.every((account) => account.limits.length === 0) ? <p className="system-panel__hint">{t('status.noUsage')}</p> : null}
            {usage.accounts
              .filter((account) => account.limits.length > 0)
              .map((account) => (
                <div key={account.name} className="system-panel__account">
                  <p className="system-panel__account-name">
                    <AccountLabel name={account.name} identity={account.identity} />
                  </p>
                  {account.limits.map((limit) => (
                    <LimitRow key={`${limit.kind}-${limit.scope ?? ''}`} limit={limit} />
                  ))}
                  <ReadStamp
                    readAt={account.readAt}
                    error={latestReadFailed(account) ? (account.lastFailure?.reason ?? null) : null}
                    staleAfterMs={usage.staleAfterMinutes * MINUTE_MS}
                  />
                </div>
              ))}
            <Link to={paths.usage()} className="link" onClick={() => setOpen(false)}>
              {t('status.openUsage')}
            </Link>
          </section>
          <section className="system-panel__section system-panel__section--inline">
            <span className={`connection-dot connection-dot--${connection.status}`} aria-hidden="true" />
            <span>
              {t('status.connection')}: {t(`connection.${connection.status}`)}
            </span>
          </section>
        </div>
      </Popover>
    </span>
  );
}
