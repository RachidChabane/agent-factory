import { lockHolder, ProcessLock } from '@agent-factory/adapters';
import type { AgentFactoryConfig } from '../../config/agent-factory-config.ts';
import { factoryLockPath } from '../../composition/runtime.ts';

/** The process of the factory running on this installation, or null when none runs. */
export async function runningFactory(config: AgentFactoryConfig): Promise<number | null> {
  const holder = await lockHolder(factoryLockPath(config.directories.state));
  return holder === process.pid ? null : holder;
}

export async function withFactoryLock<T>(config: AgentFactoryConfig, work: () => Promise<T>): Promise<T> {
  const lock = new ProcessLock(factoryLockPath(config.directories.state));
  await lock.acquire();
  try {
    return await work();
  } finally {
    await lock.release();
  }
}
