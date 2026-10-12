import type { EventStore, FactoryEventRecord } from '../ports.ts';

/** Subjects of a project's events start with this segment, then the project id and a separator. */
export const PROJECT_SUBJECT_SEGMENT = 'project';
const SEPARATOR = '/';

export function projectSubjectPrefix(projectId: string): string {
  return `${PROJECT_SUBJECT_SEGMENT}${SEPARATOR}${projectId}${SEPARATOR}`;
}

export interface ProjectSubject {
  readonly project: string | null;
  readonly subject: string;
}

/** Splits a stored subject into its project (null for installation-level events) and the subject the project sees. */
export function parseProjectSubject(stored: string): ProjectSubject {
  const head = `${PROJECT_SUBJECT_SEGMENT}${SEPARATOR}`;
  if (!stored.startsWith(head)) return { project: null, subject: stored };
  const rest = stored.slice(head.length);
  const end = rest.indexOf(SEPARATOR);
  return end === -1 ? { project: null, subject: stored } : { project: rest.slice(0, end), subject: rest.slice(end + SEPARATOR.length) };
}

/**
 * The installation's event log as one project sees it: its events are stored under
 * `project/<id>/<subject>`, it reads and hears only its own, and every record keeps the
 * global sequence number of the log.
 */
export class ProjectEventStore implements EventStore {
  private readonly inner: EventStore;
  private readonly prefix: string;

  constructor(inner: EventStore, projectId: string) {
    this.inner = inner;
    this.prefix = projectSubjectPrefix(projectId);
  }

  async append(type: string, subject: string, payload: unknown): Promise<FactoryEventRecord> {
    return this.local(await this.inner.append(type, `${this.prefix}${subject}`, payload));
  }

  async read(subjectPrefix: string, afterSequence: number): Promise<readonly FactoryEventRecord[]> {
    const records = await this.inner.read(`${this.prefix}${subjectPrefix}`, afterSequence);
    return records.map((record) => this.local(record));
  }

  subscribe(listener: (event: FactoryEventRecord) => void): () => void {
    return this.inner.subscribe((record) => {
      if (record.subject.startsWith(this.prefix)) listener(this.local(record));
    });
  }

  private local(record: FactoryEventRecord): FactoryEventRecord {
    return { ...record, subject: record.subject.slice(this.prefix.length) };
  }
}
