import type { CockpitSnapshot, RunSubject } from '../contract/index.ts';
import { commitReference } from '../format/format.ts';
import { paths } from './routes.ts';

export interface SubjectReference {
  readonly reference: string;
  readonly title: string;
  readonly href: string | null;
}

export function describeSubject(snapshot: CockpitSnapshot, subject: RunSubject): SubjectReference {
  switch (subject.kind) {
    case 'issue': {
      const number = Number(subject.id);
      const issue = snapshot.issues.find((entry) => entry.number === number);
      return { reference: `#${subject.id}`, title: issue?.title ?? `Issue #${subject.id}`, href: issue === undefined ? null : paths.issue(number) };
    }
    case 'request': {
      const request = snapshot.requests.find((entry) => entry.id === subject.id);
      return { reference: subject.id, title: request?.title ?? subject.id, href: request === undefined ? null : paths.request(subject.id) };
    }
    case 'audit': {
      const audit = snapshot.audits.find((entry) => entry.id === subject.id);
      return { reference: commitReference(subject.id), title: audit?.commitMessage ?? subject.id, href: audit === undefined ? null : paths.audit(subject.id) };
    }
    case 'release': {
      const release = snapshot.releases.find((entry) => entry.id === subject.id);
      return { reference: subject.id, title: `Release ${subject.id}`, href: release === undefined ? null : paths.release(subject.id) };
    }
  }
}
