import type { PullRequestDiff } from '../contract/index.ts';
import { PullRequestDiffSchema } from '../contract/index.ts';
import { describeZodError } from './parse.ts';
import type { CockpitTransport } from './transport.ts';

/** The pull request a diff is wanted for, and the head commit the cockpit currently knows it at. */
export interface DiffTarget {
  readonly project: string;
  readonly pullRequestNumber: number;
  readonly headSha: string;
}

export type PullRequestDiffState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly previous: PullRequestDiff | null }
  | { readonly status: 'ready'; readonly diff: PullRequestDiff }
  /** The last read failed; the diff of the read before it, with its own time, is kept when there was one. */
  | { readonly status: 'failed'; readonly error: string; readonly previous: PullRequestDiff | null };

const IDLE: PullRequestDiffState = { status: 'idle' };

type Listener = () => void;

function keyOf(target: DiffTarget): string {
  return `${target.project}/${target.pullRequestNumber}@${target.headSha}`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function diffKept(state: PullRequestDiffState): PullRequestDiff | null {
  if (state.status === 'ready') return state.diff;
  return state.status === 'idle' ? null : state.previous;
}

/**
 * The diffs of pull requests, read from the factory when a view asks for them and not before, once
 * per head commit. A failed read leaves the diff read before it in place.
 */
export class PullRequestDiffs {
  private readonly transport: Pick<CockpitTransport, 'loadPullRequestDiff'>;
  private readonly states = new Map<string, PullRequestDiffState>();
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(transport: Pick<CockpitTransport, 'loadPullRequestDiff'>) {
    this.transport = transport;
  }

  readonly getState = (target: DiffTarget): PullRequestDiffState => this.states.get(keyOf(target)) ?? IDLE;

  subscribe(target: DiffTarget, listener: Listener): () => void {
    const key = keyOf(target);
    const listeners = this.listeners.get(key) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    return () => {
      listeners.delete(listener);
    };
  }

  /** Reads the diff unless it was already asked for. */
  ensure(target: DiffTarget): void {
    if (this.getState(target).status === 'idle') void this.load(target);
  }

  /** Reads the diff again, whatever it held, unless a read is already under way. */
  reload(target: DiffTarget): void {
    if (this.getState(target).status !== 'loading') void this.load(target);
  }

  private async load(target: DiffTarget): Promise<void> {
    const key = keyOf(target);
    const previous = diffKept(this.getState(target));
    this.publish(key, { status: 'loading', previous });
    try {
      const parsed = PullRequestDiffSchema.safeParse(await this.transport.loadPullRequestDiff(target.project, target.pullRequestNumber));
      this.publish(key, parsed.success ? { status: 'ready', diff: parsed.data } : { status: 'failed', error: describeZodError(parsed.error), previous });
    } catch (error) {
      this.publish(key, { status: 'failed', error: describeError(error), previous });
    }
  }

  private publish(key: string, state: PullRequestDiffState): void {
    this.states.set(key, state);
    for (const listener of this.listeners.get(key) ?? []) listener();
  }
}
