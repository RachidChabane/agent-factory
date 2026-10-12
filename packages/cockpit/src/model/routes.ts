export const VIEW_IDS = [
  'board',
  'requests',
  'issues',
  'runs',
  'pull-requests',
  'ci',
  'releases',
  'audits',
  'health',
  'costs',
  'knowledge',
  'settings',
] as const;
export type ViewId = (typeof VIEW_IDS)[number];

export const VIEW_PATHS: Readonly<Record<ViewId, string>> = {
  board: '/',
  requests: '/requests',
  issues: '/issues',
  runs: '/runs',
  'pull-requests': '/pull-requests',
  ci: '/ci',
  releases: '/releases',
  audits: '/audits',
  health: '/health',
  costs: '/costs',
  knowledge: '/knowledge',
  settings: '/settings',
};

export const VIEW_TITLES: Readonly<Record<ViewId, string>> = {
  board: 'Tableau',
  requests: 'Demandes',
  issues: 'Issues',
  runs: 'Runs',
  'pull-requests': 'Pull requests',
  ci: 'CI & déploiements',
  releases: 'Releases',
  audits: 'Audits',
  health: 'Santé',
  costs: 'Coûts',
  knowledge: 'Connaissances',
  settings: 'Réglages',
};

export const ISSUE_GRAPH_QUERY = 'vue';
export const ISSUE_GRAPH_VALUE = 'graphe';

export const paths = {
  request: (id: string): string => `${VIEW_PATHS.requests}/${encodeURIComponent(id)}`,
  issue: (number: number): string => `${VIEW_PATHS.issues}/${number}`,
  issueGraph: (): string => `${VIEW_PATHS.issues}?${ISSUE_GRAPH_QUERY}=${ISSUE_GRAPH_VALUE}`,
  run: (id: string): string => `${VIEW_PATHS.runs}/${encodeURIComponent(id)}`,
  pullRequest: (number: number): string => `${VIEW_PATHS['pull-requests']}/${number}`,
  release: (id: string): string => `${VIEW_PATHS.releases}/${encodeURIComponent(id)}`,
  audit: (id: string): string => `${VIEW_PATHS.audits}/${encodeURIComponent(id)}`,
} as const;
