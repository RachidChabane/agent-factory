import { mkdirSync, rmSync } from 'node:fs';
import { COMMANDS_CLICKED_LOG, E2E_BUILD_DIRECTORY } from './paths.ts';

/** Starts the record of the commands the run clicks from nothing. */
export default function globalSetup(): void {
  mkdirSync(E2E_BUILD_DIRECTORY, { recursive: true });
  rmSync(COMMANDS_CLICKED_LOG, { force: true });
}
