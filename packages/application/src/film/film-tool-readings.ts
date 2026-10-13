import type { ToolProbeResult, ToolStatus } from '@agent-factory/domain';
import type { Clock } from '../ports.ts';
import { FILM_TOOL_RECHECK_INTERVAL_MS, type FilmTool, type FilmToolChecks } from './film-tools.ts';

/** A tool the films of a project need, with what checks it. */
export interface WantedTool {
  readonly key: string;
  readonly tool: FilmTool;
  readonly checks: FilmToolChecks;
}

export interface ToolReading {
  readonly tool: FilmTool;
  readonly result: ToolProbeResult;
  readonly readAt: number;
}

/** When a tool is read: what is missing or older than the recheck interval, or everything not read in this round. */
export type ReadRule = 'due' | 'now';

/** A reading known only from the record of a wait is due at once. */
const SEEDED_AT = Number.NEGATIVE_INFINITY;

/**
 * The latest reading of each tool the films wait for. A tool is read at most once per recheck interval while nothing
 * asks for more, and again when a film is about to start; the tools asked for are read at once.
 */
export class FilmToolReadings {
  private readonly clock: Clock;
  private readonly readings = new Map<string, ToolReading>();
  private readonly readInThisRound = new Set<string>();

  constructor(clock: Clock) {
    this.clock = clock;
  }

  /** Starts a round of decisions: a tool read in it needs no second reading before a film starts. */
  beginRound(): void {
    this.readInThisRound.clear();
  }

  statuses(): ReadonlyMap<string, ToolStatus> {
    return new Map([...this.readings].map(([key, reading]) => [key, reading.result.status]));
  }

  reading(key: string): ToolReading | undefined {
    return this.readings.get(key);
  }

  wasReadInThisRound(key: string): boolean {
    return this.readInThisRound.has(key);
  }

  /** Remembers what the record of a wait says of a tool nobody has read since the factory started; it is read again at once. */
  seed(key: string, tool: FilmTool, result: ToolProbeResult): void {
    if (!this.readings.has(key)) this.readings.set(key, { tool, result, readAt: SEEDED_AT });
  }

  /** Reads the wanted tools that the rule asks for, all at once: a slow tool delays the others by no more than its own bound. */
  async read(wanted: readonly WantedTool[], rule: ReadRule): Promise<void> {
    const distinct = [...new Map(wanted.map((entry) => [entry.key, entry])).values()];
    const now = this.clock.now().getTime();
    const toRead = distinct.filter((entry) => this.isToRead(entry.key, rule, now));
    await Promise.all(
      toRead.map(async ({ key, tool, checks }) => {
        const result = await checks.check(tool);
        this.readings.set(key, { tool, result, readAt: this.clock.now().getTime() });
        this.readInThisRound.add(key);
      }),
    );
  }

  private isToRead(key: string, rule: ReadRule, now: number): boolean {
    if (rule === 'now') return !this.readInThisRound.has(key);
    const reading = this.readings.get(key);
    return reading === undefined || now - reading.readAt >= FILM_TOOL_RECHECK_INTERVAL_MS;
  }
}
