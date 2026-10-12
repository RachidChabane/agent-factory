import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { CommandAcceptedSchema, CommandRejectedSchema, commandPath, type CommandName } from '../../packages/cockpit/src/contract/index.ts';
import { COMMANDS_CLICKED_LOG } from './paths.ts';

const POST = 'POST';
const ACCEPTED_STATUS = 200;

export interface CommandOutcome {
  readonly status: number;
  /** What the factory says it did; null when it refused the command. */
  readonly effect: string | null;
  /** Why the factory refused the command; null when it accepted it. */
  readonly error: string | null;
}

export interface ClickOptions {
  /** The status the factory is expected to answer with; 200 unless the spec proves a refusal. */
  readonly status?: number;
}

function record(name: CommandName): void {
  mkdirSync(dirname(COMMANDS_CLICKED_LOG), { recursive: true });
  appendFileSync(COMMANDS_CLICKED_LOG, `${name}\n`);
}

/**
 * Runs the click that sends a command and proves what the cockpit tells the operator: the factory answered
 * the expected status, and the toast shows the factory's own words (the effect, or the error of a refusal).
 */
export async function clickCommand(page: Page, name: CommandName, click: () => Promise<void>, options: ClickOptions = {}): Promise<CommandOutcome> {
  const answered = page.waitForResponse((response) => response.url().endsWith(commandPath(name)) && response.request().method() === POST);
  await click();
  const response = await answered;
  const expectedStatus = options.status ?? ACCEPTED_STATUS;
  expect(response.status(), `the status of ${name}`).toBe(expectedStatus);
  record(name);
  const body: unknown = await response.json();
  if (response.ok()) {
    const { effect } = CommandAcceptedSchema.parse(body);
    await expect(page.getByRole('status').getByText(effect, { exact: true }).first(), `the toast of ${name}`).toBeVisible();
    return { status: response.status(), effect, error: null };
  }
  const { error } = CommandRejectedSchema.parse(body);
  await expect(page.getByRole('alert').getByText(error, { exact: true }).first(), `the error of ${name}`).toBeVisible();
  return { status: response.status(), effect: null, error };
}
