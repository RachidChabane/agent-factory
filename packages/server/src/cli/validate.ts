import { defaultCliContext } from './cli-context.ts';
import { COMMAND_NAMES } from './command-line.ts';
import { runCli } from './factory-cli.ts';
import { processOutput } from './output.ts';

process.exitCode = await runCli([COMMAND_NAMES.validate, ...process.argv.slice(2)], defaultCliContext(process.env, processOutput));
