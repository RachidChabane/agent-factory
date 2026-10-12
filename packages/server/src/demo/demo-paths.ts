import { join } from 'node:path';
import { FACTORY_INSTALL_DIRECTORY } from '../composition/install-paths.ts';

/** The fictional repositories the demonstration and the end-to-end example work on. */
export const EXAMPLES_DIRECTORY = join(FACTORY_INSTALL_DIRECTORY, 'examples');
/** The stand-in for the Claude Code CLI that plays scripted agents, with no model, login or network. */
export const FAKE_CLAUDE_MAIN = join(FACTORY_INSTALL_DIRECTORY, 'packages', 'fake-claude', 'src', 'main.ts');
