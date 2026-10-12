import type { CockpitSnapshot, RunView } from '../contract/index.ts';
import { shortSha } from './identifiers.ts';
import { paths } from './routes.ts';

export interface SubjectReference {
  readonly reference: string;
  /** The title of the subject, or null when the snapshot no longer holds it. */
  readonly title: string | null;
  readonly href: string | null;
}

/** What a run works on, with the address of its page when the subject is still in the snapshot. */
export function describeRunSubject(snapshot: Pick<CockpitSnapshot, 'projects'>, run: Pick<RunView, 'project' | 'subject'>): SubjectReference {
  const { subject, project: projectId } = run;
  const project = projectId === null ? undefined : snapshot.projects.find((candidate) => candidate.id === projectId);
  switch (subject.kind) {
    case 'issue': {
      const issue = project?.issues.find((entry) => String(entry.number) === subject.id);
      return {
        reference: `#${subject.id}`,
        title: issue?.title ?? null,
        href: project === undefined || issue === undefined ? null : paths.issue(project.id, issue.number),
      };
    }
    case 'request': {
      const request = project?.requests.find((entry) => entry.id === subject.id);
      return { reference: subject.id, title: request?.title ?? null, href: project === undefined || request === undefined ? null : paths.request(project.id, request.id) };
    }
    case 'audit': {
      const audit = project?.audits.find((entry) => entry.id === subject.id);
      return {
        reference: shortSha(audit?.commitSha ?? subject.id),
        title: audit?.commitMessage ?? null,
        href: project === undefined || audit === undefined ? null : paths.audit(project.id, audit.id),
      };
    }
    case 'release': {
      const release = project?.releases.find((entry) => entry.id === subject.id);
      return { reference: subject.id, title: release?.title ?? null, href: project === undefined || release === undefined ? null : paths.release(project.id, release.id) };
    }
  }
}
