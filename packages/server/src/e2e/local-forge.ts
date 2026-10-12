import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CHECKS_DIRECTORY } from '@agent-factory/adapters';
import { parse } from 'yaml';
import { z } from 'zod';
import { ExpectationFailed } from './expectations.ts';

const ISSUES_DIRECTORY = 'issues';
const PULL_REQUESTS_DIRECTORY = 'pulls';
const ISSUE_EXTENSION = '.md';
const RECORD_EXTENSION = '.json';
const LOG_EXTENSION = '.log';
const MISSING_FILE_CODE = 'ENOENT';
const UTF8 = 'utf8';
const FRONT_MATTER_OPENING = '---\n';
const FRONT_MATTER_CLOSING = '\n---\n';

const PositiveInteger = z.number().int().positive();

const PullRequestSchema = z.object({
  number: PositiveInteger,
  title: z.string().min(1),
  head: z.string().min(1),
  base: z.string().min(1),
  state: z.enum(['open', 'merged', 'closed']),
  closes: z.array(PositiveInteger),
  mergeSha: z.string().min(1).nullable(),
});

const IssueSchema = z.object({
  title: z.string().min(1),
  state: z.enum(['open', 'closed']),
  labels: z.array(z.string()),
});

const GateOutcomeSchema = z.object({
  sha: z.string().min(1),
  steps: z.array(z.object({ name: z.string().min(1), passed: z.boolean() })),
});

/** A pull request as the local forge records it; `head` is the name of its branch. */
export type ForgePullRequest = z.infer<typeof PullRequestSchema>;
export type ForgeIssue = z.infer<typeof IssueSchema>;
/** The checks of one commit once its gate has run: one step per gate command. */
export type GateOutcome = z.infer<typeof GateOutcomeSchema>;

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === MISSING_FILE_CODE;
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, UTF8);
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

async function readRequired(path: string): Promise<string> {
  const text = await readOptional(path);
  if (text === null) throw new ExpectationFailed(`the local forge has the file ${path}`, 'a file', 'no such file');
  return text;
}

function parseRecord<S extends z.ZodType>(schema: S, value: unknown, path: string): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ExpectationFailed(`${path} is a record of the local forge`, 'a record with the fields of its kind', parsed.error.message);
  return parsed.data;
}

function frontMatterOf(text: string, path: string): unknown {
  const closing = text.startsWith(FRONT_MATTER_OPENING) ? text.indexOf(FRONT_MATTER_CLOSING, FRONT_MATTER_OPENING.length - 1) : -1;
  if (closing === -1) throw new ExpectationFailed(`${path} is an issue of the local forge`, 'a front matter block between "---" lines', text);
  return parse(text.slice(FRONT_MATTER_OPENING.length, closing + 1));
}

/** Reads the records of a local forge from its directory, as someone looking at the files would. */
export class LocalForge {
  private readonly directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  async pullRequest(number: number): Promise<ForgePullRequest> {
    const path = join(this.directory, PULL_REQUESTS_DIRECTORY, `${number}${RECORD_EXTENSION}`);
    return parseRecord(PullRequestSchema, JSON.parse(await readRequired(path)), path);
  }

  async issue(number: number): Promise<ForgeIssue> {
    const path = join(this.directory, ISSUES_DIRECTORY, `${number}${ISSUE_EXTENSION}`);
    return parseRecord(IssueSchema, frontMatterOf(await readRequired(path), path), path);
  }

  /** What the gate of a commit found, or null while the forge holds no complete record of it. */
  async gateOutcome(sha: string): Promise<GateOutcome | null> {
    const path = join(this.directory, CHECKS_DIRECTORY, `${sha}${RECORD_EXTENSION}`);
    const text = await readOptional(path);
    if (text === null) return null;
    try {
      return parseRecord(GateOutcomeSchema, JSON.parse(text), path);
    } catch (error) {
      if (error instanceof SyntaxError) return null;
      throw error;
    }
  }

  /** What the gate of a commit printed, or null when it has not run. */
  gateLog(sha: string): Promise<string | null> {
    return readOptional(join(this.directory, CHECKS_DIRECTORY, `${sha}${LOG_EXTENSION}`));
  }
}
