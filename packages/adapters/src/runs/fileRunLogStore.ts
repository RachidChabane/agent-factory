import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { GATE_STEP_OUTCOMES, RATE_LIMIT_WINDOWS } from '@agent-factory/domain';
import type { RunLogEvent, RunLogLine, RunLogPage, RunLogStore } from '@agent-factory/application';

export const RUN_LOG_EXTENSION = '.jsonl';
const RUN_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const NEWLINE = '\n';
const UTF8 = 'utf8';
const MISSING_FILE_CODE = 'ENOENT';

const UsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheCreationTokens: z.number(),
});

export const RunLogEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('session-started'), sessionId: z.string(), model: z.string() }),
  z.object({ kind: z.literal('assistant-text'), text: z.string(), parentToolUseId: z.string().nullable() }),
  z.object({ kind: z.literal('tool-call'), toolUseId: z.string(), toolName: z.string(), input: z.unknown(), parentToolUseId: z.string().nullable() }),
  z.object({ kind: z.literal('tool-result'), toolUseId: z.string(), isError: z.boolean(), content: z.string() }),
  z.object({ kind: z.literal('permission-denied'), toolName: z.string(), message: z.string() }),
  z.object({ kind: z.literal('hook'), hookEvent: z.string(), exitCode: z.number().nullable(), output: z.string() }),
  z.object({
    kind: z.literal('rate-limit'),
    snapshots: z.array(z.object({ window: z.enum(RATE_LIMIT_WINDOWS), utilization: z.number(), resetsAt: z.coerce.date() })),
  }),
  z.object({
    kind: z.literal('gate'),
    passed: z.boolean(),
    steps: z.array(z.object({ name: z.string(), outcome: z.enum(GATE_STEP_OUTCOMES), detail: z.string() })),
  }),
  z.object({ kind: z.literal('usage'), usage: UsageSchema, costUsd: z.number(), turns: z.number() }),
  z.object({ kind: z.literal('progress'), usage: UsageSchema, turns: z.number() }),
  z.object({ kind: z.literal('raw'), line: z.string() }),
]);

const StoredLineSchema = z.object({ runId: z.string(), index: z.number().int().nonnegative(), at: z.coerce.date(), event: RunLogEventSchema });

export class UnsafeRunIdError extends Error {
  constructor(runId: string) {
    super(`run identifier ${JSON.stringify(runId)} is not a safe file name`);
    this.name = 'UnsafeRunIdError';
  }
}

export interface RunLogClock {
  now(): Date;
}

function parseLine(text: string): RunLogLine | null {
  try {
    const parsed = StoredLineSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export class FileRunLogStore implements RunLogStore {
  private readonly directory: string;
  private readonly clock: RunLogClock;
  private readonly counts = new Map<string, number>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly listeners = new Set<(line: RunLogLine) => void>();
  private directoryReady: Promise<unknown> | null = null;

  constructor(directory: string, clock: RunLogClock) {
    this.directory = directory;
    this.clock = clock;
  }

  append(runId: string, event: RunLogEvent): Promise<RunLogLine> {
    const path = this.pathOf(runId);
    const previous = this.queues.get(runId) ?? Promise.resolve();
    const next = previous.then(async () => {
      this.directoryReady ??= mkdir(this.directory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
      await this.directoryReady;
      const index = this.counts.get(runId) ?? (await this.countLines(path));
      const line: RunLogLine = { runId, index, at: this.clock.now(), event };
      await appendFile(path, `${JSON.stringify(line)}${NEWLINE}`, { encoding: UTF8, mode: PRIVATE_FILE_MODE });
      this.counts.set(runId, index + 1);
      this.notify(line);
      return line;
    });
    this.queues.set(runId, next.catch(() => undefined));
    return next;
  }

  async read(runId: string, afterIndex: number | null): Promise<RunLogPage> {
    const lines = await this.readLines(this.pathOf(runId));
    return { runId, total: lines.length, lines: lines.filter((line) => afterIndex === null || line.index > afterIndex) };
  }

  subscribe(listener: (line: RunLogLine) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private pathOf(runId: string): string {
    if (!RUN_IDENTIFIER.test(runId)) throw new UnsafeRunIdError(runId);
    return join(this.directory, `${runId}${RUN_LOG_EXTENSION}`);
  }

  private async countLines(path: string): Promise<number> {
    return (await this.readLines(path)).length;
  }

  private async readLines(path: string): Promise<readonly RunLogLine[]> {
    let text: string;
    try {
      text = await readFile(path, UTF8);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === MISSING_FILE_CODE) return [];
      throw error;
    }
    return text
      .split(NEWLINE)
      .filter((line) => line !== '')
      .flatMap((line) => parseLine(line) ?? []);
  }

  private notify(line: RunLogLine): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(line);
      } catch {
        continue;
      }
    }
  }
}

