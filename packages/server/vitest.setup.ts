import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import { afterAll } from 'vitest';

const HOME_VARIABLE = 'AGENT_FACTORY_HOME';
const PARENT = '..';

function isInside(directory: string, candidate: string): boolean {
  const offset = relative(directory, candidate);
  return offset !== '' && offset !== PARENT && !offset.startsWith(`${PARENT}${sep}`) && !isAbsolute(offset);
}

/**
 * Every test file works in a factory home of its own under the temporary directory, so no test can
 * read or write the operator's installation, even through a default it forgot to override. A home
 * made here is removed once the file's tests have run.
 */
const temporary = realpathSync(tmpdir());
const configured = process.env[HOME_VARIABLE];
if (configured === undefined || configured === '') {
  const home = mkdtempSync(join(temporary, 'agent-factory-test-home-'));
  process.env[HOME_VARIABLE] = home;
  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
    Reflect.deleteProperty(process.env, HOME_VARIABLE);
  });
} else if (!isInside(temporary, realpathSync(configured))) {
  throw new Error(`${HOME_VARIABLE}=${configured} is not under ${temporary}; the server tests only run against a temporary factory home`);
}
