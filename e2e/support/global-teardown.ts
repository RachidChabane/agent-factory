import { existsSync, readFileSync } from 'node:fs';
import { COMMAND_NAMES } from '../../packages/cockpit/src/contract/index.ts';
import { COMMANDS_CLICKED_LOG } from './paths.ts';

/** Set by `script/e2e-cockpit` when it runs every spec, so a command nobody clicked fails the run. */
export const COMPLETE_RUN_VARIABLE = 'E2E_COMPLETE_RUN';

/** After a complete run: every command of the contract was clicked at least once. */
export default function globalTeardown(): void {
  if (process.env[COMPLETE_RUN_VARIABLE] !== '1') return;
  const clicked = new Set(existsSync(COMMANDS_CLICKED_LOG) ? readFileSync(COMMANDS_CLICKED_LOG, 'utf8').split('\n').filter((line) => line.length > 0) : []);
  const missing = COMMAND_NAMES.filter((name) => !clicked.has(name));
  if (missing.length > 0) throw new Error(`the run clicked no button for: ${missing.join(', ')}`);
}
