import {
  API_STATE_PATH,
  CockpitSnapshotSchema,
  COMMAND_TOKEN_HEADER,
  COMMAND_TOKEN_META_NAME,
  commandPath,
  type CockpitSnapshot,
  type CommandBody,
  type CommandName,
  type IssueView,
  type ProjectView,
  type PullRequestView,
  type RequestView,
  type RunView,
} from '../../packages/cockpit/src/contract/index.ts';
import { describeActivity } from './activity-report.ts';

const POLL_INTERVAL_MS = 500;
const DEFAULT_WAIT_MS = 60_000;
const JSON_CONTENT_TYPE = 'application/json';
const TOKEN_PATTERN = new RegExp(`<meta name="${COMMAND_TOKEN_META_NAME}" content="([0-9a-f]+)">`);

export interface WaitOptions {
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
}

export interface CommandReply {
  readonly status: number;
  readonly body: unknown;
}

/** The factory's own answer to the cockpit's questions, read the way the cockpit reads it, to check what a click changed. */
export class FactoryApi {
  private readonly origin: string;
  private token: string | null = null;

  constructor(origin: string) {
    this.origin = origin;
  }

  /** The address the cockpit is served at. */
  get originUrl(): string {
    return this.origin;
  }

  /** The snapshot, validated against the contract: a field the cockpit could not read fails here too. */
  async state(): Promise<CockpitSnapshot> {
    const response = await fetch(`${this.origin}${API_STATE_PATH}`, { headers: { accept: JSON_CONTENT_TYPE } });
    if (!response.ok) throw new Error(`GET ${API_STATE_PATH} answered ${response.status}`);
    return CockpitSnapshotSchema.parse(await response.json());
  }

  /** Polls the snapshot until the predicate holds; fails with the description of what never happened and of what the factory was doing instead. */
  async until(description: string, predicate: (state: CockpitSnapshot) => boolean, options: WaitOptions = {}): Promise<CockpitSnapshot> {
    const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_WAIT_MS);
    for (;;) {
      const state = await this.state();
      if (predicate(state)) return state;
      if (Date.now() > deadline) throw new Error(`the factory never reached: ${description}\n${describeActivity(state)}`);
      await new Promise((resolve) => setTimeout(resolve, options.intervalMs ?? POLL_INTERVAL_MS));
    }
  }

  /** Sends a command the way the cockpit does; for setting a scene up, not for the clicks a spec proves. */
  async command<Name extends CommandName>(name: Name, body: CommandBody<Name>): Promise<CommandReply> {
    const response = await fetch(`${this.origin}${commandPath(name)}`, {
      method: 'POST',
      headers: { 'content-type': JSON_CONTENT_TYPE, [COMMAND_TOKEN_HEADER]: await this.commandToken() },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }

  private async commandToken(): Promise<string> {
    if (this.token !== null) return this.token;
    const page = await (await fetch(`${this.origin}/`)).text();
    const token = TOKEN_PATTERN.exec(page)?.[1];
    if (token === undefined) throw new Error('the cockpit page carries no command token');
    this.token = token;
    return token;
  }
}

function required<Value>(value: Value | undefined, what: string): Value {
  if (value === undefined) throw new Error(`the snapshot has no ${what}`);
  return value;
}

export function projectOf(state: CockpitSnapshot, id: string): ProjectView {
  return required(state.projects.find((project) => project.id === id), `project ${id}`);
}

export function issueOf(state: CockpitSnapshot, project: string, number: number): IssueView {
  return required(projectOf(state, project).issues.find((issue) => issue.number === number), `issue #${number} of ${project}`);
}

export function issueTitled(state: CockpitSnapshot, project: string, title: string): IssueView | undefined {
  return projectOf(state, project).issues.find((issue) => issue.title === title);
}

export function pullRequestOf(state: CockpitSnapshot, project: string, number: number): PullRequestView {
  return required(projectOf(state, project).pullRequests.find((pullRequest) => pullRequest.number === number), `pull request #${number} of ${project}`);
}

export function requestOf(state: CockpitSnapshot, project: string, id: string): RequestView {
  return required(projectOf(state, project).requests.find((request) => request.id === id), `request ${id} of ${project}`);
}

export function requestTitled(state: CockpitSnapshot, project: string, title: string): RequestView | undefined {
  return projectOf(state, project).requests.find((request) => request.title === title);
}

export function runsOfIssue(state: CockpitSnapshot, project: string, number: number): readonly RunView[] {
  return state.runs.filter((run) => run.project === project && run.subject.kind === 'issue' && run.subject.id === String(number));
}
