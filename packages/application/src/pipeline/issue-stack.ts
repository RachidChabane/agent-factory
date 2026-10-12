import { z } from 'zod';
import type { EventStore, LogArchive, RunningProcess, ServiceProcesses } from '../ports.ts';
import type { IssueJournalWriter } from './journal-writer.ts';
import { EscalationRequiredError } from './pipeline-errors.ts';
import type { StackService, StackSettings } from './pipeline-settings.ts';
import { accessOf, describeOutcome, EXIT_CODE_SUCCESS, tailLines, type ShellCommands } from './shell-commands.ts';

/** The variable every command inside a stack gets: the slot of the issue, from 0, so that stacks run side by side. */
export const STACK_SLOT_VARIABLE = 'AGENT_FACTORY_SLOT';
export const STACK_EVENTS = {
  started: 'stack.started',
  stopped: 'stack.stopped',
} as const;
const STACK_LOG_PREFIX = 'stack-';
const LOG_EXTENSION = '.log';
const READY_POLL_SECONDS = 1;
const ISSUE_SUBJECT_PREFIX = 'issue/';
const NO_SEQUENCE = 0;
const LOG_SEPARATOR = '\n\n';

export const StackStartedPayloadSchema = z.object({
  workspace: z.string().min(1),
  slot: z.number().int().nonnegative(),
  services: z.array(z.object({ name: z.string().min(1), pid: z.number().int().positive(), startedAt: z.string().nullable() })),
});
export type StackStartedPayload = z.infer<typeof StackStartedPayloadSchema>;

export const StackStoppedPayloadSchema = z.object({
  workspace: z.string().min(1),
  /** Whether a later factory stopped it, after the one that started it ended without doing so. */
  reclaimed: z.boolean(),
  problems: z.array(z.string()),
});
export type StackStoppedPayload = z.infer<typeof StackStoppedPayloadSchema>;

/** The stack did not come up: outside a gate the issue goes to a person, inside one the gate fails with the reason. */
export class StackStartError extends EscalationRequiredError {
  constructor(reason: string) {
    super(`the stack did not start: ${reason}`);
    this.name = 'StackStartError';
  }
}

/** The slots of the stacks of one project: the lowest free one for each issue that runs one. */
export class StackSlots {
  private readonly taken = new Set<number>();

  acquire(): number {
    let slot = 0;
    while (this.taken.has(slot)) slot += 1;
    this.taken.add(slot);
    return slot;
  }

  release(slot: number): void {
    this.taken.delete(slot);
  }
}

/** What the work inside a stack runs its commands with: the stack's variables and the host's loopback. */
export interface StackScope {
  readonly shell: ShellCommands;
  readonly environment: Readonly<Record<string, string>>;
}

export interface IssueStackDependencies {
  readonly services: ServiceProcesses;
  readonly logs: LogArchive;
  readonly slots: StackSlots;
}

interface StartedService {
  readonly service: StackService;
  readonly process: RunningProcess;
}

function shellLine(service: StackService): string {
  return `until ${service.ready.run}; do sleep ${READY_POLL_SECONDS}; done`;
}

/**
 * Runs the stack of a project around the work that needs it: the setup commands, then the services, each until it
 * answers, then the work; then the services stop and the teardown commands run, whatever the work did. The factory
 * owns every process it starts, records each start and stop, and keeps what each service printed in the issue's logs.
 */
export class IssueStacks {
  private readonly dependencies: IssueStackDependencies;
  private readonly settings: StackSettings | null;
  private readonly shell: ShellCommands;

  constructor(dependencies: IssueStackDependencies, settings: StackSettings | null, shell: ShellCommands) {
    this.dependencies = dependencies;
    this.settings = settings;
    this.shell = shell;
  }

  /** Whether the checks of an issue type run inside the stack. */
  needed(issueType: string): boolean {
    if (this.settings === null) return false;
    return this.settings.issueTypes.length === 0 || this.settings.issueTypes.includes(issueType);
  }

  async around<T>(writer: IssueJournalWriter, issueNumber: number, issueType: string, workspace: string, work: (scope: StackScope | null) => Promise<T>): Promise<T> {
    const settings = this.settings;
    if (settings === null || !this.needed(issueType)) return work(null);
    const slot = this.dependencies.slots.acquire();
    const environment = { ...settings.environment, [STACK_SLOT_VARIABLE]: String(slot) };
    const shell = this.shell.insideStack(environment);
    const started: StartedService[] = [];
    let recorded = false;
    try {
      await this.setUp(settings, shell, workspace);
      for (const service of settings.services) {
        const command = shell.confined(service.run, workspace, accessOf(service));
        started.push({ service, process: await this.dependencies.services.start(service.name, command, workspace, shell.variables) });
      }
      const payload: StackStartedPayload = {
        workspace,
        slot,
        services: started.map(({ service, process }) => ({ name: service.name, pid: process.pid, startedAt: process.startedAt })),
      };
      await writer.record(STACK_EVENTS.started, payload);
      recorded = true;
      for (const entry of started) await this.awaitReady(shell, workspace, entry);
      return await work({ shell, environment });
    } finally {
      const problems = await this.tearDown(settings, shell, workspace, started, issueNumber);
      if (recorded) await writer.record(STACK_EVENTS.stopped, { workspace, reclaimed: false, problems: [...problems] } satisfies StackStoppedPayload);
      this.dependencies.slots.release(slot);
    }
  }

