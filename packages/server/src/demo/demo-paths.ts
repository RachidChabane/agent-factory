import { join } from 'node:path';
import { FACTORY_INSTALL_DIRECTORY } from '../composition/install-paths.ts';

/** The fictional repositories the demonstration and the end-to-end example work on. */
export const EXAMPLES_DIRECTORY = join(FACTORY_INSTALL_DIRECTORY, 'examples');
/** The stand-in for the Claude Code CLI that plays scripted agents, with no model, login or network. */
export const FAKE_CLAUDE_MAIN = join(FACTORY_INSTALL_DIRECTORY, 'packages', 'fake-claude', 'src', 'main.ts');
/** The fake film command of the demonstration and the two sample videos it films with. */
export const DEMO_FILMS_DIRECTORY = join(FACTORY_INSTALL_DIRECTORY, 'packages', 'server', 'src', 'demo', 'films');
export const DEMO_FILM_COMMAND_MAIN = join(DEMO_FILMS_DIRECTORY, 'demo-film-command.ts');
/** The stand-in for the operator's upload command, which the demonstration declares for the media of its notices. */
export const DEMO_UPLOADS_COMMAND_DIRECTORY = join(FACTORY_INSTALL_DIRECTORY, 'packages', 'server', 'src', 'demo', 'uploads');
export const DEMO_UPLOAD_COMMAND_MAIN = join(DEMO_UPLOADS_COMMAND_DIRECTORY, 'demo-upload-command.ts');
/** Where the demonstration's upload command puts the files, under the demonstration's home. */
export const DEMO_UPLOADS_DIRECTORY_NAME = 'uploads';
