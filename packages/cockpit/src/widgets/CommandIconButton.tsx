import type { ReactNode } from 'react';
import { useCommand } from '../app/hooks.ts';
import type { CommandBody, CommandName } from '../contract/index.ts';
import { IconButton } from '../ui/components/IconButton.tsx';

interface CommandIconButtonProps<Name extends CommandName> {
  readonly command: Name;
  readonly body: CommandBody<Name>;
  /** What the button does, for assistive technology and the tooltip. */
  readonly label: string;
  readonly icon: ReactNode;
  readonly size?: 'sm' | 'md' | undefined;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
}

/** An icon-only button that sends one command, disabled while it is in flight. */
export function CommandIconButton<Name extends CommandName>({ command, body, label, icon, size, disabled, className }: CommandIconButtonProps<Name>) {
  const runner = useCommand();
  return (
    <IconButton
      label={label}
      icon={icon}
      {...(size === undefined ? {} : { size })}
      {...(className === undefined ? {} : { className })}
      disabled={disabled === true || runner.pending === command}
      aria-busy={runner.pending === command || undefined}
      onClick={() => void runner.run(command, body)}
    />
  );
}
