import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { z } from 'zod';
import {
  COMMENTS_FILE_EXTENSION,
  DEPLOYMENTS_FILE_EXTENSION,
  FIRST_NUMBER,
  ISSUE_FILE_EXTENSION,
  JSON_INDENT,
  LOCAL_GITHUB_DIRECTORIES,
  PULL_REQUEST_BODY_EXTENSION,
  PULL_REQUEST_FILE_EXTENSION,
  SAFE_ENVIRONMENT_NAME,
  WORKFLOW_DISPATCH_FILE_EXTENSION,
} from './constants.ts';
import { LocalGitHubFileError } from './errors.ts';
import { parseFrontMatter, renderFrontMatter } from './frontMatter.ts';
import {
  CommentsFileSchema,
  DeploymentsFileSchema,
  IssueFrontMatterSchema,
  PullRequestFileSchema,
  WorkflowDispatchFileSchema,
  type CommentsFile,
  type DeploymentsFile,
  type WorkflowDispatchFile,
  type IssueFrontMatter,
  type PullRequestFile,
} from './schemas.ts';

const UTF8 = 'utf8';
const MISSING_FILE_CODE = 'ENOENT';
const TEMPORARY_SUFFIX = '.tmp';
const NUMBERED_FILE = /^([1-9]\d*)\.(md|json)$/;

export interface IssueDraft {
  readonly number: number;
  readonly frontMatter: IssueFrontMatter;
  readonly body: string;
}

export interface LocalIssue extends IssueDraft {
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === MISSING_FILE_CODE;
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, UTF8);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function writeAtomically(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}${TEMPORARY_SUFFIX}`;
  await writeFile(temporary, content);
  await rename(temporary, path);
}

function parseWith<S extends z.ZodType>(schema: S, value: unknown, path: string): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new LocalGitHubFileError(path, parsed.error);
  return parsed.data;
}

function parseJsonFile<S extends z.ZodType>(schema: S, text: string, path: string): z.infer<S> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new LocalGitHubFileError(path, error);
  }
  return parseWith(schema, json, path);
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, JSON_INDENT)}\n`;
}

export class LocalGitHubFiles {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  issuePath(number: number): string {
    return join(this.root, LOCAL_GITHUB_DIRECTORIES.issues, `${number}${ISSUE_FILE_EXTENSION}`);
  }

  pullRequestPath(number: number): string {
    return join(this.root, LOCAL_GITHUB_DIRECTORIES.pulls, `${number}${PULL_REQUEST_FILE_EXTENSION}`);
  }

  pullRequestBodyPath(number: number): string {
    return join(this.root, LOCAL_GITHUB_DIRECTORIES.pulls, `${number}${PULL_REQUEST_BODY_EXTENSION}`);
  }

  commentsPath(number: number): string {
    return join(this.root, LOCAL_GITHUB_DIRECTORIES.comments, `${number}${COMMENTS_FILE_EXTENSION}`);
  }

  async readIssue(number: number): Promise<LocalIssue | null> {
    const path = this.issuePath(number);
    const text = await readOptional(path);
    if (text === null) return null;
    let document: ReturnType<typeof parseFrontMatter>;
    try {
      document = parseFrontMatter(text);
    } catch (error) {
      throw new LocalGitHubFileError(path, error);
    }
    const frontMatter = parseWith(IssueFrontMatterSchema, document.data, path);
    const { mtime } = await stat(path);
    return {
      number,
      frontMatter,
      body: document.body,
      createdAt: frontMatter.createdAt === undefined ? mtime : new Date(frontMatter.createdAt),
      updatedAt: frontMatter.updatedAt === undefined ? mtime : new Date(frontMatter.updatedAt),
    };
  }

  async writeIssue(issue: IssueDraft): Promise<void> {
    await writeAtomically(this.issuePath(issue.number), renderFrontMatter(issue.frontMatter, issue.body));
  }

  async issues(): Promise<readonly LocalIssue[]> {
    const numbers = await this.numbersIn(LOCAL_GITHUB_DIRECTORIES.issues, ISSUE_FILE_EXTENSION);
    const issues = await Promise.all(numbers.map((number) => this.readIssue(number)));
    return issues.filter((issue) => issue !== null);
  }

  async readPullRequest(number: number): Promise<PullRequestFile | null> {
    const path = this.pullRequestPath(number);
    const text = await readOptional(path);
    return text === null ? null : parseJsonFile(PullRequestFileSchema, text, path);
  }

