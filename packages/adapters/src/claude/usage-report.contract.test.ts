import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { CommandResult, CommandRunner } from '@agent-factory/application';
import { AUTH_STATUS_ARGUMENTS, ClaudeUsageReport, parseAuthStatus, parseUsageReport, REASON_LOGGED_OUT, USAGE_REPORT_ARGUMENTS, UsageReportError } from './usage-report.ts';

const FIXTURE = new URL('./fixtures/usage-report-2.1.296.jsonl', import.meta.url);
const READ_AT = new Date('2026-10-12T09:45:00.000Z');

const LOGGED_IN = JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', email: 'operator@example.com', orgName: 'Example Org', subscriptionType: 'max' });

class ScriptedRunner implements CommandRunner {
  readonly calls: { command: readonly string[]; env: Readonly<Record<string, string>> }[] = [];
  result: CommandResult = { exitCode: 0, stdout: '', stderr: '', durationMs: 1, timedOut: false };
  status: CommandResult = { exitCode: 0, stdout: LOGGED_IN, stderr: '', durationMs: 1, timedOut: false };

  run(command: readonly string[], _cwd: string, _timeoutMs: number, env: Readonly<Record<string, string>>): Promise<CommandResult> {
    this.calls.push({ command, env });
    return Promise.resolve(command.includes(AUTH_STATUS_ARGUMENTS[0] ?? '') ? this.status : this.result);
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
    const source = new ClaudeUsageReport(() => runner, { now: () => READ_AT }, {
      command: ['claude'],
      accountDirectories: { primary: '/home/operator/.claude-primary' },
      environment: { PATH: '/usr/bin' },
      workingDirectory: '/tmp',
    });
    const reading = await source.read('primary', new AbortController().signal);
    const env = { PATH: '/usr/bin', CLAUDE_CONFIG_DIR: '/home/operator/.claude-primary' };
    expect(runner.calls).toEqual([
      { command: ['claude', ...AUTH_STATUS_ARGUMENTS], env },
      { command: ['claude', ...USAGE_REPORT_ARGUMENTS], env },
    ]);
    expect(reading).toMatchObject({ account: 'primary', source: 'usage-report', readAt: READ_AT, identity: { email: 'operator@example.com', organization: 'Example Org', plan: 'max' } });
    expect(reading.limits).toHaveLength(3);
  });

  it('names no login when the CLI cannot say, and refuses to read the usage of a logged-out account', async () => {
    expect(parseAuthStatus('not json')).toBeNull();
    expect(parseAuthStatus('{"loggedIn":true}')).toEqual({ email: null, organization: null, plan: null });
    expect(() => parseAuthStatus('{"loggedIn":false}')).toThrow(REASON_LOGGED_OUT);
    const runner = new ScriptedRunner();
    runner.status = { ...runner.status, stdout: '{"loggedIn":false,"authMethod":"none"}' };
    const source = new ClaudeUsageReport(() => runner, { now: () => READ_AT }, { command: ['claude'], accountDirectories: {}, environment: {}, workingDirectory: '/tmp' });
    await expect(source.read('default', new AbortController().signal)).rejects.toThrow(UsageReportError);
    expect(runner.calls).toHaveLength(1);
  });

  it('reports a timeout as a login to do', async () => {
    const runner = new ScriptedRunner();
    runner.result = { ...runner.result, timedOut: true, exitCode: 1 };
    const source = new ClaudeUsageReport(() => runner, { now: () => READ_AT }, { command: ['claude'], accountDirectories: {}, environment: {}, workingDirectory: '/tmp' });
    await expect(source.read('default', new AbortController().signal)).rejects.toThrow('probably waiting for a login');
  });
});
