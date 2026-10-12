import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { COMMAND_NAMES } from '../../../packages/cockpit/src/contract/index.ts';
import { COMMAND_COVERAGE, commandsNotCovered } from '../../support/command-coverage.ts';

const SPECS_DIRECTORY = join(import.meta.dirname, '..');
const ROWS = Object.entries(COMMAND_COVERAGE);

test.describe('the coverage of the commands', () => {
  test('lists every command of the contract, and only those', () => {
    expect(commandsNotCovered(), 'commands with no spec that clicks them: add a row to support/command-coverage.ts and the click to its spec').toEqual([]);
    expect(Object.keys(COMMAND_COVERAGE).filter((name) => !COMMAND_NAMES.includes(name)), 'rows of commands the contract no longer has').toEqual([]);
  });

  test('names for each command a spec that exists, in the directory of its mode', () => {
    for (const [name, row] of ROWS) {
      expect(row.spec.startsWith(`${row.mode}/`), `${name}: ${row.spec} is not in the ${row.mode} directory`).toBe(true);
      expect(existsSync(join(SPECS_DIRECTORY, row.spec)), `${name}: ${row.spec} does not exist`).toBe(true);
    }
  });

  test('has a click in each of those specs, through clickCommand, for the command it is listed for', () => {
    for (const [name, row] of ROWS) {
      const source = readFileSync(join(SPECS_DIRECTORY, row.spec), 'utf8');
      expect(source, `${row.spec} never calls clickCommand(page, '${name}', ...)`).toMatch(new RegExp(`clickCommand\\(\\s*page,\\s*'${name.replace('.', '\\.')}'`));
    }
  });
});
