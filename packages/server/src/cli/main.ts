import { defaultCliContext } from './cli-context.ts';
import { runCli } from './factory-cli.ts';
import { processOutput } from './output.ts';

process.exitCode = await runCli(process.argv.slice(2), defaultCliContext(process.env, processOutput));
