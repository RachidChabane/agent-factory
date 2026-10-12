import { lockHolder, ProcessLock } from '@agent-factory/adapters';
import type { FactoryConfig } from '../../config/factory-config.ts';
import { factoryLockPath } from '../../composition/factory-runtime.ts';

export async function runningFactory(config: FactoryConfig): Promise<number | null> {
  const holder = await lockHolder(factoryLockPath(config));
  return holder === process.pid ? null : holder;
}

export async function withFactoryLock<T>(config: FactoryConfig, work: () => Promise<T>): Promise<T> {
  const lock = new ProcessLock(factoryLockPath(config));
  await lock.acquire();
  try {
    return await work();
  } finally {
    await lock.release();
  }
}