  async readPullRequestBody(number: number): Promise<string> {
    return (await readOptional(this.pullRequestBodyPath(number))) ?? '';
  }

  async writePullRequest(pullRequest: PullRequestFile): Promise<void> {
    await writeAtomically(this.pullRequestPath(pullRequest.number), json(pullRequest));
  }

  async writePullRequestBody(number: number, body: string): Promise<void> {
    await writeAtomically(this.pullRequestBodyPath(number), body);
  }

  async pullRequests(): Promise<readonly PullRequestFile[]> {
    const numbers = await this.numbersIn(LOCAL_GITHUB_DIRECTORIES.pulls, PULL_REQUEST_FILE_EXTENSION);
    const pulls = await Promise.all(numbers.map((number) => this.readPullRequest(number)));
    return pulls.filter((pull) => pull !== null);
  }

  async readComments(number: number): Promise<CommentsFile> {
    const path = this.commentsPath(number);
    const text = await readOptional(path);
    return text === null ? [] : parseJsonFile(CommentsFileSchema, text, path);
  }

  async writeComments(number: number, comments: CommentsFile): Promise<void> {
    await writeAtomically(this.commentsPath(number), json(comments));
  }

  deploymentsPath(environment: string): string {
    if (!SAFE_ENVIRONMENT_NAME.test(environment)) throw new LocalGitHubFileError(environment, new Error('not a safe environment name'));
    return join(this.root, LOCAL_GITHUB_DIRECTORIES.deployments, `${environment}${DEPLOYMENTS_FILE_EXTENSION}`);
  }

  workflowDispatchPath(number: number): string {
    return join(this.root, LOCAL_GITHUB_DIRECTORIES.workflowDispatches, `${number}${WORKFLOW_DISPATCH_FILE_EXTENSION}`);
  }

  async readDeployments(environment: string): Promise<DeploymentsFile> {
    const path = this.deploymentsPath(environment);
    const text = await readOptional(path);
    return text === null ? [] : parseJsonFile(DeploymentsFileSchema, text, path);
  }

  async writeDeployments(environment: string, deployments: DeploymentsFile): Promise<void> {
    await writeAtomically(this.deploymentsPath(environment), json(deployments));
  }

  async recordWorkflowDispatch(dispatch: Omit<WorkflowDispatchFile, 'number'>): Promise<WorkflowDispatchFile> {
    const numbers = await this.numbersIn(LOCAL_GITHUB_DIRECTORIES.workflowDispatches, WORKFLOW_DISPATCH_FILE_EXTENSION);
    const record = parseWith(WorkflowDispatchFileSchema, { number: (numbers.at(-1) ?? 0) + 1, ...dispatch }, LOCAL_GITHUB_DIRECTORIES.workflowDispatches);
    await writeAtomically(this.workflowDispatchPath(record.number), json(record));
    return record;
  }

  async workflowDispatches(): Promise<readonly WorkflowDispatchFile[]> {
    const numbers = await this.numbersIn(LOCAL_GITHUB_DIRECTORIES.workflowDispatches, WORKFLOW_DISPATCH_FILE_EXTENSION);
    return Promise.all(
      numbers.map(async (number) => {
        const path = this.workflowDispatchPath(number);
        return parseJsonFile(WorkflowDispatchFileSchema, (await readOptional(path)) ?? '', path);
      }),
    );
  }

  async nextNumber(): Promise<number> {
    const taken = [
      ...(await this.numbersIn(LOCAL_GITHUB_DIRECTORIES.issues, ISSUE_FILE_EXTENSION)),
      ...(await this.numbersIn(LOCAL_GITHUB_DIRECTORIES.pulls, PULL_REQUEST_FILE_EXTENSION)),
    ];
    return taken.length === 0 ? FIRST_NUMBER : Math.max(...taken) + 1;
  }

  private async numbersIn(directory: string, extension: string): Promise<readonly number[]> {
    let names: readonly string[];
    try {
      names = await readdir(join(this.root, directory));
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    return names
      .filter((name) => name.endsWith(extension))
      .flatMap((name) => {
        const match = NUMBERED_FILE.exec(name);
        return match?.[1] === undefined ? [] : [Number(match[1])];
      })
      .sort((a, b) => a - b);
  }
}
