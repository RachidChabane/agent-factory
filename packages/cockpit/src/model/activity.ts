import { paths } from './routes.ts';

interface SubjectRoute {
  readonly prefix: string;
  readonly href: (project: string | null, rest: string) => string | null;
}

function numeric(rest: string): number | null {
  const value = Number(rest);
  return Number.isInteger(value) && value > 0 ? value : null;
}

const SUBJECT_ROUTES: readonly SubjectRoute[] = [
  {
    prefix: 'issue/',
    href: (project, rest) => {
      const number = numeric(rest);
      return project === null || number === null ? null : paths.issue(project, number);
    },
  },
  {
    prefix: 'pr/',
    href: (project, rest) => {
      const number = numeric(rest);
      return project === null || number === null ? null : paths.pullRequest(project, number);
    },
  },
  { prefix: 'release/', href: (project, rest) => (project === null ? null : paths.release(project, decodeURIComponent(rest))) },
  { prefix: 'audit/', href: (project, rest) => (project === null ? null : paths.audit(project, decodeURIComponent(rest))) },
  { prefix: 'request/', href: (project, rest) => (project === null ? null : paths.request(project, decodeURIComponent(rest))) },
  { prefix: 'run/', href: (_project, rest) => paths.run(decodeURIComponent(rest)) },
  { prefix: 'deployment/', href: (project) => (project === null ? null : paths.delivery(project)) },
  { prefix: 'health/', href: (project) => (project === null ? null : paths.delivery(project)) },
];

/** The page an event's subject points at, or null when the subject has no page of its own. */
export function subjectHref(project: string | null, subject: string): string | null {
  const route = SUBJECT_ROUTES.find((candidate) => subject.startsWith(candidate.prefix));
  return route === undefined ? null : route.href(project, subject.slice(route.prefix.length));
}
