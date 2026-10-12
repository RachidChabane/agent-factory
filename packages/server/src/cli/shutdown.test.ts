import { describe, expect, it } from 'vitest';
import type { CliOutput } from './output.ts';
import { abortOnShutdown } from './shutdown.ts';

function recordingOutput(): CliOutput & { readonly errors: string[] } {
  const errors: string[] = [];
  return { errors, line: () => undefined, error: (text) => errors.push(text) };
}

describe('shutdown signals', () => {
  it('stops on the first signal and only reports the next ones', () => {
    const controller = new AbortController();
    const output = recordingOutput();
    const detach = abortOnShutdown(controller, output);
    try {
      // Node calls a signal listener with the name of the signal it received.
      process.emit('SIGTERM', 'SIGTERM');
      process.emit('SIGINT', 'SIGINT');
    } finally {
      detach();
    }
    expect(controller.signal.aborted).toBe(true);
    expect(output.errors).toEqual(['SIGTERM received; stopping', 'SIGINT received again; the factory is already stopping its agents and commands']);
  });

  it('stops listening once detached', () => {
    const controller = new AbortController();
    const detach = abortOnShutdown(controller, recordingOutput());
    detach();
    expect(process.listenerCount('SIGTERM')).toBe(0);
    expect(controller.signal.aborted).toBe(false);
  });
});
