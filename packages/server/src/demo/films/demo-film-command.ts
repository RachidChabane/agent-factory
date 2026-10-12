#!/usr/bin/env node
import { setTimeout as sleep } from 'node:timers/promises';
import { recordDemoFilm, secondsPerRunOf } from './demo-film.ts';
import { parseFilmArguments } from './demo-film-request.ts';

const ARGUMENTS_BEFORE_FLAGS = 2;
const EXIT_FAILURE = 1;

// The film command of the demonstration: it stands for a product's own tool, which records a scenario into an output
// directory, and needs no browser, no account and no network.
try {
  await recordDemoFilm(parseFilmArguments(process.argv.slice(ARGUMENTS_BEFORE_FLAGS)), {
    samplesDirectory: import.meta.dirname,
    secondsPerRun: secondsPerRunOf(process.env),
    sleep,
  });
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = EXIT_FAILURE;
}
