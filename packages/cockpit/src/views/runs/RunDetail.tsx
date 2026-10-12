import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Clock, Coins, Cpu, GitBranch, Hash, RotateCcw, Square, Wrench } from 'lucide-react';
import { useNow, useServices } from '../../app/context.tsx';
import { useCommand, useRunLog } from '../../app/hooks.ts';
import type { AgentRunOutcome, CockpitSnapshot, RunView } from '../../contract/index.ts';
import { compact, dateTime, duration, integer, relativeTime, toEpoch, usd } from '../../format/format.ts';
import { EFFORT_LABELS, ROLE_LABELS, RUN_OUTCOME_LABELS, RUN_STATUS_LABELS } from '../../i18n/labels.ts';
import { VIEW_PATHS } from '../../model/routes.ts';
import { runMark } from '../../model/status.ts';
import { describeSubject } from '../../model/subjects.ts';
import { Badge, type BadgeTone } from '../../ui/components/Badge.tsx';
import { Button } from '../../ui/components/Button.tsx';
import { Card } from '../../ui/components/Card.tsx';
import { Meter } from '../../ui/components/Charts.tsx';
import { CopyButton } from '../../ui/components/CopyButton.tsx';
import { Dialog } from '../../ui/components/Dialog.tsx';
import { RoleGlyph } from '../../ui/components/RoleGlyph.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { tabPanelId, Tabs } from '../../ui/components/Tabs.tsx';
import { DetailHeader, MetaItem } from '../../ui/layout/Page.tsx';
import { GatePanel } from './GatePanel.tsx';
import { LogViewer } from './LogViewer.tsx';
import { QuestionPanel } from './QuestionPanel.tsx';
import { buildSubagentTree } from './run-log-model.ts';
import { SubagentTree } from './SubagentTree.tsx';
import { isCostPending, runCost } from './run-cost.ts';

const LIVE_TICK_MS = 1000;
const RUN_OUTCOME_TONES: Readonly<Record<AgentRunOutcome, BadgeTone>> = {
  success: 'success',
  'decision-requested': 'waiting',
  'max-turns': 'failed',
  'budget-exceeded': 'failed',
  error: 'failed',
  timeout: 'failed',
  aborted: 'failed',
};
const BUDGET_WARN_RATIO = 0.75;
const BUDGET_CRITICAL_RATIO = 0.9;
const RUN_TABS = ['log', 'subagents', 'gate'] as const;
type RunTab = (typeof RUN_TABS)[number];
const RUN_TAB_LABELS: Readonly<Record<RunTab, string>> = { log: 'Journal', subagents: 'Sous-agents', gate: 'Gate' };
const RESUMABLE_STATUSES: readonly RunView['status'][] = ['stopped', 'failed'];
const STOPPABLE_STATUSES: readonly RunView['status'][] = ['running', 'waiting'];
const TAB_PREFIX = 'run-tabs';

function useLiveNow(live: boolean): number {
  const shared = useNow();
  const { clock } = useServices();
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => {
    if (!live) return undefined;
    const handle = setInterval(() => setNow(clock.now()), LIVE_TICK_MS);
    return () => clearInterval(handle);
  }, [live, clock]);
  return live ? Math.max(now, shared) : shared;
}

function budgetTone(ratio: number): 'success' | 'running' | 'failed' {
  if (ratio >= BUDGET_CRITICAL_RATIO) return 'failed';
  if (ratio >= BUDGET_WARN_RATIO) return 'running';
  return 'success';
}

interface RunDetailProps {
  readonly run: RunView;
  readonly snapshot: CockpitSnapshot;
}

