import { useNow } from '../../app/context.tsx';
import type { UsageLimitView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { freshnessMark } from '../../model/status.ts';
import { effectiveFreshness, limitTone } from '../../model/usage.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Meter } from '../../ui/components/Charts.tsx';
import { Time } from '../../widgets/Time.tsx';
import { resetOf } from './usage-model.ts';

/** An instant as how far away it is, with the exact date and time beside it. */
function Instant({ iso }: { readonly iso: string }) {
  return (
    <>
      <Time iso={iso} mode="until" /> <span className="subtle">(<Time iso={iso} mode="dateTime" />)</span>
    </>
  );
}

/** A limit whose window was reset: what it reads says nothing about the current window, so no meter is drawn. */
function ResetWindow({ limit }: { readonly limit: UsageLimitView }) {
  const { t, fmt, rich } = useI18n();
  const now = useNow();
  const reset = resetOf(limit, now);
  return (
    <div className="usage-limit__reset-window">
      {reset.kind === 'elapsed' ? <p className="usage-limit__note">{rich('usage.limit.windowReset', { when: <Time iso={reset.at} /> })}</p> : null}
      <p className="usage-limit__note">{t('usage.limit.windowResetBody')}</p>
      {reset.kind === 'upcoming' ? <p className="usage-limit__note">{rich('usage.limit.resets', { when: <Instant iso={reset.at} /> })}</p> : null}
      <p className="usage-limit__note usage-limit__previous">{rich('usage.limit.previousWindow', { percent: <s>{fmt.percent(limit.utilization)}</s> })}</p>
    </div>
  );
}

/** A limit that still describes its window: how much of it is used, where the factory pauses, and when it resets. */
function OpenWindow({ limit, label }: { readonly limit: UsageLimitView; readonly label: string }) {
  const { t, fmt, rich } = useI18n();
  const now = useNow();
  const reset = resetOf(limit, now);
  const used = fmt.percent(limit.utilization);
  return (
    <>
      <div className="usage-limit__value">
        <span className="usage-limit__percent num">{used}</span>
        <Meter value={limit.utilization} marker={limit.pauseAt} tone={limitTone(limit)} label={t('usage.limit.meter', { name: label })} valueText={used} />
      </div>
      <p className="usage-limit__note">{t('usage.limit.pauseAt', { percent: fmt.percent(limit.pauseAt) })}</p>
      <p className="usage-limit__note">{reset.kind === 'upcoming' ? rich('usage.limit.resets', { when: <Instant iso={reset.at} /> }) : t('usage.limit.resetUnknown')}</p>
    </>
  );
}

export function LimitRow({ limit }: { readonly limit: UsageLimitView }) {
  const { t, rich } = useI18n();
  const vocabulary = useVocabulary();
  const now = useNow();
  const freshness = effectiveFreshness(limit, now);
  const kind = vocabulary.usageLimitKind(limit.kind);
  const label = limit.scope === null ? kind : t('usage.limit.name', { kind, model: limit.scope });
  return (
    <li className={`usage-limit is-${freshness}`}>
      <div className="usage-limit__head">
        <span className="usage-limit__name">{limit.scope === null ? kind : rich('usage.limit.name', { kind, model: <span className="mono">{limit.scope}</span> })}</span>
        <Badge tone={freshnessMark(freshness)} title={freshness === 'stale' ? t('usage.limit.staleHint') : undefined}>
          {vocabulary.usageFreshness(freshness)}
        </Badge>
      </div>
      {freshness === 'window-reset' ? <ResetWindow limit={limit} /> : <OpenWindow limit={limit} label={label} />}
    </li>
  );
}
