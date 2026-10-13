#!/usr/bin/env node
import { parseUploadArguments, uploadToDirectory } from './demo-upload.ts';

const ARGUMENTS_BEFORE_FLAGS = 2;
const EXIT_FAILURE = 1;

// The upload command of the demonstration: it stands for the operator's own tool, which puts a file in the storage they
// use and prints a link to it, and needs no account and no network. The last line it prints is the link.
try {
  process.stdout.write(`${await uploadToDirectory(parseUploadArguments(process.argv.slice(ARGUMENTS_BEFORE_FLAGS)))}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = EXIT_FAILURE;
}
