import type { HookExecution } from './hook-decisions.ts';

export interface HookInvocation {
  readonly command: string;
  readonly payload: unknown;
  readonly workingDirectory: string;
  readonly timeoutMs: number;
}

export interface HookRunner {
  run(invocation: HookInvocation): Promise<HookExecution>;
}
