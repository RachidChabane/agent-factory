import { describe, expect, it } from 'vitest';
import { COMMAND_SUBCOMMANDS, COMMAND_VERBS, parseCommandLine, USAGE, type CliCommand } from './command-line.ts';

const SHA = '0123456789abcdef0123456789abcdef01234567';

function ok(command: CliCommand, project: string | null = null) {
  return { ok: true, line: { project, command } };
}

describe('parseCommandLine', () => {
  it('parses every command', () => {
    expect(parseCommandLine(['run-issue', '42'])).toEqual(ok({ kind: 'run-issue', issueNumber: 42 }));
    expect(parseCommandLine(['status', '7'])).toEqual(ok({ kind: 'status', issueNumber: 7 }));
    expect(parseCommandLine(['resume', '7'])).toEqual(ok({ kind: 'resume', issueNumber: 7, answer: null, delegation: null }));
    expect(parseCommandLine(['resume', '7', '--answer', 'Use the module option.'])).toEqual(ok({ kind: 'resume', issueNumber: 7, answer: 'Use the module option.', delegation: null }));
    expect(parseCommandLine(['resume', '--answer=Yes', '7'])).toEqual(ok({ kind: 'resume', issueNumber: 7, answer: 'Yes', delegation: null }));
    expect(parseCommandLine(['validate'])).toEqual(ok({ kind: 'validate', offline: false, gatePreflight: true }));
    expect(parseCommandLine(['validate', '--skip-gate-preflight'])).toEqual(ok({ kind: 'validate', offline: false, gatePreflight: false }));
    expect(parseCommandLine(['validate', '--quick'])).toEqual({ ok: false, error: 'unknown option --quick' });
    expect(parseCommandLine(['validate', '--offline'])).toEqual(ok({ kind: 'validate', offline: true, gatePreflight: true }));
    expect(parseCommandLine(['merge', '100', '--expected-head', SHA])).toEqual(ok({ kind: 'merge', pullRequestNumber: 100, expectedHeadSha: SHA, delegation: null }));
    expect(parseCommandLine(['merge', `--expected-head=${SHA}`, '100'])).toEqual(ok({ kind: 'merge', pullRequestNumber: 100, expectedHeadSha: SHA, delegation: null }));
  });

  it('parses the rehearsal commands', () => {
    expect(parseCommandLine(['rehearsal', 'init', '../storefront'])).toEqual(ok({ kind: 'rehearsal-init', sourceClonePath: '../storefront' }));
    expect(parseCommandLine(['rehearsal', 'add-issue', 'spec.md', '--labels', 'type:infra, spec:validated'])).toEqual(ok({ kind: 'rehearsal-add-issue', specPath: 'spec.md', labels: ['type:infra', 'spec:validated'] }));
    expect(parseCommandLine(['rehearsal', 'add-issue', '--labels=a', 'spec.md'])).toEqual(ok({ kind: 'rehearsal-add-issue', specPath: 'spec.md', labels: ['a'] }));
    expect(parseCommandLine(['rehearsal', 'add-issue', 'spec.md'])).toEqual(ok({ kind: 'rehearsal-add-issue', specPath: 'spec.md', labels: [] }));
    expect(parseCommandLine(['rehearsal', 'reset', '../storefront'])).toEqual(ok({ kind: 'rehearsal-reset', sourceClonePath: '../storefront' }));
    expect(parseCommandLine(['rehearsal', 'reset'])).toEqual({ ok: false, error: 'missing source clone path' });
    expect(parseCommandLine(['rehearsal'])).toEqual({ ok: false, error: 'missing rehearsal subcommand' });
    expect(parseCommandLine(['rehearsal', 'init'])).toEqual({ ok: false, error: 'missing source clone path' });
    expect(parseCommandLine(['rehearsal', 'add-issue', '--force', 'x'])).toEqual({ ok: false, error: 'unknown option --force' });
    expect(parseCommandLine(['rehearsal', 'push'])).toEqual({ ok: false, error: 'unknown rehearsal subcommand "push"' });
  });

  it('parses start, requests, issue creation and pull request feedback', () => {
    expect(parseCommandLine(['start'])).toEqual(ok({ kind: 'start', demo: false, port: null }));
    expect(parseCommandLine(['request', 'add', 'ask.md', '--images', 'shots', '--requester=Dana'])).toEqual(ok({ kind: 'request-add', path: 'ask.md', imagesDirectory: 'shots', requester: 'Dana' }));
    expect(parseCommandLine(['request', 'add', 'ask.md'])).toEqual(ok({ kind: 'request-add', path: 'ask.md', imagesDirectory: null, requester: 'unknown' }));
    expect(parseCommandLine(['request', 'challenge', 'req-3'])).toEqual(ok({ kind: 'request-challenge', requestId: 'req-3' }));
    expect(parseCommandLine(['issue', 'create', 'spec.md', '--confirm'])).toEqual(ok({ kind: 'issue-create', specPath: 'spec.md', blockedBy: [], confirmed: true, start: false, delegation: null }));
    expect(parseCommandLine(['issue', 'create', 'spec.md', '--start'])).toEqual(ok({ kind: 'issue-create', specPath: 'spec.md', blockedBy: [], confirmed: false, start: true, delegation: null }));
    expect(parseCommandLine(['issue', 'create', 'spec.md', '--blocked-by', '12, 14,12', '--start'])).toEqual(ok({ kind: 'issue-create', specPath: 'spec.md', blockedBy: [12, 14], confirmed: false, start: true, delegation: null }));
    expect(parseCommandLine(['issue', 'create', '--blocked-by=7', 'spec.md'])).toEqual(ok({ kind: 'issue-create', specPath: 'spec.md', blockedBy: [7], confirmed: false, start: false, delegation: null }));
    expect(parseCommandLine(['issue', 'create', 'spec.md', '--blocked-by', '12,x'])).toEqual({ ok: false, error: '--blocked-by must list issue numbers separated by commas, got "12,x"' });
    expect(parseCommandLine(['issue', 'create', 'spec.md', '--blocked-by', '0'])).toEqual({ ok: false, error: '--blocked-by must list issue numbers separated by commas, got "0"' });
    expect(parseCommandLine(['issue', 'create', 'spec.md', '--blocked-by'])).toEqual({ ok: false, error: 'missing value for --blocked-by' });
    expect(parseCommandLine(['pr', 'feedback', '12', 'notes.md', '--author', 'Riley'])).toEqual(ok({ kind: 'pr-feedback', pullRequestNumber: 12, path: 'notes.md', author: 'Riley' }));
    expect(parseCommandLine(['pr', 'feedback', '12', 'notes.md'])).toEqual({ ok: false, error: 'missing --author <name>' });
    expect(parseCommandLine(['film', '12', '--scenario', 'checkout-flow'])).toEqual(ok({ kind: 'film', issueNumber: 12, scenario: 'checkout-flow' }));
    expect(parseCommandLine(['film', '--scenario=order.history', '12', '--project', 'storefront'])).toEqual(ok({ kind: 'film', issueNumber: 12, scenario: 'order.history' }, 'storefront'));
    expect(parseCommandLine(['film', '12'])).toEqual({ ok: false, error: 'missing --scenario <name>' });
    expect(parseCommandLine(['film', '--scenario', 'checkout-flow'])).toEqual({ ok: false, error: 'missing issue number' });
    expect(parseCommandLine(['film', 'twelve', '--scenario', 'checkout-flow'])).toEqual({ ok: false, error: 'issue number must be a positive integer, got "twelve"' });
    expect(parseCommandLine(['film', '12', '--scenario', '../escape'])).toEqual({
      ok: false,
      error: expect.stringContaining('--scenario must be letters, digits, dot, underscore and hyphen'),
    });
    expect(parseCommandLine(['film', '12', '--scenario', 'checkout-flow', '--all'])).toEqual({ ok: false, error: 'unknown option --all' });
    expect(parseCommandLine(['audit', '8d33a43', '38ab3a0'])).toEqual(ok({ kind: 'audit', commits: ['8d33a43', '38ab3a0'] }));
    expect(parseCommandLine(['audit'])).toEqual({ ok: false, error: 'missing commit' });
    expect(parseCommandLine(['audit', 'main'])).toEqual({ ok: false, error: 'commit must be a hexadecimal sha of 7 to 40 characters, got "main"' });
    expect(parseCommandLine(['audit', 'abc1234', '--all'])).toEqual({ ok: false, error: 'unknown option --all' });
    expect(parseCommandLine(['request', 'add'])).toEqual({ ok: false, error: 'missing request file' });
    expect(parseCommandLine(['request', 'add', 'a.md', '--images'])).toEqual({ ok: false, error: 'missing value for --images' });
    expect(parseCommandLine(['issue', 'create', 'spec.md', '--yes'])).toEqual({ ok: false, error: 'unknown option --yes' });
    expect(parseCommandLine(['issue', 'abandon', '5', '--reason', ' waits on an architecture decision '])).toEqual(ok({ kind: 'issue-abandon', issueNumber: 5, reason: 'waits on an architecture decision' }));
    expect(parseCommandLine(['issue', 'abandon', '5', '--reason=superseded by #9'])).toEqual(ok({ kind: 'issue-abandon', issueNumber: 5, reason: 'superseded by #9' }));
    expect(parseCommandLine(['issue', 'abandon', '5', '--reason=keep a=b intact'])).toEqual(ok({ kind: 'issue-abandon', issueNumber: 5, reason: 'keep a=b intact' }));
    expect(parseCommandLine(['issue', 'abandon', '5'])).toEqual({ ok: false, error: 'missing --reason <text>' });
    expect(parseCommandLine(['issue', 'abandon', '5', '--reason', '  '])).toEqual({ ok: false, error: 'missing --reason <text>' });
    expect(parseCommandLine(['issue', 'abandon', '--reason', 'x'])).toEqual({ ok: false, error: 'missing issue number' });
    expect(parseCommandLine(['issue', 'abandon', 'five', '--reason', 'x'])).toEqual({ ok: false, error: 'issue number must be a positive integer, got "five"' });
    expect(parseCommandLine(['issue', 'close', '5'])).toEqual({ ok: false, error: 'unknown issue subcommand "close"' });
    expect(parseCommandLine(['start', 'now'])).toEqual({ ok: false, error: 'unexpected arguments: now' });
  });

  it('takes the project from anywhere on the line', () => {
    expect(parseCommandLine(['--project', 'ledger', 'run-issue', '4'])).toEqual(ok({ kind: 'run-issue', issueNumber: 4 }, 'ledger'));
    expect(parseCommandLine(['run-issue', '4', '--project=ledger'])).toEqual(ok({ kind: 'run-issue', issueNumber: 4 }, 'ledger'));
    expect(parseCommandLine(['status'])).toEqual(ok({ kind: 'status', issueNumber: null }));
    expect(parseCommandLine(['--project'])).toEqual({ ok: false, error: 'missing value for --project' });
    expect(parseCommandLine(['--project='])).toEqual({ ok: false, error: 'missing value for --project' });
  });

  it('parses the commands of the installation', () => {
    expect(parseCommandLine(['init'])).toEqual(ok({ kind: 'init', repository: null, id: null, name: null, forge: null, force: false }));
    expect(parseCommandLine(['init', '../ledger', '--id', 'ledger', '--name=Billing API', '--forge', 'local', '--force'])).toEqual(
      ok({ kind: 'init', repository: '../ledger', id: 'ledger', name: 'Billing API', forge: 'local', force: true }),
    );
    expect(parseCommandLine(['init', '--forge', 'gitlab'])).toEqual({ ok: false, error: '--forge must be one of github, local, got "gitlab"' });
    expect(parseCommandLine(['init', 'a', 'b'])).toEqual({ ok: false, error: 'unexpected arguments: b' });
    expect(parseCommandLine(['schema'])).toEqual(ok({ kind: 'schema' }));
    expect(parseCommandLine(['schema', 'out.json'])).toEqual({ ok: false, error: 'unexpected arguments: out.json' });
    expect(parseCommandLine(['usage'])).toEqual(ok({ kind: 'usage', refresh: false }));
    expect(parseCommandLine(['usage', '--refresh'])).toEqual(ok({ kind: 'usage', refresh: true }));
    expect(parseCommandLine(['stop'])).toEqual(ok({ kind: 'stop', now: false }));
    expect(parseCommandLine(['stop', '--now'])).toEqual(ok({ kind: 'stop', now: true }));
    expect(parseCommandLine(['stop', 'later'])).toEqual({ ok: false, error: 'unexpected arguments: later' });
    expect(parseCommandLine(['start', '--demo', '--port', '7440'])).toEqual(ok({ kind: 'start', demo: true, port: 7440 }));
    expect(parseCommandLine(['start', '--port=70000'])).toEqual({ ok: false, error: '--port must be a port number from 1 to 65535, got "70000"' });
    expect(parseCommandLine(['start', '--port', 'http'])).toEqual({ ok: false, error: '--port must be a port number from 1 to 65535, got "http"' });
  });

  it('parses the watch of the running factory', () => {
    expect(parseCommandLine(['watch'])).toEqual(ok({ kind: 'watch', intervalSeconds: 20, once: false, json: false, port: null }));
    expect(parseCommandLine(['watch', '--once', '--json'])).toEqual(ok({ kind: 'watch', intervalSeconds: 20, once: true, json: true, port: null }));
    expect(parseCommandLine(['watch', '--interval', '5', '--port=7445'])).toEqual(ok({ kind: 'watch', intervalSeconds: 5, once: false, json: false, port: 7445 }));
    expect(parseCommandLine(['watch', '--interval=0'])).toEqual({ ok: false, error: '--interval must be a whole number of seconds, 1 or more, got "0"' });
    expect(parseCommandLine(['watch', '--interval', 'often'])).toEqual({ ok: false, error: '--interval must be a whole number of seconds, 1 or more, got "often"' });
    expect(parseCommandLine(['watch', '--interval'])).toEqual({ ok: false, error: 'missing value for --interval' });
    expect(parseCommandLine(['watch', '--port', '70000'])).toEqual({ ok: false, error: '--port must be a port number from 1 to 65535, got "70000"' });
    expect(parseCommandLine(['watch', 'now'])).toEqual({ ok: false, error: 'unexpected arguments: now' });
    expect(parseCommandLine(['watch', '--follow'])).toEqual({ ok: false, error: 'unknown option --follow' });
  });

  it('lists every verb and subcommand it defines, and prints each verb in its usage', () => {
    expect(COMMAND_VERBS).toEqual(expect.arrayContaining(['init', 'validate', 'start', 'status', 'watch', 'stop', 'merge', 'resume', 'issue', 'pr', 'request', 'tool']));
    expect(COMMAND_SUBCOMMANDS['issue']).toEqual(['create', 'validate', 'abandon']);
    expect(COMMAND_SUBCOMMANDS['pr']).toEqual(['feedback']);
    expect(COMMAND_SUBCOMMANDS['run-issue']).toBeUndefined();
    for (const verb of COMMAND_VERBS.filter((candidate) => candidate !== 'help')) expect(USAGE, verb).toContain(`  ${verb}`);
  });

  it('parses the gestures a project can delegate, with or without the delegate', () => {
    const delegation = { actor: 'orchestrator', reason: 'a documentation change with a clean review' };
    expect(parseCommandLine(['issue', 'validate', '12'])).toEqual(ok({ kind: 'issue-validate', issueNumber: 12, delegation: null }));
    expect(parseCommandLine(['issue', 'validate', '12', '--as', 'orchestrator', '--reason', ' a documentation change with a clean review '])).toEqual(
      ok({ kind: 'issue-validate', issueNumber: 12, delegation }),
    );
    expect(parseCommandLine(['resume', '7', '--as=orchestrator', '--reason=a documentation change with a clean review'])).toEqual(
      ok({ kind: 'resume', issueNumber: 7, answer: null, delegation }),
    );
    expect(parseCommandLine(['resume', '7', '--answer', 'Yes', '--as', 'orchestrator', '--reason', 'the spec answers it'])).toEqual(
      ok({ kind: 'resume', issueNumber: 7, answer: 'Yes', delegation: { actor: 'orchestrator', reason: 'the spec answers it' } }),
    );
    expect(parseCommandLine(['merge', '100', '--expected-head', SHA, '--as', 'orchestrator', '--reason', 'a documentation change with a clean review'])).toEqual(
      ok({ kind: 'merge', pullRequestNumber: 100, expectedHeadSha: SHA, delegation }),
    );
    expect(parseCommandLine(['issue', 'create', 'spec.md', '--start', '--as', 'orchestrator', '--reason', 'a documentation change with a clean review', '--project', 'ledger'])).toEqual(
      ok({ kind: 'issue-create', specPath: 'spec.md', blockedBy: [], confirmed: false, start: true, delegation }, 'ledger'),
    );
  });

  it('wants --as and --reason together, and --as only on a gesture a project can delegate', () => {
    expect(parseCommandLine(['merge', '100', '--expected-head', SHA, '--as', 'orchestrator'])).toEqual({ ok: false, error: '--as needs --reason "<why>"' });
    expect(parseCommandLine(['merge', '100', '--expected-head', SHA, '--as', 'orchestrator', '--reason', '  '])).toEqual({ ok: false, error: '--as needs --reason "<why>"' });
    expect(parseCommandLine(['merge', '100', '--expected-head', SHA, '--reason', 'because'])).toEqual({ ok: false, error: '--reason goes with --as <actor>' });
    expect(parseCommandLine(['resume', '7', '--as'])).toEqual({ ok: false, error: 'missing value for --as' });
    expect(parseCommandLine(['issue', 'create', 'spec.md', '--as', 'orchestrator', '--reason', 'because'])).toEqual({
      ok: false,
      error: '--as goes with --start: creating an issue is no gesture of the operator, validating its spec is',
    });
    for (const line of [['issue', 'abandon', '5', '--as', 'orchestrator', '--reason', 'x'], ['run-issue', '4', '--as', 'orchestrator'], ['film', '12', '--scenario', 'tour', '--as', 'orchestrator'], ['stop', '--as=orchestrator']]) {
      expect(parseCommandLine(line), line.join(' ')).toEqual({
        ok: false,
        error: expect.stringContaining('is not a gesture a project can delegate; --as goes with resume, merge, issue create, issue validate') as string,
      });
    }
  });

  it('keeps --reason as the reason of an abandoned issue when no delegate is named', () => {
    expect(parseCommandLine(['issue', 'abandon', '5', '--reason', 'superseded'])).toEqual(ok({ kind: 'issue-abandon', issueNumber: 5, reason: 'superseded' }));
    expect(parseCommandLine(['run-issue', '4', '--reason', 'because'])).toEqual({ ok: false, error: 'unknown option --reason' });
  });

  it('explains the delegate options in its usage', () => {
    expect(USAGE).toContain('--as <actor> --reason "<why>"');
    expect(USAGE).toContain('issue validate <issue>');
  });

  it('shows help without arguments or when asked', () => {
    expect(parseCommandLine([])).toEqual(ok({ kind: 'help' }));
    expect(parseCommandLine(['--help'])).toEqual(ok({ kind: 'help' }));
  });

  it('explains what is wrong with the arguments', () => {
    expect(parseCommandLine(['run-issue'])).toEqual({ ok: false, error: 'missing issue number' });
    expect(parseCommandLine(['run-issue', '0'])).toEqual({ ok: false, error: 'issue number must be a positive integer, got "0"' });
    expect(parseCommandLine(['run-issue', '4', '5'])).toEqual({ ok: false, error: 'unexpected arguments: 5' });
    expect(parseCommandLine(['merge', '100'])).toEqual({ ok: false, error: 'missing --expected-head <sha>' });
    expect(parseCommandLine(['merge', '100', '--expected-head', 'abc1234'])).toEqual({
      ok: false,
      error: '--expected-head must be the full 40-character commit sha, got "abc1234"',
    });
    expect(parseCommandLine(['merge', '100', '--force'])).toEqual({ ok: false, error: 'unknown option --force' });
    expect(parseCommandLine(['resume', '7', '--answer'])).toEqual({ ok: false, error: 'missing value for --answer' });
    expect(parseCommandLine(['resume', '7', '--answer', ' '])).toEqual({ ok: false, error: '--answer needs the text of the answer' });
    expect(parseCommandLine(['resume', '7', '--force'])).toEqual({ ok: false, error: 'unknown option --force' });
    expect(parseCommandLine(['deploy'])).toEqual({ ok: false, error: 'unknown command "deploy"' });
  });
});
