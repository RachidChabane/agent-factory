export const COCKPIT_PATHS = {
  board: '/',
  issue: (number: number): string => `/issues/${number}`,
  pullRequest: (number: number): string => `/pull-requests/${number}`,
  audit: (id: string): string => `/audits/${encodeURIComponent(id)}`,
  release: (id: string): string => `/releases/${encodeURIComponent(id)}`,
  request: (id: string): string => `/requests/${encodeURIComponent(id)}`,
} as const;

const TRAILING_SLASHES = /\/+$/;

export function cockpitLink(baseUrl: string, path: string): string {
  return `${baseUrl.replace(TRAILING_SLASHES, '')}${path}`;
}
