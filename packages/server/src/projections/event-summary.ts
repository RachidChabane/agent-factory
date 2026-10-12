import type { FactoryEventRecord } from '@agent-factory/application';

type Fields = Readonly<Record<string, unknown>>;
type Summarizer = (subjectId: string, fields: Fields) => string;

const SUBJECT_SEPARATOR = '/';
const SHORT_SHA_LENGTH = 7;

function text(fields: Fields, key: string): string | null {
  const value = fields[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function number(fields: Fields, key: string): number | null {
  const value = fields[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function short(sha: string): string {
  return sha.slice(0, SHORT_SHA_LENGTH);
}

function issue(id: string): string {
  return `issue #${id}`;
}

/** One line per kind of event, for the cockpit's activity feed. */
const SUMMARIES: Readonly<Record<string, Summarizer>> = {
  'issue.transitioned': (id, fields) => `${issue(id)} moved to ${text(fields, 'to') ?? 'a new state'}`,
  'issue.spec-validated': (id, fields) => `the spec of ${issue(id)} was validated by ${text(fields, 'operator') ?? 'the operator'}`,
  'issue.paused': (id) => `${issue(id)} was paused`,
  'issue.unpaused': (id) => `${issue(id)} was resumed`,
  'pipeline.checks-frozen': (id) => `the acceptance checks of ${issue(id)} were frozen`,
  'pipeline.gate-completed': (id, fields) => `the gate of ${issue(id)} ${fields['passed'] === true ? 'passed' : 'ran'}`,
  'pipeline.review-completed': (id) => `the review of ${issue(id)} completed`,
  'pipeline.pull-request-opened': (id, fields) => `pull request #${number(fields, 'number') ?? '?'} opened for ${issue(id)}`,
  'pipeline.pull-request-merged': (id) => `the pull request of ${issue(id)} was merged`,
  'pipeline.external-feedback-received': (id) => `feedback arrived on the pull request of ${issue(id)}`,
  'pipeline.decision-answered': (id) => `the operator answered the question of ${issue(id)}`,
  'pipeline.check-rewrite-ordered': (id, fields) => `a rewrite of ${text(fields, 'path') ?? 'a check'} was ordered on ${issue(id)}`,
  'run.started': (_id, fields) => `${text(fields, 'role') ?? 'an agent'} run started on ${text(fields, 'model') ?? 'its model'}`,
  'run.finished': (_id, fields) => `an agent run ended: ${text(fields, 'outcome') ?? text(fields, 'status') ?? 'finished'}`,
  'request.received': (_id, fields) => `request received: ${text(fields, 'title') ?? 'untitled'}`,
  'request.challenge-requested': (id) => `a challenge of request ${id} was requested`,
  'request.challenge-started': (id) => `the challenge of request ${id} started`,
  'request.challenged': (id) => `request ${id} was challenged`,
  'request.challenge-failed': (id, fields) => `the challenge of request ${id} failed: ${text(fields, 'reason') ?? 'unknown reason'}`,
  'request.spec-updated': (id) => `a proposed spec of request ${id} was edited`,
  'request.issue-created': (id, fields) => `issue #${number(fields, 'issueNumber') ?? '?'} was created from request ${id}`,
  'request.declined': (id) => `request ${id} was declined`,
  'audit.detected': (id) => `change ${short(id)} reached the base branch outside the factory`,
  'audit.skipped': (id, fields) => `change ${short(id)} of ${text(fields, 'automation') ?? 'another automation'} was recorded without an audit`,
  'audit.started': (id) => `the audit of ${short(id)} started`,
  'audit.concluded': (id, fields) => `the audit of ${short(id)} concluded: ${text(fields, 'verdict') ?? 'done'}`,
  'audit.failed': (id) => `the audit of ${short(id)} failed`,
  'audit.issue.published': (id, fields) => `issue #${number(fields, 'issueNumber') ?? '?'} was opened from the audit of ${short(id)}`,
  'audit.resolved': (id) => `the audit of ${short(id)} was resolved`,
  'release.detected': (id, fields) => (text(fields, 'supersededBy') === null ? `release ${id} was detected` : `release ${id} is superseded by ${text(fields, 'supersededBy') ?? ''}`),
  'release.evaluated': (id, fields) => `release ${id} ${fields['promotable'] === true ? 'is promotable' : 'is blocked'}`,
  'release.cut': (id) => `release ${id} was cut`,
  'deployment.redeploy-dispatched': (id, fields) => `${id} redeploy of ${text(fields, 'version') ?? 'its version'} was dispatched`,
  'health.sampled': (id, fields) => `health check ${text(fields, 'check') ?? ''} of ${id} ${fields['ok'] === true ? 'passed' : 'failed'}`,
  'usage.read': (id) => `the subscription usage of ${id} was read`,
  'usage.read-failed': (id, fields) => `reading the usage of ${id} failed: ${text(fields, 'reason') ?? 'unknown reason'}`,
  'scheduler.paused': (_id, fields) => `scheduling paused: ${text(fields, 'reason') ?? text(fields, 'cause') ?? 'by the operator'}`,
  'scheduler.resumed': () => 'scheduling resumed',
  'settings.changed': (_id, fields) => `settings changed by ${text(fields, 'operator') ?? 'the operator'}`,
  'settings.configuration-reloaded': () => 'the configuration was reloaded',
  'settings.tool-checked': (_id, fields) => `${text(fields, 'tool') ?? 'a tool'} was checked: ${text(fields, 'status') ?? 'done'}`,
  'daemon.started': () => 'the factory started',
  'daemon.stopped': () => 'the factory stopped',
};

function subjectId(subject: string): string {
  const separator = subject.indexOf(SUBJECT_SEPARATOR);
  return separator === -1 ? subject : subject.slice(separator + 1);
}

function fieldsOf(payload: unknown): Fields {
  return typeof payload === 'object' && payload !== null ? (payload as Fields) : {};
}

/** A one-line description of an event, its subject being the one the project sees. */
export function summarizeEvent(record: Pick<FactoryEventRecord, 'type' | 'subject' | 'payload'>): string {
  const summarizer = SUMMARIES[record.type];
  if (summarizer === undefined) return `${record.type} on ${record.subject}`;
  return summarizer(subjectId(record.subject), fieldsOf(record.payload));
}
