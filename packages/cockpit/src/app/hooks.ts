import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { CockpitSnapshot, CommandBody, CommandName } from '../contract/index.ts';
import type { RunLogView } from '../data/run-log-store.ts';
import type { CockpitState } from '../data/state.ts';
import { useToast } from '../ui/components/Toast.tsx';
import { useServices } from './context.tsx';

export function useCockpitState<T>(selector: (state: CockpitState) => T): T {
  const { store } = useServices();
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}

const selectSnapshot = (state: CockpitState): CockpitSnapshot | null => state.snapshot;

export function useSnapshot(): CockpitSnapshot | null {
  return useCockpitState(selectSnapshot);
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

export interface CommandRunner {
  readonly pending: CommandName | null;
  run<N extends CommandName>(name: N, body: CommandBody<N>, success: string): Promise<boolean>;
}

export function useCommand(): CommandRunner {
  const { commands } = useServices();
  const toast = useToast();
  const [pending, setPending] = useState<CommandName | null>(null);
  const run = useCallback(
    async <N extends CommandName>(name: N, body: CommandBody<N>, success: string): Promise<boolean> => {
      setPending(name);
      try {
        await commands.send(name, body);
        toast.show('success', success);
        return true;
      } catch (error) {
        toast.show('error', 'La commande a échoué', error instanceof Error ? error.message : String(error));
        return false;
      } finally {
        setPending(null);
      }
    },
    [commands, toast],
  );
  return useMemo(() => ({ pending, run }), [pending, run]);
}
