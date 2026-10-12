import { stopFactoryNow, startFactory } from './cli-commands.ts';
import type { CliRun, FactoryCli, LaunchedCommand } from './factory-cli.ts';

/** Settles with the result of `promise`, or with null when it has not settled after `timeoutMs`. */
function withinDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * A running factory started through the command line. It stays up for the work that needs a live
 * process, and is stopped through the command line's own `stop`, then ended for good if it lingers.
 */
export class FactoryProcess {
  private readonly cli: FactoryCli;
  private readonly launched: LaunchedCommand;
  private ended: CliRun | null = null;
  private stopping: Promise<CliRun> | null = null;

  private constructor(cli: FactoryCli, launched: LaunchedCommand) {
    this.cli = cli;
    this.launched = launched;
    void launched.finished.then((run) => {
      this.ended = run;
    });
  }

  static start(cli: FactoryCli, lifetimeLimitMs: number): FactoryProcess {
    return new FactoryProcess(cli, cli.launch(startFactory(), lifetimeLimitMs));
  }

  /** The run of the process once it has ended, or null while it still runs. */
  endedRun(): CliRun | null {
    return this.ended;
  }

  /** Stops the factory and resolves with its run once it has ended; stopping twice stops once. */
  stop(timeoutMs: number): Promise<CliRun> {
    this.stopping ??= this.stopOnce(timeoutMs);
    return this.stopping;
  }

  private async stopOnce(timeoutMs: number): Promise<CliRun> {
    if (this.ended === null) {
      await this.cli.run(stopFactoryNow()).catch(() => undefined);
      if ((await withinDeadline(this.launched.finished, timeoutMs)) === null) this.launched.kill();
    }
    return this.launched.finished;
  }
}
