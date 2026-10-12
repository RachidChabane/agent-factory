import type { AgentRunRequest, Clock, RunLogEvent, RunLogLine, RunLogPage, RunLogStore } from '../ports.ts';

export class InMemoryRunLogStore implements RunLogStore {
  readonly lines = new Map<string, RunLogLine[]>();
  private readonly listeners = new Set<(line: RunLogLine) => void>();
  private readonly clock: Clock;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  append(runId: string, event: RunLogEvent): Promise<RunLogLine> {
    const lines = this.lines.get(runId) ?? [];
    const line: RunLogLine = { runId, index: lines.length, at: this.clock.now(), event };
    lines.push(line);
    this.lines.set(runId, lines);
    for (const listener of this.listeners) listener(line);
    return Promise.resolve(line);
  }

  read(runId: string, afterIndex: number | null): Promise<RunLogPage> {
    const lines = this.lines.get(runId) ?? [];
    return Promise.resolve({ runId, total: lines.length, lines: lines.filter((line) => afterIndex === null || line.index > afterIndex) });
  }

  subscribe(listener: (line: RunLogLine) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export class SteppingClock implements Clock {
  private current: Date;
  private readonly stepMs: number;

  constructor(start: Date, stepMs = 0) {
    this.current = start;
    this.stepMs = stepMs;
  }

  now(): Date {
    const now = this.current;
    this.current = new Date(this.current.getTime() + this.stepMs);
    return now;
  }

  set(at: Date): void {
    this.current = at;
  }
}

export function agentRunRequest(overrides: Partial<AgentRunRequest> = {}): AgentRunRequest {
  return {
    runId: 'run-1',
    context: { subject: { kind: 'issue', id: '42' }, attempt: 0, branch: 'factory/42-link' },
    account: null,
    role: 'implementer',
    model: 'sonnet',
    effort: 'high',
    workingDirectory: '/pool/slot-0',
    prompt: 'implement',
    appendSystemPrompt: '',
    allowedTools: [],
    mcpServers: {},
    resumeSessionId: null,
    maxBudgetUsd: 5,
    maxTurns: 80,
    frozenChecks: [],
    gateCommand: null,
    decisionRequestPath: null,
    timeoutMs: 60_000,
    ...overrides,
  };
}
