import type { AgentRunRequest } from '@agent-factory/application';
import { describe, expect, it } from 'vitest';
import { CLAUDE_PRINT_MODE_INVOCATION, buildClaudeArguments } from './claude-invocation.ts';
import { launchCommand } from './claude-harness-config.ts';

const REQUEST: AgentRunRequest = {
  runId: 'run-1',
  context: { subject: { kind: 'issue', id: '42' }, attempt: 0, branch: 'factory/42-thing' },
  account: null,
  role: 'implementer',
  model: 'haiku',
  effort: 'low',
  workingDirectory: '/worktree',
  prompt: '- starts with a dash',
  appendSystemPrompt: 'Be precise.',
  allowedTools: [],
  mcpServers: {},
  resumeSessionId: null,
  maxBudgetUsd: 1.5,
  maxTurns: 40,
  frozenChecks: [],
  gateCommand: null,
  decisionRequestPath: null,
  timeoutMs: 60_000,
};

const FILES = {
  settingsPath: '/runs/run-1/settings.json',
  mcpConfigPath: '/runs/run-1/mcp-config.json',
  appendSystemPromptPath: '/runs/run-1/append-system-prompt.md',
};

const TOOLS = { availableTools: ['Read', 'Bash'], allowedTools: ['Read', 'Bash(npm run *)'] };

function valueOf(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

describe('buildClaudeArguments', () => {
  const args = buildClaudeArguments(REQUEST, FILES, TOOLS);

  it('starts with the fixed print-mode invocation', () => {
    expect(args.slice(0, CLAUDE_PRINT_MODE_INVOCATION.length)).toEqual([...CLAUDE_PRINT_MODE_INVOCATION]);
    expect(valueOf(args, '--setting-sources')).toBe('project,local');
    expect(valueOf(args, '--permission-mode')).toBe('dontAsk');
    expect(valueOf(args, '--output-format')).toBe('stream-json');
    expect(args).toContain('--include-hook-events');
    expect(args).toContain('--strict-mcp-config');
  });

  it('passes the run limits and files', () => {
    expect(valueOf(args, '--model')).toBe('haiku');
    expect(valueOf(args, '--effort')).toBe('low');
    expect(valueOf(args, '--max-turns')).toBe('40');
    expect(valueOf(args, '--max-budget-usd')).toBe('1.5');
    expect(valueOf(args, '--settings')).toBe(FILES.settingsPath);
    expect(valueOf(args, '--mcp-config')).toBe(FILES.mcpConfigPath);
    expect(valueOf(args, '--append-system-prompt-file')).toBe(FILES.appendSystemPromptPath);
    expect(valueOf(args, '--tools')).toBe('Read,Bash');
    expect(valueOf(args, '--allowedTools')).toBe('Read,Bash(npm run *)');
  });

  it('keeps the prompt off the command line', () => {
    expect(args).not.toContain(REQUEST.prompt);
  });

  it('resumes a session only when asked', () => {
    expect(args).not.toContain('--resume');
    const resumed = buildClaudeArguments({ ...REQUEST, resumeSessionId: 'session-9' }, FILES, TOOLS);
    expect(valueOf(resumed, '--resume')).toBe('session-9');
  });
});

describe('buildClaudeArguments additional directories', () => {
  it('adds no --add-dir without directories', () => {
    expect(buildClaudeArguments(REQUEST, FILES, TOOLS)).not.toContain('--add-dir');
  });

  it('passes one --add-dir per directory', () => {
    const args = buildClaudeArguments(REQUEST, FILES, TOOLS, ['/refs/design-tokens@v1', '/refs/icons@v2']);
    const directories = args.flatMap((arg, index) => (arg === '--add-dir' ? [args[index + 1]] : []));
    expect(directories).toEqual(['/refs/design-tokens@v1', '/refs/icons@v2']);
  });
});

describe('launchCommand', () => {
  it('lowers the scheduling priority when a niceness is configured', () => {
    expect(launchCommand({ command: ['claude'], niceness: 10 })).toEqual(['nice', '-n', '10', 'claude']);
  });

  it('launches the command directly without a niceness', () => {
    expect(launchCommand({ command: ['claude'], niceness: null })).toEqual(['claude']);
  });
});
