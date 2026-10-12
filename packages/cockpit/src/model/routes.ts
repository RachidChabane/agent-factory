export const PROJECT_SECTIONS = ['requests', 'issues', 'pull-requests', 'delivery', 'releases', 'audits', 'knowledge', 'settings'] as const;
export type ProjectSection = (typeof PROJECT_SECTIONS)[number];

export const PROJECT_QUERY_PARAMETER = 'project';
export const ISSUE_VIEW_QUERY_PARAMETER = 'view';
export const ISSUE_GRAPH_VIEW = 'graph';
export const NEW_REQUEST_QUERY_PARAMETER = 'new';
export const MERGE_QUERY_PARAMETER = 'merge';
export const QUERY_FLAG = '1';

/** The route patterns of the router, the single place where the URL space of the cockpit is declared. */
export const ROUTE_PATTERNS = {
  changes: '/',
  board: '/board',
  project: '/projects/:project',
  requests: 'requests',
  request: 'requests/:requestId',
  issues: 'issues',
  issue: 'issues/:issueNumber',
  pullRequests: 'pull-requests',
  pullRequest: 'pull-requests/:number',
  delivery: 'delivery',
  releases: 'releases',
  release: 'releases/:releaseId',
  audits: 'audits',
  audit: 'audits/:auditId',
  knowledge: 'knowledge',
  projectSettings: 'settings',
  runs: '/runs',
  run: '/runs/:runId',
  usage: '/usage',
  settings: '/settings',
} as const;

const BOARD_PATH = '/board';
const encode = encodeURIComponent;

function projectPath(project: string): string {
  return `/projects/${encode(project)}`;
}

function sectionPath(project: string, section: ProjectSection): string {
  return `${projectPath(project)}/${section}`;
}

function withQuery(path: string, name: string, value: string): string {
  return `${path}?${name}=${encode(value)}`;
}

/** Every address the cockpit links to. Notification links rely on the project sub-paths below. */
export const paths = {
  /** The landing page: what changed since the operator last looked. */
  changes: (project?: string | null): string => (project == null ? '/' : withQuery('/', PROJECT_QUERY_PARAMETER, project)),
  board: (project?: string | null): string => (project == null ? BOARD_PATH : withQuery(BOARD_PATH, PROJECT_QUERY_PARAMETER, project)),
  runs: (project?: string | null): string => (project == null ? '/runs' : withQuery('/runs', PROJECT_QUERY_PARAMETER, project)),
  run: (runId: string): string => `/runs/${encode(runId)}`,
  usage: (): string => '/usage',
  settings: (): string => '/settings',
  project: projectPath,
  section: sectionPath,
  requests: (project: string): string => sectionPath(project, 'requests'),
  request: (project: string, requestId: string): string => `${sectionPath(project, 'requests')}/${encode(requestId)}`,
  newRequest: (project: string): string => withQuery(sectionPath(project, 'requests'), NEW_REQUEST_QUERY_PARAMETER, QUERY_FLAG),
  issues: (project: string): string => sectionPath(project, 'issues'),
  issue: (project: string, issueNumber: number): string => `${sectionPath(project, 'issues')}/${issueNumber}`,
  issueGraph: (project: string): string => withQuery(sectionPath(project, 'issues'), ISSUE_VIEW_QUERY_PARAMETER, ISSUE_GRAPH_VIEW),
  pullRequests: (project: string): string => sectionPath(project, 'pull-requests'),
  pullRequest: (project: string, number: number): string => `${sectionPath(project, 'pull-requests')}/${number}`,
  /** The pull request with the confirmation of its merge already open. */
  mergePullRequest: (project: string, number: number): string => withQuery(`${sectionPath(project, 'pull-requests')}/${number}`, MERGE_QUERY_PARAMETER, QUERY_FLAG),
  delivery: (project: string): string => sectionPath(project, 'delivery'),
  releases: (project: string): string => sectionPath(project, 'releases'),
  release: (project: string, releaseId: string): string => `${sectionPath(project, 'releases')}/${encode(releaseId)}`,
  audits: (project: string): string => sectionPath(project, 'audits'),
  audit: (project: string, auditId: string): string => `${sectionPath(project, 'audits')}/${encode(auditId)}`,
  knowledge: (project: string): string => sectionPath(project, 'knowledge'),
  projectSettings: (project: string): string => sectionPath(project, 'settings'),
} as const;

const PROJECT_PREFIX = /^\/projects\/([^/]+)/;

/** The project a pathname belongs to, or null on an installation-wide page. */
export function projectOfPath(pathname: string): string | null {
  const match = PROJECT_PREFIX.exec(pathname);
  return match?.[1] === undefined ? null : decodeURIComponent(match[1]);
}

/** The section of a project pathname (`issues` for `/projects/store/issues/12`), or null on the overview. */
export function sectionOfPath(pathname: string): ProjectSection | null {
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  const [root, , section] = segments;
  return root === 'projects' ? (PROJECT_SECTIONS.find((candidate) => candidate === section) ?? null) : null;
}
