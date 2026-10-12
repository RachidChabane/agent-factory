import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FACTORY_CLI = join(REPOSITORY_ROOT, 'packages', 'server', 'src', 'cli', 'main.ts');
export const E2E_BUILD_DIRECTORY = join(REPOSITORY_ROOT, 'build', 'e2e');
export const FACTORY_LOG_DIRECTORY = join(E2E_BUILD_DIRECTORY, 'logs');
/** One line per command a spec clicked, appended as the run goes and read once it ends. */
export const COMMANDS_CLICKED_LOG = join(E2E_BUILD_DIRECTORY, 'commands-clicked.log');
