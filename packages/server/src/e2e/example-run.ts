import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildGitEnvironment, localOnlyGitEnvironment, SpawnCommandRunner } from '@agent-factory/adapters';
import { EXIT_CODES, processOutput } from '../cli/output.ts';
import { FACTORY_INSTALL_DIRECTORY } from '../composition/install-paths.ts';
import { projectConventions } from '../composition/project/project-settings.ts';
import { SystemClock, SystemSleeper } from '../composition/system.ts';
import { BareRepository } from './bare-repository.ts';
import { factoryEnvironment } from './cli-environment.ts';
import { CockpitClient } from './cockpit-client.ts';
import { COMMAND_TIMEOUT_MS, STATE_REQUEST_TIMEOUT_MS } from './example-settings.ts';
import { ExampleJourney } from './example-journey.ts';
import { createExampleWorld, type ExampleWorld } from './example-world.ts';
import { FactoryCli, type RunnerFor } from './factory-cli.ts';
import { describeFailure, renderTranscript } from './failure-report.ts';
import { LocalForge } from './local-forge.ts';
import { StepJournal } from './step-journal.ts';

const CLI_ENTRY = join(FACTORY_INSTALL_DIRECTORY, 'packages', 'server', 'src', 'cli', 'main.ts');
const TERMINATION_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

async function removeWorld(world: ExampleWorld | null): Promise<unknown> {
  try {
    await world?.close();
    return null;
  } catch (error) {
    return error;
  }
}

/** Runs the example from a spec to a merged pull request and reports it; resolves with the exit code of the run. */
async function runExample(): Promise<number> {
  const lifetime = new AbortController();
  for (const signal of TERMINATION_SIGNALS) process.once(signal, () => lifetime.abort());
  const clock = new SystemClock();
  const journal = new StepJournal(processOutput, clock);
  const runnerFor: RunnerFor = (signal) => new SpawnCommandRunner({ abortSignal: signal });
  let world: ExampleWorld | null = null;
  let cli: FactoryCli | null = null;
  let failure: { readonly error: unknown } | null = null;
  try {
    const made = await journal.step(
      'factory home prepared',
      () => createExampleWorld({ runner: runnerFor(lifetime.signal), environment: process.env, clock, userHome: homedir(), temporaryDirectory: tmpdir() }),
      (prepared) => `${prepared.home}, cockpit port ${prepared.port}`,
    );
    world = made;
    const factoryCli = new FactoryCli(
      { entry: CLI_ENTRY, workingDirectory: FACTORY_INSTALL_DIRECTORY, environment: factoryEnvironment(process.env, made.home), commandTimeoutMs: COMMAND_TIMEOUT_MS },
      runnerFor,
      lifetime.signal,
    );
    cli = factoryCli;
    await new ExampleJourney({
      journal,
      cli: factoryCli,
      world: made,
      conventions: projectConventions(made.project),
      forge: new LocalForge(made.forge.directory),
      repository: new BareRepository(runnerFor(lifetime.signal), made.forge.bareRepositoryPath, localOnlyGitEnvironment(buildGitEnvironment(process.env))),
      cockpit: new CockpitClient(made.port, STATE_REQUEST_TIMEOUT_MS),
      clock,
      sleeper: new SystemSleeper(),
      lifetime: lifetime.signal,
    }).run();
  } catch (error) {
    failure = { error };
  }
  const removal = await removeWorld(world);
  if (failure !== null) {
    processOutput.error(`\n${describeFailure(failure.error)}`);
    if (cli !== null) processOutput.error(`\nWhat the factory commands printed:\n\n${renderTranscript(cli.transcript())}`);
  }
  if (removal !== null) processOutput.error(`\nThe factory home could not be removed: ${describeFailure(removal)}`);
  processOutput.line(`\n${journal.summary()}`);
  return failure === null && removal === null ? EXIT_CODES.ok : EXIT_CODES.failure;
}

process.exitCode = await runExample();
