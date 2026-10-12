import { CircleCheck, CircleX } from 'lucide-react';
import type { CheckRunLog, RunOutcomeSummary } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useVocabulary } from '../../i18n/vocabulary.ts';
import { shortSha } from '../../model/identifiers.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { CodeBlock } from '../../ui/components/CodeBlock.tsx';
import { CopyButton } from '../../ui/components/CopyButton.tsx';
import type { EvidenceOf } from './evidence-model.ts';
import { runCounts } from './evidence-model.ts';

const RUN_LOG_MAX_HEIGHT = 260;
const ICON_SIZE = 14;
const COUNT_SEPARATOR = ' · ';

function RunSummary({ summary }: { readonly summary: RunOutcomeSummary }) {
  const { t } = useI18n();
  const counts = runCounts(summary);
  return (
    <div className="red-green__summary">
      <p className="red-green__headline">{counts.length === 0 ? t('pullRequests.redGreen.noTests') : counts.map((entry) => t(`pullRequests.redGreen.${entry.kind}`, { count: entry.count })).join(COUNT_SEPARATOR)}</p>
      {summary.failures.length === 0 ? null : (
        <ul className="red-green__failures" aria-label={t('pullRequests.redGreen.failures')}>
          {summary.failures.map((failure, position) => (
            <li key={`${position}-${failure.test}`} className="red-green__failure">
              <span className="red-green__test mono">{failure.test}</span>
              {failure.message === null ? null : <span className="red-green__message mono">{failure.message}</span>}
            </li>
          ))}
        </ul>
      )}
      {summary.missing.length === 0 ? null : (
        <ul className="red-green__failures" aria-label={t('pullRequests.redGreen.missing')}>
          {summary.missing.map((test) => (
            <li key={test} className="red-green__failure">
              <span className="red-green__test mono">{test}</span>
              <span className="red-green__message">{t('pullRequests.redGreen.missingNote')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface RunPanelProps {
  readonly title: string;
  readonly run: CheckRunLog;
}

function RunPanel({ title, run }: RunPanelProps) {
  const { t } = useI18n();
  const vocabulary = useVocabulary();
  const passed = run.outcome === 'passed';
  return (
    <section className={`red-green__panel red-green__panel--${run.outcome}`} aria-label={title}>
      <header className="red-green__panel-header">
        {passed ? <CircleCheck size={ICON_SIZE} className="red-green__pass" aria-hidden="true" /> : <CircleX size={ICON_SIZE} className="red-green__fail" aria-hidden="true" />}
        <span className="red-green__panel-title">{title}</span>
        {run.sha.length === 0 ? null : (
          <span className="mono" title={run.sha}>
            {shortSha(run.sha)}
          </span>
        )}
        <Badge tone={passed ? 'success' : 'failed'}>{vocabulary.checkRunOutcome(run.outcome)}</Badge>
      </header>
      {run.summary === null ? <p className="red-green__no-summary subtle">{t('pullRequests.redGreen.noSummary')}</p> : <RunSummary summary={run.summary} />}
      <details className="red-green__log" open={run.summary === null}>
        <summary>{t('pullRequests.redGreen.log')}</summary>
        {run.log.trim().length === 0 ? <p className="subtle">{t('pullRequests.redGreen.logEmpty')}</p> : <CodeBlock code={run.log} maxHeight={RUN_LOG_MAX_HEIGHT} wrap />}
      </details>
    </section>
  );
}

export function RedGreenEvidence({ evidence }: { readonly evidence: EvidenceOf<'red-green'> }) {
  const { t } = useI18n();
  return (
    <div className="red-green">
      <div className="red-green__command">
        <span className="small-caps">{t('pullRequests.redGreen.command')}</span>
        <code className="mono">{evidence.command}</code>
        <CopyButton text={evidence.command} label={t('common.copyCommand')} />
      </div>
      <div className="red-green__pair">
        <RunPanel title={t('pullRequests.redGreen.before')} run={evidence.before} />
        <RunPanel title={t('pullRequests.redGreen.after')} run={evidence.after} />
      </div>
    </div>
  );
}
