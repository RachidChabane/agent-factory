import { readFile, writeFile } from 'node:fs/promises';
import { argv, exit, stderr, stdout } from 'node:process';
import { configJsonSchemaText } from '../config/config-json-schema.ts';

const CHECK_FLAG = '--check';
const UTF8 = 'utf8';
const EXIT_STALE = 1;
const EXIT_USAGE = 2;

async function main(): Promise<number> {
  const [, , path, flag] = argv;
  if (path === undefined) {
    stderr.write('Usage: config-schema-file.ts <schema.json> [--check]\n');
    return EXIT_USAGE;
  }
  const expected = configJsonSchemaText();
  if (flag === CHECK_FLAG) {
    const current = await readFile(path, UTF8).catch(() => '');
    if (current === expected) return 0;
    stderr.write(`${path} is out of date with the configuration schema; run script/schema to regenerate it\n`);
    return EXIT_STALE;
  }
  await writeFile(path, expected);
  stdout.write(`wrote ${path}\n`);
  return 0;
}

exit(await main());
