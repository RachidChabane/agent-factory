import { describe, expect, it } from 'vitest';
import type { CommandResult, CommandRunner, Sleeper } from '@agent-factory/application';
import { GitHubCommandError } from './errors.ts';
import { GhCliGateway } from './ghCliGateway.ts';
import { readFixture } from './fakeGh.ts';
import { isTransientFailure, withTransientRetries, type RetrySettings } from './transientRetries.ts';

const DELAYS_MS = [10, 20, 30];
const OK = 0;
const FAILED = 1;

class RecordingSleeper implements Sleeper {
  readonly slept: number[] = [];

  sleep(milliseconds: number): Promise<void> {
    this.slept.push(milliseconds);
    return Promise.resolve();
  }
}

function result(stdout: string, exitCode = OK, stderr = ''): CommandResult {
  return { exitCode, stdout, stderr, durationMs: 1, timedOut: false };
}

/** Answers each gh call by the first rule whose text occurs in the command line, each rule giving its answers in turn. */
class ScriptedGh implements CommandRunner {
  readonly calls: string[] = [];
  private readonly rules: readonly { readonly contains: string; readonly answers: CommandResult[] }[];

  constructor(rules: readonly { readonly contains: string; readonly answers: CommandResult[] }[]) {
    this.rules = rules;
  }

  run(command: readonly string[]): Promise<CommandResult> {
    const line = command.slice(1).join(' ');
    this.calls.push(line);
    const rule = this.rules.find((candidate) => line.includes(candidate.contains));
    if (rule === undefined) return Promise.resolve(result('', FAILED, `no rule for ${line}`));
    const answer = rule.answers.length > 1 ? rule.answers.shift() : rule.answers[0];
    return Promise.resolve(answer ?? result('', FAILED, 'no answer'));
  }

  count(text: string): number {
    return this.calls.filter((line) => line.includes(text)).length;
  }
}

function gateway(gh: ScriptedGh, sleeper: RecordingSleeper): GhCliGateway {
  const retry: RetrySettings = { delaysMs: DELAYS_MS, sleeper };
  return new GhCliGateway(gh, { owner: 'example-org', repository: 'storefront', baseBranch: 'main', environment: {}, retry });
}

const BAD_GATEWAY = result('', FAILED, 'gh: HTTP 502: Bad Gateway (https://api.github.com/repos/example-org/storefront/issues)');
const GATEWAY_TIMEOUT = result('', FAILED, 'gh: HTTP 504: Gateway Timeout');
const UNPROCESSABLE = result('', FAILED, 'gh: Validation Failed (HTTP 422)');

describe('transient failures of GitHub calls', () => {
  it('recognises the failures that pass, and only those', () => {
    expect(isTransientFailure(new GitHubCommandError(['api'], FAILED, 'HTTP 502: Bad Gateway', false))).toBe(true);
    expect(isTransientFailure(new GitHubCommandError(['api'], FAILED, 'read tcp 10.0.0.2:443: connection reset by peer', false))).toBe(true);
    expect(isTransientFailure(new GitHubCommandError(['api'], FAILED, '', true))).toBe(true);
    expect(isTransientFailure(new GitHubCommandError(['api'], FAILED, 'Validation Failed (HTTP 422)', false))).toBe(false);
    expect(isTransientFailure(new Error('HTTP 502'))).toBe(false);
  });

  it('tries again after each delay and gives up with the last failure', async () => {
    const sleeper = new RecordingSleeper();
    let tries = 0;
    const failing = () => {
      tries += 1;
      return Promise.reject(new GitHubCommandError(['api'], FAILED, 'HTTP 503: Service Unavailable', false));
    };
    await expect(withTransientRetries(failing, { delaysMs: DELAYS_MS, sleeper })).rejects.toThrow('503');
    expect(tries).toBe(DELAYS_MS.length + 1);
    expect(sleeper.slept).toEqual(DELAYS_MS);
  });

  it('reads again after a bad gateway', async () => {
    const issue = await readFixture('issue.json');
    const gh = new ScriptedGh([
      { contains: 'dependencies/blocked_by', answers: [result('[[]]')] },
      { contains: 'issues/194', answers: [BAD_GATEWAY, result(issue)] },
    ]);
    const sleeper = new RecordingSleeper();
    expect((await gateway(gh, sleeper).getIssue(194)).number).toBe(194);
    expect(gh.count('issues/194 --method GET')).toBe(2);
    expect(sleeper.slept).toEqual([DELAYS_MS[0]]);
  });

  it('returns the issue a timed-out creation opened anyway instead of opening it twice', async () => {
    const issue: unknown = JSON.parse(await readFixture('issue.json'));
    const opened = { ...(issue as object), number: 201, title: 'Show the order history', body: 'The body', state: 'open' };
    const gh = new ScriptedGh([
      { contains: 'issues?state=open', answers: [result(JSON.stringify([opened]))] },
      { contains: '--method POST', answers: [GATEWAY_TIMEOUT] },
    ]);
    const created = await gateway(gh, new RecordingSleeper()).createIssue('Show the order history', 'The body', ['factory']);
    expect(created.number).toBe(201);
    expect(gh.count('--method POST')).toBe(1);
  });

  it('creates the issue again when the failed creation left nothing behind', async () => {
    const issue = await readFixture('issue.json');
    const gh = new ScriptedGh([
      { contains: 'issues?state=open', answers: [result('[]')] },
      { contains: '--method POST', answers: [BAD_GATEWAY, result(issue)] },
    ]);
    expect((await gateway(gh, new RecordingSleeper()).createIssue('A title', 'A body', [])).number).toBe(194);
    expect(gh.count('--method POST')).toBe(2);
  });

  it('finds the pull request a failed creation opened, and never dispatches a workflow twice', async () => {
    const gh = new ScriptedGh([
      { contains: 'pr create', answers: [result('', FAILED, 'Post "https://api.github.com/graphql": net/http: TLS handshake timeout')] },
      { contains: 'pr list', answers: [result(JSON.stringify([{ number: 31, url: 'https://github.com/example-org/storefront/pull/31', headRefOid: 'a'.repeat(40) }]))] },
      { contains: 'workflow run', answers: [result('', FAILED, 'HTTP 503: Service Unavailable')] },
    ]);
    const github = gateway(gh, new RecordingSleeper());
    expect(await github.openPullRequest({ branch: 'factory/12-order-history', title: 'feat: show the order history', body: '', labels: ['factory'], closes: [12] })).toMatchObject({ number: 31 });
    expect(gh.count('pr create')).toBe(1);
    await expect(github.dispatchWorkflow({ workflow: 'deploy.yml', ref: 'main', inputs: {} })).rejects.toThrow('503');
    expect(gh.count('workflow run')).toBe(1);
  });

  it('never tries again a call GitHub refused for good', async () => {
    const gh = new ScriptedGh([{ contains: '--method POST', answers: [UNPROCESSABLE] }]);
    await expect(gateway(gh, new RecordingSleeper()).createIssue('A title', 'A body', [])).rejects.toThrow('422');
    expect(gh.count('--method POST')).toBe(1);
  });
});
