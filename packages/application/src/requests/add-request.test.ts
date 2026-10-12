import { describe, expect, it } from 'vitest';
import { InMemoryEventStore } from '../audit/testing/fakes.ts';
import { InMemoryWorkspace } from '../pipeline/testing/pipeline-fakes.ts';
import { SteppingClock } from '../runs/test-support.ts';
import { AddRequest, DEFAULT_MEDIA_TYPE, mediaTypeOf, requestTitleOf } from './add-request.ts';
import { InvalidRequestImageNameError, RequestImageMissingError } from './errors.ts';
import { REQUEST_RECEIVED_EVENT } from './request-events.ts';

const REQUESTS_DIRECTORY = '/requests';
const UPLOADS = '/uploads';

function setup() {
  const events = new InMemoryEventStore();
  const workspace = new InMemoryWorkspace();
  const clock = new SteppingClock(new Date('2026-03-04T05:06:07.000Z'));
  const addRequest = new AddRequest({ events, files: workspace, clock }, { requestsDirectory: REQUESTS_DIRECTORY });
  return { events, workspace, addRequest };
}

const input = {
  title: 'Cost on the run page',
  requester: 'alice',
  channel: 'chat',
  body: '# Cost on the run page\n\nShow the cost.\n',
  images: [
    { name: 'screen.png', sourceDirectory: UPLOADS },
    { name: 'notes.txt', sourceDirectory: UPLOADS },
  ],
};

describe('AddRequest', () => {
  it('writes the request, copies the images and appends request.received', async () => {
    const { events, workspace, addRequest } = setup();
    workspace.write(UPLOADS, 'screen.png', 'png-bytes');
    workspace.write(UPLOADS, 'notes.txt', 'text');

    const added = await addRequest.add(input);

    expect(added.id).toBe('req-1');
    expect(workspace.read('/requests/req-1', 'request.md')).toBe(input.body);
    expect(workspace.read('/requests/req-1', 'images/screen.png')).toBe('png-bytes');
    expect(workspace.read('/requests/req-1', 'images/notes.txt')).toBe('text');
    expect(events.records).toHaveLength(1);
    expect(events.records[0]).toMatchObject({
      type: REQUEST_RECEIVED_EVENT,
      subject: 'request/req-1',
      payload: {
        id: 'req-1',
        title: input.title,
        requester: 'alice',
        channel: 'chat',
        body: input.body,
        receivedAt: '2026-03-04T05:06:07.000Z',
        attachments: [
          { name: 'screen.png', path: 'images/screen.png', mediaType: 'image/png' },
          { name: 'notes.txt', path: 'images/notes.txt', mediaType: DEFAULT_MEDIA_TYPE },
        ],
      },
    });
  });

  it('numbers requests after the existing ones', async () => {
    const { workspace, addRequest } = setup();
    workspace.write(UPLOADS, 'screen.png', 'a');
    workspace.write(UPLOADS, 'notes.txt', 'b');
    const first = await addRequest.add(input);
    const second = await addRequest.add(input);
    expect([first.id, second.id]).toEqual(['req-1', 'req-2']);
  });

  it('refuses an image whose source file is missing and records nothing', async () => {
    const { events, addRequest } = setup();
    await expect(addRequest.add(input)).rejects.toBeInstanceOf(RequestImageMissingError);
    expect(events.records).toHaveLength(0);
  });

  it.each(['../secret.png', 'a/b.png', '..', ''])('refuses the image name %j', async (name) => {
    const { events, addRequest } = setup();
    await expect(addRequest.add({ ...input, images: [{ name, sourceDirectory: UPLOADS }] })).rejects.toBeInstanceOf(
      InvalidRequestImageNameError,
    );
    expect(events.records).toHaveLength(0);
  });
});

describe('mediaTypeOf', () => {
  it.each([
    ['a.png', 'image/png'],
    ['a.JPG', 'image/jpeg'],
    ['a.jpeg', 'image/jpeg'],
    ['a.gif', 'image/gif'],
    ['a.webp', 'image/webp'],
    ['a.svg', 'image/svg+xml'],
    ['a.pdf', DEFAULT_MEDIA_TYPE],
    ['noextension', DEFAULT_MEDIA_TYPE],
  ])('maps %s to %s', (name, expected) => {
    expect(mediaTypeOf(name)).toBe(expected);
  });
});

describe('requestTitleOf', () => {
  it('takes the first level-one heading', () => {
    expect(requestTitleOf('intro\n\n#  The title  \n\n## Other\n')).toBe('The title');
  });

  it('falls back to the first non-empty line', () => {
    expect(requestTitleOf('\n\n  Show the cost  \nmore')).toBe('Show the cost');
  });

  it('is empty for a blank document', () => {
    expect(requestTitleOf('\n \n')).toBe('');
  });
});
