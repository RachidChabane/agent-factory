import { describe, expect, it } from 'vitest';
import { parseCommandLine } from './command-line.ts';

const SHA = '0123456789abcdef0123456789abcdef01234567';

describe('parseCommandLine', () => {
  it('parses every command', () => {
    expect(parseCommandLine(['run-issue', '42'])).toEqual({ ok: true, command: { kind: 'run-issue', issueNumber: 42 } });
    expect(parseCommandLine(['status', '7'])).toEqual({ ok: true, command: { kind: 'status', issueNumber: 7 } });
    expect(parseCommandLine(['resume', '7'])).toEqual({ ok: true, command: { kind: 'resume', issueNumber: 7, answer: null } });
    expect(parseCommandLine(['resume', '7', '--answer', 'Use the module option.'])).toEqual({
      ok: true,
      command: { kind: 'resume', issueNumber: 7, answer: 'Use the module option.' },
    });
    expect(parseCommandLine(['resume', '--answer=Yes', '7'])).toEqual({ ok: true, command: { kind: 'resume', issueNumber: 7, answer: 'Yes' } });
    expect(parseCommandLine(['validate'])).toEqual({ ok: true, command: { kind: 'validate', gatePreflight: true } });
    expect(parseCommandLine(['validate', '--skip-gate-preflight'])).toEqual({ ok: true, command: { kind: 'validate', gatePreflight: false } });
    expect(parseCommandLine(['validate', '--quick'])).toEqual({ ok: false, error: 'unexpected arguments: --quick' });
    expect(parseCommandLine(['merge', '100', '--expected-head', SHA])).toEqual({
      ok: true,
      command: { kind: 'merge', pullRequestNumber: 100, expectedHeadSha: SHA },
    });
    expect(parseCommandLine(['merge', `--expected-head=${SHA}`, '100'])).toEqual({
      ok: true,
      command: { kind: 'merge', pullRequestNumber: 100, expectedHeadSha: SHA },
    });
  });

  it('parses the rehearsal commands', () => {
    expect(parseCommandLine(['rehearsal', 'init', '../storefront'])).toEqual({
      ok: true,
      command: { kind: 'rehearsal-init', sourceClonePath: '../storefront' },
    });
    expect(parseCommandLine(['rehearsal', 'add-issue', 'spec.md', '--labels', 'type:infra-ci, spec:validated'])).toEqual({
      ok: true,
      command: { kind: 'rehearsal-add-issue', specPath: 'spec.md', labels: ['type:infra-ci', 'spec:validated'] },
    });
    expect(parseCommandLine(['rehearsal', 'add-issue', '--labels=a', 'spec.md'])).toEqual({
      ok: true,
      command: { kind: 'rehearsal-add-issue', specPath: 'spec.md', labels: ['a'] },
    });
    expect(parseCommandLine(['rehearsal', 'add-issue', 'spec.md'])).toEqual({
      ok: true,
      command: { kind: 'rehearsal-add-issue', specPath: 'spec.md', labels: [] },
    });
    expect(parseCommandLine(['rehearsal', 'reset', '../storefront'])).toEqual({
      ok: true,
      command: { kind: 'rehearsal-reset', sourceClonePath: '../storefront' },
    });
    expect(parseCommandLine(['rehearsal', 'reset'])).toEqual({ ok: false, error: 'missing source clone path' });
    expect(parseCommandLine(['rehearsal'])).toEqual({ ok: false, error: 'missing rehearsal subcommand' });
    expect(parseCommandLine(['rehearsal', 'init'])).toEqual({ ok: false, error: 'missing source clone path' });
    expect(parseCommandLine(['rehearsal', 'add-issue', '--force', 'x'])).toEqual({ ok: false, error: 'unknown option --force' });
    expect(parseCommandLine(['rehearsal', 'push'])).toEqual({ ok: false, error: 'unknown rehearsal subcommand "push"' });
  });

  it('parses start, requests, issue creation and pull request feedback', () => {
    expect(parseCommandLine(['start'])).toEqual({ ok: true, command: { kind: 'start' } });
    expect(parseCommandLine(['request', 'add', 'ask.md', '--images', 'shots', '--requester=Dana'])).toEqual({
      ok: true,
      command: { kind: 'request-add', path: 'ask.md', imagesDirectory: 'shots', requester: 'Dana' },
    });
    expect(parseCommandLine(['request', 'add', 'ask.md'])).toEqual({
      ok: true,
      command: { kind: 'request-add', path: 'ask.md', imagesDirectory: null, requester: 'unknown' },
    });
    expect(parseCommandLine(['request', 'challenge', 'req-3'])).toEqual({ ok: true, command: { kind: 'request-challenge', requestId: 'req-3' } });
    expect(parseCommandLine(['issue', 'create', 'spec.md', '--confirm'])).toEqual({
      ok: true,
      command: { kind: 'issue-create', specPath: 'spec.md', confirmed: true },
    });
    expect(parseCommandLine(['pr', 'feedback', '12', 'notes.md', '--author', 'Riley'])).toEqual({
      ok: true,
      command: { kind: 'pr-feedback', pullRequestNumber: 12, path: 'notes.md', author: 'Riley' },
    });
    expect(parseCommandLine(['pr', 'feedback', '12', 'notes.md'])).toEqual({ ok: false, error: 'missing --author <name>' });
    expect(parseCommandLine(['audit', '8d33a43', '38ab3a0'])).toEqual({ ok: true, command: { kind: 'audit', commits: ['8d33a43', '38ab3a0'] } });
    expect(parseCommandLine(['audit'])).toEqual({ ok: false, error: 'missing commit' });
    expect(parseCommandLine(['audit', 'main'])).toEqual({ ok: false, error: 'commit must be a hexadecimal sha of 7 to 40 characters, got "main"' });
    expect(parseCommandLine(['audit', 'abc1234', '--all'])).toEqual({ ok: false, error: 'unknown option --all' });
    expect(parseCommandLine(['request', 'add'])).toEqual({ ok: false, error: 'missing request file' });
    expect(parseCommandLine(['request', 'add', 'a.md', '--images'])).toEqual({ ok: false, error: 'missing value for --images' });
    expect(parseCommandLine(['issue', 'create', 'spec.md', '--yes'])).toEqual({ ok: false, error: 'unknown option --yes' });
    expect(parseCommandLine(['issue', 'abandon', '5', '--reason', ' waits on an architecture decision '])).toEqual({
      ok: true,
      command: { kind: 'issue-abandon', issueNumber: 5, reason: 'waits on an architecture decision' },
    });
    expect(parseCommandLine(['issue', 'abandon', '5', '--reason=superseded by #9'])).toEqual({
      ok: true,
      command: { kind: 'issue-abandon', issueNumber: 5, reason: 'superseded by #9' },
    });
    expect(parseCommandLine(['issue', 'abandon', '5', '--reason=keep a=b intact'])).toEqual({
      ok: true,
      command: { kind: 'issue-abandon', issueNumber: 5, reason: 'keep a=b intact' },
    });
    expect(parseCommandLine(['issue', 'abandon', '5'])).toEqual({ ok: false, error: 'missing --reason <text>' });
    expect(parseCommandLine(['issue', 'abandon', '5', '--reason', '  '])).toEqual({ ok: false, error: 'missing --reason <text>' });
    expect(parseCommandLine(['issue', 'abandon', '--reason', 'x'])).toEqual({ ok: false, error: 'missing issue number' });
    expect(parseCommandLine(['issue', 'abandon', 'five', '--reason', 'x'])).toEqual({ ok: false, error: 'issue number must be a positive integer, got "five"' });
    expect(parseCommandLine(['issue', 'close', '5'])).toEqual({ ok: false, error: 'unknown issue subcommand "close"' });
    expect(parseCommandLine(['start', 'now'])).toEqual({ ok: false, error: 'unexpected arguments: now' });
  });

  it('shows help without arguments or when asked', () => {
    expect(parseCommandLine([])).toEqual({ ok: true, command: { kind: 'help' } });
    expect(parseCommandLine(['--help'])).toEqual({ ok: true, command: { kind: 'help' } });
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
    expect(parseCommandLine(['resume', '7', '--answer'])).toEqual({ ok: false, error: 'missing text after --answer' });
    expect(parseCommandLine(['resume', '7', '--answer', ' '])).toEqual({ ok: false, error: '--answer needs the text of the answer' });
    expect(parseCommandLine(['resume', '7', '--force'])).toEqual({ ok: false, error: 'unknown option --force' });
    expect(parseCommandLine(['deploy'])).toEqual({ ok: false, error: 'unknown command "deploy"' });
  });
});
