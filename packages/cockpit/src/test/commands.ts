import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { expect } from 'vitest';
import type { FakeTransport, SentCommand } from './fake-transport.ts';

/** Waits until the factory has received exactly these commands, in this order, with exactly these bodies. */
export async function expectCommands(transport: FakeTransport, expected: readonly SentCommand[]): Promise<void> {
  await waitFor(() => expect(transport.commands).toEqual(expected));
}

/** Waits until the factory has received exactly one command, with this name and this body. */
export async function expectCommand(transport: FakeTransport, name: string, body: unknown): Promise<void> {
  await expectCommands(transport, [{ name, body }]);
}

/** Clicks a button and checks the one command it sends. */
export async function clickAndExpectCommand(user: UserEvent, button: HTMLElement, transport: FakeTransport, name: string, body: unknown): Promise<void> {
  await user.click(button);
  await expectCommand(transport, name, body);
}

/** Clicks a button, confirms in the dialog it opens, and checks the one command that results. */
export async function clickConfirmAndExpectCommand(
  user: UserEvent,
  button: HTMLElement,
  dialogName: string | RegExp,
  confirmName: string | RegExp,
  transport: FakeTransport,
  name: string,
  body: unknown,
): Promise<void> {
  await user.click(button);
  const dialog = await screen.findByRole('dialog', { name: dialogName });
  expect(transport.commands).toEqual([]);
  await user.click(within(dialog).getByRole('button', { name: confirmName }));
  await expectCommand(transport, name, body);
}