export function RunDetail({ run, snapshot }: RunDetailProps) {
  const live = STOPPABLE_STATUSES.includes(run.status);
  const now = useLiveNow(live);
  const log = useRunLog(run.id);
  const command = useCommand();
  const [tab, setTab] = useState<RunTab>('log');
  const [confirmStop, setConfirmStop] = useState(false);
  const subject = describeSubject(snapshot, run.subject);
  const elapsed = (run.endedAt === null ? now : toEpoch(run.endedAt)) - toEpoch(run.startedAt);
  const budgetRatio = run.maxBudgetUsd === 0 ? 0 : run.costUsd / run.maxBudgetUsd;
  const costPending = isCostPending(run);
  const turnsRatio = run.maxTurns === 0 ? 0 : run.turns / run.maxTurns;
  const subagentCount = buildSubagentTree(log.entries).length;
  const tokens = run.usage.inputTokens + run.usage.outputTokens;

  return (
    <article className="detail run-detail">
      <DetailHeader
        back={{ to: VIEW_PATHS.runs, label: 'Tous les runs' }}
        eyebrow={
          <>
            <StatusMark mark={runMark(run.status)} />
            <span>{RUN_STATUS_LABELS[run.status]}</span>
            {run.outcome === null ? null : <Badge tone={RUN_OUTCOME_TONES[run.outcome]}>{RUN_OUTCOME_LABELS[run.outcome]}</Badge>}
            <span className="mono">{run.id}</span>
            <CopyButton text={run.id} label="Copier l’identifiant du run" />
          </>
        }
        title={
          <>
            {subject.href === null ? <span className="run-detail__reference">{subject.reference}</span> : (
              <Link to={subject.href} className="run-detail__reference">
                {subject.reference}
              </Link>
            )}{' '}
            {subject.title}
          </>
        }
        actions={
          <>
            {RESUMABLE_STATUSES.includes(run.status) && run.subject.kind === 'issue' ? (
              <Button
                variant="secondary"
                icon={<RotateCcw size={14} />}
                loading={command.pending === 'run.resume'}
                onClick={() => void command.run('run.resume', { runId: run.id }, 'Run relancé')}
              >
                Reprendre
              </Button>
            ) : null}
            {live ? (
              <Button variant="danger" icon={<Square size={13} />} onClick={() => setConfirmStop(true)}>
                Arrêter
              </Button>
            ) : null}
          </>
        }
        meta={
          <>
            <MetaItem icon={<RoleGlyph role={run.role} size={13} />}>{ROLE_LABELS[run.role]}</MetaItem>
            <MetaItem icon={<Cpu size={13} />}>
              <span className="mono">{run.model}</span> · effort {EFFORT_LABELS[run.effort].toLocaleLowerCase('fr-FR')}
            </MetaItem>
            <MetaItem icon={<Hash size={13} />}>tentative {run.attempt}</MetaItem>
            {run.branch === null ? null : (
              <MetaItem icon={<GitBranch size={13} />}>
                <span className="mono truncate">{run.branch}</span>
              </MetaItem>
            )}
            <MetaItem icon={<Clock size={13} />}>démarré le {dateTime(run.startedAt)}</MetaItem>
          </>
        }
      />

      {run.pendingQuestion === null ? null : <QuestionPanel runId={run.id} question={run.pendingQuestion} />}

      <div className="run-stats">
        <Card className="run-stat">
          <span className="run-stat__label">
            <Clock size={13} aria-hidden="true" /> Durée
          </span>
          <span className="run-stat__value num">{duration(elapsed)}</span>
          <span className="run-stat__hint">{live ? 'en cours' : `terminé ${relativeTime(run.endedAt ?? run.startedAt, now)}`}</span>
        </Card>
        <Card className="run-stat">
          <span className="run-stat__label">
            <Coins size={13} aria-hidden="true" /> Coût
          </span>
          <span className="run-stat__value num">{runCost(run)}</span>
          <Meter size="sm" value={budgetRatio} tone={budgetTone(budgetRatio)} label="Budget consommé" valueText={`${usd(run.costUsd)} sur ${usd(run.maxBudgetUsd)}`} />
          <span className="run-stat__hint num">{costPending ? `connu en fin de run · budget ${usd(run.maxBudgetUsd)}` : `budget ${usd(run.maxBudgetUsd)}`}</span>
        </Card>
        <Card className="run-stat">
          <span className="run-stat__label">
            <Hash size={13} aria-hidden="true" /> Tours
          </span>
          <span className="run-stat__value num">
            {integer(run.turns)}
            <span className="run-stat__of"> / {integer(run.maxTurns)}</span>
          </span>
          <Meter size="sm" value={turnsRatio} tone={budgetTone(turnsRatio)} label="Tours consommés" valueText={`${run.turns} sur ${run.maxTurns}`} />
        </Card>
        <Card className="run-stat">
          <span className="run-stat__label">Jetons</span>
          <span className="run-stat__value num">{compact(tokens)}</span>
          <span className="run-stat__hint num">
            {compact(run.usage.inputTokens)} entrée · {compact(run.usage.outputTokens)} sortie · {compact(run.usage.cacheReadTokens)} cache
          </span>
        </Card>
        <Card className="run-stat">
          <span className="run-stat__label">
            <Wrench size={13} aria-hidden="true" /> Outil en cours
          </span>
          <span className="run-stat__value run-stat__value--tool mono truncate">{run.currentTool ?? '—'}</span>
          <span className="run-stat__hint">{subagentCount > 0 ? `${subagentCount} sous-agent${subagentCount > 1 ? 's' : ''}` : 'aucun sous-agent'}</span>
        </Card>
      </div>

      <div className="run-tabs">
        <Tabs
          label="Sections du run"
          idPrefix={TAB_PREFIX}
          value={tab}
          onChange={setTab}
          items={RUN_TABS.map((entry) => ({
            id: entry,
            label: RUN_TAB_LABELS[entry],
            count: entry === 'subagents' ? subagentCount : entry === 'log' ? log.lineCount : undefined,
          }))}
        />
        <div role="tabpanel" id={tabPanelId(TAB_PREFIX, tab)} aria-label={RUN_TAB_LABELS[tab]} className="run-tabs__panel">
          {tab === 'log' ? <LogViewer key={run.id} log={log} live={live} /> : null}
          {tab === 'subagents' ? <SubagentTree entries={log.entries} now={now} sessionLabel={`Session ${ROLE_LABELS[run.role].toLocaleLowerCase('fr-FR')}`} /> : null}
          {tab === 'gate' ? <GatePanel entries={log.entries} /> : null}
        </div>
      </div>

      <Dialog
        open={confirmStop}
        onClose={() => setConfirmStop(false)}
        size="sm"
        title="Arrêter ce run ?"
        description={`L’agent ${ROLE_LABELS[run.role].toLocaleLowerCase('fr-FR')} sera interrompu et ${subject.reference} passera en intervention requise.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmStop(false)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              loading={command.pending === 'run.stop'}
              onClick={() => {
                void command.run('run.stop', { runId: run.id }, 'Run arrêté').then(() => setConfirmStop(false));
              }}
            >
              Arrêter le run
            </Button>
          </>
        }
      />
    </article>
  );
}
