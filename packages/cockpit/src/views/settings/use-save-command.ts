import { useCommand } from '../../app/hooks.ts';
import type { CommandBody, CommandName } from '../../contract/index.ts';

export interface SaveCommand {
  /** Whether the form holds a valid change and no save is in flight. */
  readonly canSave: boolean;
  /** Whether the command is in flight. */
  readonly pending: boolean;
  readonly save: () => void;
}

/**
 * Sends one settings command for a form. Nothing is sent unless the form is valid (`body` is not
 * null) and differs from what the factory holds; the factory's reply or refusal is shown in a toast.
 */
export function useSaveCommand<Name extends CommandName>(command: Name, body: CommandBody<Name> | null, changed: boolean): SaveCommand {
  const runner = useCommand();
  const pending = runner.pending === command;
  const change = changed ? body : null;
  return {
    canSave: change !== null && !pending,
    pending,
    save: () => {
      if (change !== null) void runner.run(command, change);
    },
  };
}
