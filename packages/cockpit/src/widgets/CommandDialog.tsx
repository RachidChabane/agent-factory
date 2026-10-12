import type { ReactNode } from 'react';
import { useCommand } from '../app/hooks.ts';
import type { CommandBody, CommandName } from '../contract/index.ts';
import type { ConfirmCopy } from './ConfirmDialog.tsx';
import { ConfirmDialog } from './ConfirmDialog.tsx';

interface CommandDialogProps<Name extends CommandName> extends ConfirmCopy {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly command: Name;
  /** The body to send, or null while the form is not valid. */
  readonly body: CommandBody<Name> | null;
  /** Called when the operator confirms a form that is not valid yet, to show what is missing. */
  readonly onInvalid?: (() => void) | undefined;
  /** Called once the factory accepted the command, before the dialog closes. */
  readonly onAccepted?: (() => void) | undefined;
  readonly canConfirm?: boolean | undefined;
  readonly size?: 'sm' | 'md' | 'lg' | undefined;
  readonly children?: ReactNode | undefined;
}

/** A confirmation or a small form whose confirm button sends one command and closes the dialog when it is accepted. */
export function CommandDialog<Name extends CommandName>({ command, body, onInvalid, onAccepted, onClose, ...dialog }: CommandDialogProps<Name>) {
  const runner = useCommand();
  const confirm = async () => {
    if (body === null) {
      onInvalid?.();
      return;
    }
    if (await runner.run(command, body)) {
      onAccepted?.();
      onClose();
    }
  };
  return <ConfirmDialog {...dialog} onClose={onClose} pending={runner.pending === command} onConfirm={() => void confirm()} />;
}
