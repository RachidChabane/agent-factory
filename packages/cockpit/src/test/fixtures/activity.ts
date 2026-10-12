import type { InstallationInfo, ProjectView, RunView, StreamEvent, ToolView, UsageView } from '../../contract/index.ts';
import { seededRandom } from './time.ts';

interface Source {
  readonly installation: InstallationInfo;
  readonly projects: readonly ProjectView[];
  readonly runs: readonly RunView[];
  readonly tools: readonly ToolView[];
  readonly usage: UsageView;
}

interface Moment {
  readonly at: string;
  readonly project: string | null;
  readonly type: string;
  readonly subject: string;
  readonly summary: string;
}

const MAX_SEQUENCE_GAP = 4;
const ACTIVITY_SEED = 1_842;
const SHORT_SHA_LENGTH = 7;
const REMOTE_ACCESS_TOOL = 'tailscale';
const PERSONAL = 'personal';

function required<Value>(value: Value | undefined, what: string): Value {
  if (value === undefined) throw new Error(`the world has no ${what}`);
  return value;
}

function short(sha: string): string {
  return sha.slice(0, SHORT_SHA_LENGTH);
}

function projectOf(source: Source, id: string): ProjectView {
  return required(
    source.projects.find((project) => project.id === id),
    `project ${id}`,
  );
}

