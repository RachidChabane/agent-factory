import { ProcessLock } from '@agent-factory/adapters';
import { factoryLockPath, startFactoryRuntime } from '../../composition/factory-runtime.ts';
import type { CliContext } from '../cli-context.ts';
import { abortOnShutdown } from '../shutdown.ts';
import { EXIT_CODES } from '../output.ts';

export async function startCommand(context: CliContext): Promise<number> {
  const config = await context.loadConfig();
  const lock = new ProcessLock(factoryLockPath(config));
  await lock.acquire();
  const controller = new AbortController();
  const releaseSignals = abortOnShutdown(controller, context.output);
  try {
    const factory = await context.openFactory(config);
    try {
      const runtime = await startFactoryRuntime(factory, controller.signal);
      context.output.line(`Factory started; cockpit at http://${runtime.address.address}:${runtime.address.port} (${config.server.publicUrl})`);
      await runtime.finished;
      context.output.line('Factory stopped');
      return EXIT_CODES.ok;
    } finally {
      factory.close();
    }
  } finally {
    releaseSignals();
    await lock.release();
  }
}
