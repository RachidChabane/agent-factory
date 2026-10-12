import { describe, expect, it } from 'vitest';
import { NoopNotifier } from './noopNotifier.ts';

describe('NoopNotifier', () => {
  it('resolves without doing anything', async () => {
    await expect(new NoopNotifier().notify()).resolves.toBeUndefined();
  });
});
