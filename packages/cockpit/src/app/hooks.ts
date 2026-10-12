import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { CockpitSnapshot, CommandBody, CommandName } from '../contract/index.ts';
import type { DiffTarget, PullRequestDiffState } from '../data/pull-request-diffs.ts';
import type { RunLogView } from '../data/run-log-store.ts';
import type { CockpitState } from '../data/state.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import type { StaleThresholds } from '../model/freshness.ts';
import { useToast } from '../ui/components/Toast.tsx';
import { useServices } from './context.tsx';

export function useCockpitState<T>(selector: (state: CockpitState) => T): T {
  const { store } = useServices();
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}

const selectSnapshot = (state: CockpitState): CockpitSnapshot | null => state.snapshot;

/** The snapshot, or null until the first load succeeds. */
export function useMaybeSnapshot(): CockpitSnapshot | null {
  return useCockpitState(selectSnapshot);
}

/** The snapshot, for the views that are only drawn once it is loaded. */
export function useSnapshot(): CockpitSnapshot {
  const snapshot = useMaybeSnapshot();
  if (snapshot === null) throw new Error('useSnapshot must be used where the snapshot is loaded');
  return snapshot;
}

export function useStaleThresholds(): StaleThresholds {
  return useSnapshot().installation.staleAfterMs;
}

export function useRunLog(runId: string | null): RunLogView {
  const { runLogs, loader } = useServices();
  useEffect(() => {
    if (runId !== null) loader.ensureRunLog(runId);
  }, [runId, loader]);
  const subscribe = useCallback(
    (listener: () => void) => (runId === null ? () => undefined : runLogs.subscribe(runId, listener)),
    [runId, runLogs],
  );
  return useSyncExternalStore(subscribe, () => runLogs.getView(runId ?? ''));
}

export interface PullRequestDiffReading {
  readonly state: PullRequestDiffState;
  /** Reads the diff again, keeping the one already read in view until the new one arrives. */
  readonly reload: () => void;
}

const IDLE_DIFF: PullRequestDiffState = { status: 'idle' };
const NO_RELOAD = (): void => undefined;

/**
 * The diff of a pull request at the head commit the cockpit knows, read from the factory when the
 * hook is given a target and not before; null reads nothing, for a view that has not asked yet.
 */
export function usePullRequestDiff(target: DiffTarget | null): PullRequestDiffReading {
  const { diffs } = useServices();
  const project = target?.project;
  const pullRequestNumber = target?.pullRequestNumber;
  const headSha = target?.headSha;
  const stable = useMemo(
    () => (project === undefined || pullRequestNumber === undefined || headSha === undefined ? null : { project, pullRequestNumber, headSha }),
    [project, pullRequestNumber, headSha],
  );
  useEffect(() => {
    if (stable !== null) diffs.ensure(stable);
  }, [stable, diffs]);
  const subscribe = useCallback((listener: () => void) => (stable === null ? () => undefined : diffs.subscribe(stable, listener)), [stable, diffs]);
  const state = useSyncExternalStore(subscribe, () => (stable === null ? IDLE_DIFF : diffs.getState(stable)));
  const reload = useCallback(() => (stable === null ? NO_RELOAD() : diffs.reload(stable)), [stable, diffs]);
  return { state, reload };
}

export interface CommandRunner {
  /** The command in flight, or null. */
  readonly pending: CommandName | null;
  /**
   * Sends the command. The factory's own description of what it did is shown in a toast when the
   * command is accepted, its error when it is refused. Resolves to whether the command was accepted.
   */
  run<N extends CommandName>(name: N, body: CommandBody<N>): Promise<boolean>;
}

export function useCommand(): CommandRunner {
  const { commands } = useServices();
  const toast = useToast();
  const { t } = useI18n();
  const [pending, setPending] = useState<CommandName | null>(null);
  const run = useCallback(
    async <N extends CommandName>(name: N, body: CommandBody<N>): Promise<boolean> => {
      setPending(name);
      try {
        const accepted = await commands.send(name, body);
        toast.show('success', accepted.effect);
        return true;
      } catch (error) {
        toast.show('error', t('toast.commandFailed'), error instanceof Error ? error.message : String(error));
        return false;
      } finally {
        setPending(null);
      }
    },
    [commands, toast, t],
  );
  return useMemo(() => ({ pending, run }), [pending, run]);
}
