#!/usr/bin/env node
import { runCli, type CliEnvironment } from './cli/run-cli.ts';
import { readText } from './cli/standard-input.ts';
import { systemClock } from './clock.ts';

const ARGUMENTS_BEFORE_FLAGS = 2;

const environment: CliEnvironment = {
  argv: process.argv.slice(ARGUMENTS_BEFORE_FLAGS),
  environment: process.env,
  workingDirectory: process.cwd(),
  readStandardInput: () => readText(process.stdin),
  stdout: process.stdout,
  stderr: process.stderr,
  clock: systemClock,
};

process.exitCode = await runCli(environment);
