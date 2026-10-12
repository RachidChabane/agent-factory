import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FACTORY_INSTALL_DIRECTORY = fileURLToPath(new URL('../../../../', import.meta.url));
export const ROLE_PROMPTS_DIRECTORY = join(FACTORY_INSTALL_DIRECTORY, 'packages', 'plugin', 'roles');
export const EVENT_DATABASE_FILE = 'factory.db';
