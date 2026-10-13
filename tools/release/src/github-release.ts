/** Publishes the GitHub Release of a version tag through the REST API, so that a runner needs no GitHub CLI. */

const API_VERSION_HEADER = '2022-11-28';
const NOT_FOUND = 404;

export interface ReleaseTarget {
  /** The base address of the REST API, such as https://api.github.com. */
  readonly apiUrl: string;
  /** The repository, as owner/name. */
  readonly repository: string;
  readonly token: string;
  readonly tag: string;
  readonly notes: string;
}

export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; ok: boolean; json(): Promise<unknown>; text(): Promise<string> }>;

export type PublishOutcome = { readonly kind: 'published'; readonly url: string } | { readonly kind: 'already-published'; readonly url: string };

export class ReleasePublicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReleasePublicationError';
  }
}

function headers(token: string): Record<string, string> {
  return { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': API_VERSION_HEADER };
}

function htmlUrlOf(body: unknown): string {
  return typeof body === 'object' && body !== null && 'html_url' in body && typeof body.html_url === 'string' ? body.html_url : '';
}

/**
 * Creates the release of an existing tag, titled by the tag, with the notes given. A tag the repository lacks is refused,
 * because the forge would otherwise create it on the default branch; a tag that already has its release is left as it is.
 */
export async function publishRelease(target: ReleaseTarget, fetch: Fetch): Promise<PublishOutcome> {
  const repository = `${target.apiUrl}/repos/${target.repository}`;
  const tag = encodeURIComponent(target.tag);
  const reference = await fetch(`${repository}/git/ref/tags/${tag}`, { method: 'GET', headers: headers(target.token) });
  if (reference.status === NOT_FOUND) throw new ReleasePublicationError(`${target.repository} has no tag ${target.tag}; push the tag first`);
  if (!reference.ok) throw new ReleasePublicationError(`reading the tag ${target.tag} answered ${reference.status}: ${await reference.text()}`);
  const existing = await fetch(`${repository}/releases/tags/${tag}`, { method: 'GET', headers: headers(target.token) });
  if (existing.ok) return { kind: 'already-published', url: htmlUrlOf(await existing.json()) };
  if (existing.status !== NOT_FOUND) throw new ReleasePublicationError(`reading the release of ${target.tag} answered ${existing.status}: ${await existing.text()}`);
  const created = await fetch(`${repository}/releases`, {
    method: 'POST',
    headers: headers(target.token),
    body: JSON.stringify({ tag_name: target.tag, name: target.tag, body: target.notes, draft: false, prerelease: false }),
  });
  if (!created.ok) throw new ReleasePublicationError(`creating the release of ${target.tag} answered ${created.status}: ${await created.text()}`);
  return { kind: 'published', url: htmlUrlOf(await created.json()) };
}
