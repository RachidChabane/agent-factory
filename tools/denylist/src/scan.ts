import { readFileSync } from 'node:fs';
import { argv, env, exit, stderr, stdin, stdout } from 'node:process';
import { DenylistMatcher, type DenylistMatch } from './matcher.ts';
import { loadDenylist, PATTERNS_PATH, PATTERNS_VARIABLE } from './patterns.ts';
import { historySubjects, messageFileSubject, pushRangeSubjects, stagedSubjects, workingTreeSubjects, type ScanSubject } from './sources.ts';

/** Set to "1" by a run that must not pass without patterns, such as CI on the default branch. */
const REQUIRED_VARIABLE = 'AGENT_FACTORY_DENYLIST_REQUIRED';
const REQUIRED = '1';
const EXIT_NO_PATTERNS = 3;
const EXIT_CLEAN = 0;
const EXIT_FINDINGS = 1;
const EXIT_USAGE = 2;
const UTF8 = 'utf8';
const SNIPPET_RADIUS = 24;
const REDACTION = '█';

const USAGE = `Usage: scan.ts <mode>
  --tree              tracked and untracked (not ignored) files of the working tree, with their paths
  --staged            staged content and paths
  --message <file>    a commit message file
  --history [<range>] every blob, path, commit message, author and reference reachable from all refs (or the range)
  --pre-push          the ranges git sends on standard input to a pre-push hook

The patterns come from the ${PATTERNS_VARIABLE} variable, else from tools/denylist/patterns.json. With neither, nothing is
scanned and the run passes, unless ${REQUIRED_VARIABLE}=${REQUIRED}.`;

interface Finding {
  readonly subject: string;
  readonly match: DenylistMatch;
  readonly snippet: string;
}

function redacted(content: string, matches: readonly DenylistMatch[]): string {
  let result = content;
  for (const match of matches) {
    result = `${result.slice(0, match.offset)}${REDACTION.repeat(match.length)}${result.slice(match.offset + match.length)}`;
  }
  return result;
}

function snippet(redactedContent: string, match: DenylistMatch): string {
  const start = Math.max(0, match.offset - SNIPPET_RADIUS);
  const end = Math.min(redactedContent.length, match.offset + match.length + SNIPPET_RADIUS);
  return redactedContent.slice(start, end).replace(/\s+/g, ' ').trim();
}

function findings(matcher: DenylistMatcher, subjects: readonly ScanSubject[]): readonly Finding[] {
  return subjects.flatMap((subject) => {
    const matches = matcher.findAll(subject.content);
    const redactedContent = redacted(subject.content, matches);
    return matches.map((match) => ({ subject: subject.label, match, snippet: snippet(redactedContent, match) }));
  });
}

function prePushSubjects(root: string): readonly ScanSubject[] {
  const lines = readFileSync(stdin.fd, UTF8).split('\n').filter(Boolean);
  return lines.flatMap((line) => {
    const [, localSha = '', , remoteSha = ''] = line.split(' ');
    return /^0+$/.test(localSha) ? [] : pushRangeSubjects(root, localSha, remoteSha);
  });
}

function subjectsFor(mode: string | undefined, argument: string | undefined, root: string): readonly ScanSubject[] | null {
  switch (mode) {
    case '--tree':
      return workingTreeSubjects(root);
    case '--staged':
      return stagedSubjects(root);
    case '--message':
      return argument === undefined ? null : [messageFileSubject(argument)];
    case '--history':
      return historySubjects(root, argument ?? null);
    case '--pre-push':
      return prePushSubjects(root);
    default:
      return null;
  }
}

function main(): number {
  const [, , mode, argument] = argv;
  const root = process.cwd();
  const denylist = loadDenylist(env, PATTERNS_PATH);
  if (denylist === null) {
    const required = env[REQUIRED_VARIABLE] === REQUIRED;
    stderr.write(`denylist: no patterns in ${PATTERNS_VARIABLE} or in tools/denylist/patterns.json; ${required ? 'this run requires them' : 'nothing scanned'}\n`);
    return required ? EXIT_NO_PATTERNS : EXIT_CLEAN;
  }
  const subjects = subjectsFor(mode, argument, root);
  if (subjects === null) {
    stderr.write(`${USAGE}\n`);
    return EXIT_USAGE;
  }
  const matcher = new DenylistMatcher(denylist);
  const found = findings(matcher, subjects);
  for (const finding of found) {
    stdout.write(`${finding.subject}:${finding.match.line}:${finding.match.column} denylisted ${finding.match.category} term: ${finding.snippet}\n`);
  }
  stderr.write(`denylist: ${subjects.length} subjects scanned, ${found.length} finding(s)\n`);
  return found.length === 0 ? EXIT_CLEAN : EXIT_FINDINGS;
}

exit(main());
