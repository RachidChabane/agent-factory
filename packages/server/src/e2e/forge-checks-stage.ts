import { EXIT_CODES } from '../cli/output.ts';
import { expectSameItems, expectThat } from './expectations.ts';
import { FACTORY_LIFETIME_LIMIT_MS, FACTORY_READY_TIMEOUT_MS, FACTORY_STOP_TIMEOUT_MS, GATE_CHECKS_TIMEOUT_MS, POLL_INTERVAL_MS } from './example-settings.ts';
import { describeRun } from './factory-cli.ts';
import { FactoryProcess } from './factory-process.ts';
import { formatSeconds, joinItems, shortSha } from './format.ts';
import { gateChecksLook } from './gate-checks-look.ts';
import type { JourneyCollaborators, ReviewedPullRequest } from './journey-collaborators.ts';
import type { GateOutcome } from './local-forge.ts';
import { failed, ready, waiting, waitUntil, type WaitSettings } from './wait-until.ts';

const COCKPIT_ANSWERED = 200;

/**
 * A local forge has no continuous integration of its own: the factory it belongs to runs the gate
 * of a commit when the cockpit asks for its checks. This stage starts that factory through the
 * command line, waits for the forge to record the gate of the pull request's head, and stops it.
 */
export class ForgeChecksStage {
  private readonly collaborators: JourneyCollaborators;

  constructor(collaborators: JourneyCollaborators) {
    this.collaborators = collaborators;
  }

  async run(pullRequest: ReviewedPullRequest): Promise<GateOutcome> {
    const { journal, cli, world } = this.collaborators;
    const factory = FactoryProcess.start(cli, FACTORY_LIFETIME_LIMIT_MS);
    try {
      await journal.step('factory started', () => this.waitForCockpit(factory), () => `its cockpit answers on port ${world.port}`);
      const outcome = await journal.step('forge checks passed', () => this.waitForChecks(factory, pullRequest), (recorded) => this.describeChecks(pullRequest, recorded));
      await journal.step('factory stopped', () => this.stop(factory), () => `nothing listens on port ${world.port}`);
      return outcome;
    } finally {
      await factory.stop(FACTORY_STOP_TIMEOUT_MS);
    }
  }

  private waitForCockpit(factory: FactoryProcess): Promise<void> {
    const { cockpit } = this.collaborators;
    return waitUntil(this.waitSettings('the factory to answer', FACTORY_READY_TIMEOUT_MS), async () => {
      const ended = factory.endedRun();
      if (ended !== null) return failed(`the factory ended before it answered: ${describeRun(ended)}`);
      const answer = await cockpit.requestState();
      return answer.status === COCKPIT_ANSWERED ? ready(undefined) : waiting(answer.detail);
    });
  }

  private waitForChecks(factory: FactoryProcess, pullRequest: ReviewedPullRequest): Promise<GateOutcome> {
    const { cockpit, forge, world } = this.collaborators;
    const look = gateChecksLook(pullRequest.headSha, {
      requestState: () => cockpit.requestState(),
      outcome: (sha) => forge.gateOutcome(sha),
      log: (sha) => forge.gateLog(sha),
      factoryEnded: () => factory.endedRun(),
    });
    return waitUntil(this.waitSettings(`the forge to record the checks of ${shortSha(pullRequest.headSha)}`, GATE_CHECKS_TIMEOUT_MS), async () => {
      const poll = await look();
      if (poll.kind !== 'ready') return poll;
      const commands = [...world.project.gate.commandsBeforeAcceptance, ...world.project.gate.commandsAfterAcceptance];
      expectSameItems(
        'the forge records one check per command of the project gate',
        commands.map((command) => command.name),
        poll.value.steps.map((step) => step.name),
      );
      return poll;
    });
  }

  private async stop(factory: FactoryProcess): Promise<void> {
    const { cockpit, world } = this.collaborators;
    const run = await factory.stop(FACTORY_STOP_TIMEOUT_MS);
    expectThat(!run.killed && run.exitCode === EXIT_CODES.ok, 'the factory ends when asked to stop now', `exit code ${EXIT_CODES.ok} within ${formatSeconds(FACTORY_STOP_TIMEOUT_MS)}`, describeRun(run));
    const answer = await cockpit.requestState();
    expectThat(answer.status === null, `nothing answers on port ${world.port} once the factory has stopped`, 'no answer', answer.detail);
  }

  private describeChecks(pullRequest: ReviewedPullRequest, outcome: GateOutcome): string {
    return `${joinItems(outcome.steps.map((step) => step.name))} on ${shortSha(pullRequest.headSha)}`;
  }

  private waitSettings(what: string, timeoutMs: number): WaitSettings {
    const { clock, sleeper, lifetime } = this.collaborators;
    return { what, timeoutMs, intervalMs: POLL_INTERVAL_MS, clock, sleeper, signal: lifetime };
  }
}
