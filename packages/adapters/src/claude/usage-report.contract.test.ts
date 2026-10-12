import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { CommandResult, CommandRunner } from '@agent-factory/application';
import { ClaudeUsageReport, parseUsageReport, USAGE_REPORT_ARGUMENTS, UsageReportError } from './usage-report.ts';

const FIXTURE = new URL('./fixtures/usage-report-2.1.296.jsonl', import.meta.url);
const READ_AT = new Date('2026-10-12T09:45:00.000Z');

class ScriptedRunner implements CommandRunner {
  readonly calls: { command: readonly string[]; env: Readonly<Record<string, string>> }[] = [];
  result: CommandResult = { exitCode: 0, stdout: '', stderr: '', durationMs: 1, timedOut: false };

  run(command: readonly string[], _cwd: string, _timeoutMs: number, env: Readonly<Record<string, string>>): Promise<CommandResult> {
    this.calls.push({ command, env });
    return Promise.resolve(this.result);
  }
}

describe('the usage report of the Claude Code CLI', () => {
  it('classifies the recorded report by limit kind, with the model of the scoped weekly limit', async () => {
    expect(parseUsageReport(await readFile(FIXTURE, 'utf8'))).toEqual([
      { kind: 'session', scope: null, utilization: 0.05, resetsAt: new Date('2026-10-12T13:39:59.641Z') },
      { kind: 'weekly_all', scope: null, utilization: 0.02, resetsAt: new Date('2026-10-15T12:59:59.641Z') },
      { kind: 'weekly_scoped', scope: 'Opus', utilization: 0, resetsAt: new Date('2026-10-15T13:00:00.000Z') },
    ]);
  });

  it('ignores a limit kind it does not know rather than guessing from its label', () => {
    const line = JSON.stringify({ type: 'assistant', usage_report: { rate_limits: { limits: [{ kind: 'monthly_team', percent: 50, resets_at: null }] } } });
    expect(parseUsageReport(line)).toEqual([]);
  });

  it('fails clearly when the output holds no report', () => {
    expect(() => parseUsageReport('{"type":"result"}\n')).toThrow(UsageReportError);
  });

  it('runs the usage command under the account directory and stamps the reading with its read time', async () => {
    const runner = new ScriptedRunner();
    runner.result = { ...runner.result, stdout: await readFile(FIXTURE, 'utf8') };
    const source = new ClaudeUsageReport(runner, { now: () => READ_AT }, {
      command: ['claude'],
      accountDirectories: { primary: '/home/operator/.claude-primary' },
      environment: { PATH: '/usr/bin' },
      workingDirectory: '/tmp',
    });
    const reading = await source.read('primary');
    expect(runner.calls[0]).toEqual({ command: ['claude', ...USAGE_REPORT_ARGUMENTS], env: { PATH: '/usr/bin', CLAUDE_CONFIG_DIR: '/home/operator/.claude-primary' } });
    expect(reading).toMatchObject({ account: 'primary', source: 'usage-report', readAt: READ_AT });
    expect(reading.limits).toHaveLength(3);
  });

  it('reports a timeout as a login to do', async () => {
    const runner = new ScriptedRunner();
    runner.result = { ...runner.result, timedOut: true, exitCode: 1 };
    const source = new ClaudeUsageReport(runner, { now: () => READ_AT }, { command: ['claude'], accountDirectories: {}, environment: {}, workingDirectory: '/tmp' });
    await expect(source.read('default')).rejects.toThrow('probably waiting for a login');
  });
});
