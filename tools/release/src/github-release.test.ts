import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { publishRelease, ReleasePublicationError, type Fetch, type ReleaseTarget } from './github-release.ts';

const TARGET: ReleaseTarget = { apiUrl: 'https://api.github.example', repository: 'example-org/agent-factory', token: 'a-token', tag: 'v1.4.0', notes: '### Features\n\n- **cockpit:** show the read time of every value' };
const REPOSITORY = `${TARGET.apiUrl}/repos/${TARGET.repository}`;
const RELEASE_PAGE = 'https://github.example/example-org/agent-factory/releases/tag/v1.4.0';

interface Call {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
  readonly authorization: string | undefined;
}

function forge(answers: Readonly<Record<string, { status: number; body?: unknown }>>): { fetch: Fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: Fetch = async (url, init) => {
    calls.push({ method: init.method, url, body: init.body === undefined ? undefined : JSON.parse(init.body), authorization: init.headers['Authorization'] });
    const answer = answers[`${init.method} ${url}`] ?? { status: 404, body: { message: 'Not Found' } };
    return { status: answer.status, ok: answer.status < 300, json: async () => answer.body, text: async () => JSON.stringify(answer.body) };
  };
  return { fetch, calls };
}

describe('the publication of a GitHub Release', () => {
  it('creates the release of an existing tag, titled by the tag, with the notes of its changelog section', async () => {
    const { fetch, calls } = forge({
      [`GET ${REPOSITORY}/git/ref/tags/v1.4.0`]: { status: 200, body: { ref: 'refs/tags/v1.4.0' } },
      [`POST ${REPOSITORY}/releases`]: { status: 201, body: { html_url: RELEASE_PAGE } },
    });
    assert.deepEqual(await publishRelease(TARGET, fetch), { kind: 'published', url: RELEASE_PAGE });
    assert.deepEqual(calls.at(-1), {
      method: 'POST',
      url: `${REPOSITORY}/releases`,
      body: { tag_name: 'v1.4.0', name: 'v1.4.0', body: TARGET.notes, draft: false, prerelease: false },
      authorization: 'Bearer a-token',
    });
  });

  it('refuses a tag the repository lacks, so that the forge does not create it on the default branch', async () => {
    const { fetch, calls } = forge({});
    await assert.rejects(publishRelease(TARGET, fetch), new ReleasePublicationError('example-org/agent-factory has no tag v1.4.0; push the tag first'));
    assert.deepEqual(calls.map((call) => call.method), ['GET']);
  });

  it('leaves a release that already exists as it is', async () => {
    const { fetch, calls } = forge({
      [`GET ${REPOSITORY}/git/ref/tags/v1.4.0`]: { status: 200, body: {} },
      [`GET ${REPOSITORY}/releases/tags/v1.4.0`]: { status: 200, body: { html_url: RELEASE_PAGE } },
    });
    assert.deepEqual(await publishRelease(TARGET, fetch), { kind: 'already-published', url: RELEASE_PAGE });
    assert.equal(calls.some((call) => call.method === 'POST'), false);
  });

  it('names the answer of the forge when it refuses to create the release', async () => {
    const { fetch } = forge({
      [`GET ${REPOSITORY}/git/ref/tags/v1.4.0`]: { status: 200, body: {} },
      [`POST ${REPOSITORY}/releases`]: { status: 403, body: { message: 'Resource not accessible by integration' } },
    });
    await assert.rejects(publishRelease(TARGET, fetch), /creating the release of v1\.4\.0 answered 403: .*Resource not accessible by integration/);
  });
});
