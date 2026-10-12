import './run-detail.css';
import { useState } from 'react';
import { useNow } from '../../app/context.tsx';
import { useRunLog, useSnapshot } from '../../app/hooks.ts';
import type { RunView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { costBasisOfRun } from '../../model/cost-basis.ts';
import { isLiveRun } from '../../model/projects.ts';
import { describeRunSubject } from '../../model/subjects.ts';
import { tabId, tabPanelId, Tabs } from '../../ui/components/Tabs.tsx';
import { GatePanel } from './GatePanel.tsx';
import { LogViewer } from './LogViewer.tsx';
import { QuestionPanel } from './QuestionPanel.tsx';
import { RunHeader } from './RunHeader.tsx';
import { RunStats } from './RunStats.tsx';
import { SubagentTree } from './SubagentTree.tsx';

const RUN_TABS = ['log', 'subagents', 'gate'] as const;
type RunTab = (typeof RUN_TABS)[number];
const TAB_PREFIX = 'run-tabs';

interface RunDetailProps {
  readonly run: RunView;
  /** The list the run is shown in, which is where the way back leads. */
  readonly listPath: string;
}

/** One run: who ran it and on what, the question it waits on, its figures, and its log, subagents and gate. */
export function RunDetail({ run, listPath }: RunDetailProps) {
  const { t } = useI18n();
  const snapshot = useSnapshot();
  const now = useNow();
  const log = useRunLog(run.id);
  const [tab, setTab] = useState<RunTab>('log');
  const live = isLiveRun(run);
  const subject = describeRunSubject(snapshot, run);
  const tabLabels: Readonly<Record<RunTab, string>> = { log: t('runs.tabs.log'), subagents: t('runs.tabs.subagents'), gate: t('runs.tabs.gate') };
  const tabCounts: Readonly<Record<RunTab, number | undefined>> = { log: log.lineCount, subagents: run.subagents.length, gate: undefined };
  return (
    <article className="detail run-detail">
      <RunHeader run={run} subject={subject} listPath={listPath} />
      {run.pendingQuestion === null ? null : <QuestionPanel runId={run.id} question={run.pendingQuestion} />}
      <RunStats run={run} basis={costBasisOfRun(snapshot, run)} now={now} />
      <div className="run-tabs">
        <Tabs<RunTab> label={t('runs.tabs.label')} idPrefix={TAB_PREFIX} value={tab} onChange={setTab} items={RUN_TABS.map((entry) => ({ id: entry, label: tabLabels[entry], count: tabCounts[entry] }))} />
        <div role="tabpanel" id={tabPanelId(TAB_PREFIX, tab)} aria-labelledby={tabId(TAB_PREFIX, tab)} className="run-tabs__panel">
          {tab === 'log' ? <LogViewer log={log} live={live} recordedLines={run.logLength} /> : null}
          {tab === 'subagents' ? <SubagentTree log={log} now={now} /> : null}
          {tab === 'gate' ? <GatePanel log={log} /> : null}
        </div>
      </div>
    </article>
  );
}