  /** Stops the stacks an earlier factory started and never stopped: their services, when still running, then their teardown. */
  async reclaim(events: EventStore, writerFor: (issueNumber: number) => IssueJournalWriter): Promise<number> {
    const settings = this.settings;
    const records = await events.read(ISSUE_SUBJECT_PREFIX, NO_SEQUENCE);
    const open = new Map<string, { readonly issueNumber: number; readonly payload: StackStartedPayload }>();
    for (const record of records) {
      if (record.type === STACK_EVENTS.started) {
        const parsed = StackStartedPayloadSchema.safeParse(record.payload);
        const issueNumber = Number(record.subject.slice(ISSUE_SUBJECT_PREFIX.length));
        if (parsed.success && Number.isInteger(issueNumber)) open.set(record.subject, { issueNumber, payload: parsed.data });
      } else if (record.type === STACK_EVENTS.stopped) {
        open.delete(record.subject);
      }
    }
    for (const { issueNumber, payload } of open.values()) {
      const graceMs = settings?.stopGraceMs ?? 0;
      for (const service of payload.services) {
        if (service.startedAt !== null) await this.dependencies.services.reclaim(service.pid, service.startedAt, graceMs);
      }
      const shell = this.shell.insideStack({ ...(settings?.environment ?? {}), [STACK_SLOT_VARIABLE]: String(payload.slot) });
      const problems = settings === null ? [] : await this.runTeardown(settings, shell, payload.workspace);
      await writerFor(issueNumber).record(STACK_EVENTS.stopped, { workspace: payload.workspace, reclaimed: true, problems: [...problems] } satisfies StackStoppedPayload);
    }
    return open.size;
  }

  private async setUp(settings: StackSettings, shell: ShellCommands, workspace: string): Promise<void> {
    for (const command of settings.setup) {
      const outcome = await shell.execute(command.run, workspace, accessOf(command));
      if (outcome.kind !== 'completed' || outcome.exitCode !== EXIT_CODE_SUCCESS) {
        throw new StackStartError(`${command.name} failed:\n${tailLines(describeOutcome(command.run, outcome))}`);
      }
    }
  }

  private async awaitReady(shell: ShellCommands, workspace: string, { service, process }: StartedService): Promise<void> {
    const run = await shell.run(shellLine(service), workspace, accessOf(service), service.ready.timeoutMs);
    if (run.started && run.exitCode === EXIT_CODE_SUCCESS && !run.timedOut) return;
    const reason = !run.started ? run.reason : run.timedOut ? `${service.ready.run} did not succeed within ${run.timeoutMs} ms` : `${service.ready.run} exited with code ${run.exitCode}`;
    const exited = (await process.running()) ? '' : `; ${service.name} is no longer running`;
    throw new StackStartError(`${service.name} never answered: ${reason}${exited}\n${tailLines(await process.output())}`);
  }

  private async tearDown(settings: StackSettings, shell: ShellCommands, workspace: string, started: readonly StartedService[], issueNumber: number): Promise<readonly string[]> {
    const problems: string[] = [];
    for (const { service, process } of [...started].reverse()) {
      await process.stop(settings.stopGraceMs);
      const output = await process.output();
      if (output !== '') await this.dependencies.logs.write(issueNumber, `${STACK_LOG_PREFIX}${service.name}${LOG_EXTENSION}`, output);
    }
    problems.push(...(await this.runTeardown(settings, shell, workspace)));
    return problems;
  }

  private async runTeardown(settings: StackSettings, shell: ShellCommands, workspace: string): Promise<readonly string[]> {
    const problems: string[] = [];
    for (const command of settings.teardown) {
      const outcome = await shell.execute(command.run, workspace, accessOf(command));
      if (outcome.kind !== 'completed' || outcome.exitCode !== EXIT_CODE_SUCCESS) problems.push(`${command.name} failed:${LOG_SEPARATOR}${tailLines(describeOutcome(command.run, outcome))}`);
    }
    return problems;
  }
}
