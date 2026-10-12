import { useState } from 'react';
import { useCommand } from '../app/hooks.ts';
import type { CommandBody, CommandName } from '../contract/index.ts';
import type { ButtonProps } from '../ui/components/Button.tsx';
import { Button } from '../ui/components/Button.tsx';
import type { ConfirmCopy } from './ConfirmDialog.tsx';
import { CommandDialog } from './CommandDialog.tsx';

interface CommandButtonProps<Name extends CommandName> extends Omit<ButtonProps, 'onClick' | 'loading' | 'type'> {
  readonly command: Name;
  readonly body: CommandBody<Name>;
  /** When given, the button first asks for confirmation in a dialog. */
  readonly confirm?: ConfirmCopy | undefined;
  readonly onAccepted?: (() => void) | undefined;
}

/**
 * A button that sends the command its label announces. It is disabled while the command is in
 * flight, and the factory's own description of what it did (or its refusal) is shown in a toast.
 */
export function CommandButton<Name extends CommandName>({ command, body, confirm, onAccepted, disabled, children, ...rest }: CommandButtonProps<Name>) {
  const runner = useCommand();
  const [confirming, setConfirming] = useState(false);
  const pending = runner.pending === command;
  const send = async () => {
    if (await runner.run(command, body)) onAccepted?.();
  };
  return (
    <>
      <Button {...rest} disabled={disabled} loading={pending && confirm === undefined} onClick={confirm === undefined ? () => void send() : () => setConfirming(true)}>
        {children}
      </Button>
      {confirm === undefined ? null : (
        <CommandDialog {...confirm} open={confirming} onClose={() => setConfirming(false)} command={command} body={body} {...(onAccepted === undefined ? {} : { onAccepted })} />
      )}
    </>
  );
}
