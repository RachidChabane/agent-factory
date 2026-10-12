import { describe, expect, it } from 'vitest';
import { repositoryQueue, SerialQueue } from './serialQueue.ts';

describe('the queue of a repository', () => {
  it('is the same for every way of naming the repository', () => {
    expect(repositoryQueue('/factory/projects/storefront/clone')).toBe(repositoryQueue('/factory/projects/storefront/clone/'));
    expect(repositoryQueue('/factory/projects/storefront/clone')).toBe(repositoryQueue('/factory/projects/storefront/worktrees/../clone'));
    expect(repositoryQueue('/factory/projects/storefront/clone')).not.toBe(repositoryQueue('/factory/projects/ledger/clone'));
  });

  it('runs one task after the other, whatever the earlier one did', async () => {
    const queue = new SerialQueue();
    const order: string[] = [];
    const slow = queue.run(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push('slow');
      throw new Error('failed');
    });
    const quick = queue.run(() => {
      order.push('quick');
      return Promise.resolve('done');
    });
    await expect(slow).rejects.toThrow('failed');
    expect(await quick).toBe('done');
    expect(order).toEqual(['slow', 'quick']);
  });
});
