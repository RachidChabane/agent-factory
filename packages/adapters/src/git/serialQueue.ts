import { resolve } from 'node:path';

export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

const REPOSITORY_QUEUES = new Map<string, SerialQueue>();

/**
 * The one queue of the operations that change a repository's refs and worktrees, shared by every object of the
 * process that works on it: two fetches into the same clone at once fail on the lock of the ref they both update.
 */
export function repositoryQueue(repository: string): SerialQueue {
  const key = resolve(repository);
  const existing = REPOSITORY_QUEUES.get(key);
  if (existing !== undefined) return existing;
  const created = new SerialQueue();
  REPOSITORY_QUEUES.set(key, created);
  return created;
}