/** The moments of the installation that the activity feed tells, each read from the entity it is about. */
function moments(source: Source): Moment[] {
  const storefront = projectOf(source, 'storefront');
  const ledger = projectOf(source, 'ledger');
  const run = (id: string) => required(source.runs.find((candidate) => candidate.id === id), `run ${id}`);
  const request = (project: ProjectView, id: string) => required(project.requests.find((candidate) => candidate.id === id), `request ${id}`);
  const issue = (project: ProjectView, number: number) => required(project.issues.find((candidate) => candidate.number === number), `issue ${number}`);
  const pull = (project: ProjectView, number: number) => required(project.pullRequests.find((candidate) => candidate.number === number), `pull request ${number}`);
  const audit = (project: ProjectView, matches: (candidate: ProjectView['audits'][number]) => boolean) => required(project.audits.find(matches), 'audit');
  const release = (project: ProjectView, id: string) => required(project.releases.find((candidate) => candidate.id === id), `release ${id}`);

  const received = (project: ProjectView, id: string): Moment => {
    const entry = request(project, id);
    return { at: entry.receivedAt, project: project.id, type: 'request.received', subject: `request/${id}`, summary: `Request ${id} received: ${entry.title}` };
  };
  const transitioned = (project: ProjectView, number: number): Moment => {
    const entry = issue(project, number);
    return { at: entry.updatedAt, project: project.id, type: 'issue.transitioned', subject: `issue/${number}`, summary: `Issue #${number} moved to ${entry.state}` };
  };
  const merged = (project: ProjectView, number: number): Moment => {
    const entry = pull(project, number);
    return {
      at: required(entry.mergedAt ?? undefined, `merge time of pull request ${number}`),
      project: project.id,
      type: 'pipeline.pull-request-merged',
      subject: `issue/${entry.issueNumber}`,
      summary: `The pull request of issue #${entry.issueNumber} was merged`,
    };
  };
  const opened = (project: ProjectView, number: number): Moment => {
    const entry = pull(project, number);
    return { at: entry.openedAt, project: project.id, type: 'pipeline.pull-request-opened', subject: `issue/${entry.issueNumber}`, summary: `Pull request #${number} opened for issue #${entry.issueNumber}` };
  };
  const detected = (project: ProjectView, matches: (candidate: ProjectView['audits'][number]) => boolean): Moment => {
    const entry = audit(project, matches);
    const summary = entry.reason === 'on-demand' ? `Audit of change ${short(entry.commitSha)} requested by ${source.installation.operator}` : `Change ${short(entry.commitSha)} reached the base branch outside the factory`;
    return { at: entry.detectedAt, project: project.id, type: 'audit.detected', subject: `audit/${entry.id}`, summary };
  };
  const started = (id: string): Moment => {
    const entry = run(id);
    return { at: entry.startedAt, project: entry.project, type: 'run.started', subject: `run/${id}`, summary: `Run ${id} started: ${entry.role} on issue #${entry.subject.id}` };
  };
  const finished = (id: string): Moment => {
    const entry = run(id);
    return { at: required(entry.endedAt ?? undefined, `end of run ${id}`), project: entry.project, type: 'run.finished', subject: `run/${id}`, summary: `Run ${id} finished: ${entry.outcome ?? entry.status}` };
  };
  const challenged = (project: ProjectView, id: string): Moment => {
    const report = required(request(project, id).challenge ?? undefined, `challenge of ${id}`);
    return { at: report.completedAt, project: project.id, type: 'request.challenged', subject: `request/${id}`, summary: `Request ${id} was challenged` };
  };
  const challengeFailed = (project: ProjectView, id: string): Moment => {
    const failure = required(request(project, id).lastChallengeFailure ?? undefined, `challenge failure of ${id}`);
    return { at: failure.at, project: project.id, type: 'request.challenge-failed', subject: `request/${id}`, summary: `The challenge of request ${id} failed` };
  };
  const releaseDetected = (id: string): Moment => {
    const entry = release(storefront, id);
    return { at: entry.detectedAt, project: storefront.id, type: 'release.detected', subject: `release/${id}`, summary: `Release ${id} was detected` };
  };
  const releaseEvaluated = (id: string): Moment => {
    const entry = release(storefront, id);
    return {
      at: required(entry.gate.evaluatedAt ?? undefined, `evaluation of release ${id}`),
      project: storefront.id,
      type: 'release.evaluated',
      subject: `release/${id}`,
      summary: `Release ${id} ${entry.gate.promotable ? 'is promotable' : 'is blocked'}`,
    };
  };
  const installationPause = required(source.installation.pauses[0], 'installation pause');
  const ledgerPause = required(ledger.pauses[0], 'ledger pause');
  const remoteAccess = required(source.tools.find((tool) => tool.name === REMOTE_ACCESS_TOOL), 'remote access tool');
  const personal = required(source.usage.accounts.find((account) => account.name === PERSONAL), 'personal account');
  const awaiting = run('run_5d0911');
  const byDirectPush = (candidate: ProjectView['audits'][number]) => candidate.reason === 'direct-push';
  const byBot = (candidate: ProjectView['audits'][number]) => candidate.reason === 'bot-author';
  const onDemand = (candidate: ProjectView['audits'][number]) => candidate.reason === 'on-demand' && candidate.state === 'detected';
  return [
    { at: required(personal.readAt ?? undefined, 'usage reading'), project: null, type: 'usage.read', subject: `usage/${PERSONAL}`, summary: `Subscription usage of ${PERSONAL} was read` },
    received(storefront, 'R-13'),
    started('run_7f3a2c'),
    transitioned(storefront, 45),
    detected(storefront, onDemand),
    finished(awaiting.id),
    transitioned(storefront, 49),
    { at: installationPause.since, project: null, type: 'scheduler.paused', subject: 'scheduler', summary: `Scheduling paused: ${installationPause.reason}` },
    merged(storefront, 44),
    transitioned(storefront, 41),
    finished('run_1c7d84'),
    challengeFailed(storefront, 'R-18'),
    detected(storefront, byBot),
    received(storefront, 'R-18'),
    received(ledger, 'R-13'),
    merged(storefront, 39),
    { at: ledgerPause.since, project: ledger.id, type: 'scheduler.paused', subject: 'scheduler', summary: `Scheduling paused by ${source.installation.operator}` },
    releaseDetected('1.8.3'),
    opened(storefront, 62),
    merged(storefront, 34),
    challenged(storefront, 'R-15'),
    merged(ledger, 18),
    { at: required(remoteAccess.checkedAt ?? undefined, 'remote access check'), project: null, type: 'settings.tool-checked', subject: 'settings', summary: `${REMOTE_ACCESS_TOOL} was checked: ${remoteAccess.status ?? 'done'}` },
    releaseEvaluated('1.8.2'),
    merged(storefront, 29),
    detected(storefront, byDirectPush),
    opened(ledger, 22),
    challenged(storefront, 'R-16'),
    finished('run_43c6f8'),
  ];
}

/** The latest events of the installation, newest first, numbered below the sequence of the snapshot. */
export function activityFeed(source: Source, snapshotSequence: number): StreamEvent[] {
  const random = seededRandom(ACTIVITY_SEED);
  let sequence = snapshotSequence;
  return moments(source)
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
    .map((moment) => {
      sequence -= 1 + Math.floor(random() * MAX_SEQUENCE_GAP);
      return { sequence, occurredAt: moment.at, type: moment.type, project: moment.project, subject: moment.subject, summary: moment.summary };
    });
}
