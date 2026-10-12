import { extname, join } from 'node:path';
import type { Clock, EventStore, WorkspaceFiles } from '../ports.ts';
import { InvalidRequestImageNameError, RequestImageMissingError } from './errors.ts';
import { REQUEST_FILE_NAME, imagePath, nextRequestId } from './request-files.ts';
import { REQUEST_RECEIVED_EVENT, requestSubject, type AttachmentPayload, type RequestReceivedPayload } from './request-events.ts';
import { loadRequests } from './request-projection.ts';

export const DEFAULT_MEDIA_TYPE = 'application/octet-stream';

export const MEDIA_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const HEADING_PREFIX = '# ';
const PLAIN_FILE_NAME = /^[^/\\]+$/;
const PARENT_DIRECTORY_NAME = '..';
const CURRENT_DIRECTORY_NAME = '.';

export function mediaTypeOf(fileName: string): string {
  return MEDIA_TYPES_BY_EXTENSION[extname(fileName).toLowerCase()] ?? DEFAULT_MEDIA_TYPE;
}

export function requestTitleOf(markdown: string): string {
  const lines = markdown.split('\n').map((line) => line.trim());
  const heading = lines.find((line) => line.startsWith(HEADING_PREFIX));
  if (heading !== undefined) return heading.slice(HEADING_PREFIX.length).trim();
  return lines.find((line) => line !== '') ?? '';
}

export interface RequestImageInput {
  readonly name: string;
  readonly sourceDirectory: string;
}

export interface AddRequestInput {
  readonly title: string;
  readonly requester: string;
  readonly channel: string;
  readonly body: string;
  readonly images: readonly RequestImageInput[];
}

export interface AddRequestDependencies {
  readonly events: EventStore;
  readonly files: WorkspaceFiles;
  readonly clock: Clock;
}

export interface AddRequestSettings {
  readonly requestsDirectory: string;
}

export interface AddedRequest {
  readonly id: string;
  readonly attachments: readonly AttachmentPayload[];
}

function assertPlainFileName(name: string): void {
  const plain = PLAIN_FILE_NAME.test(name) && name !== PARENT_DIRECTORY_NAME && name !== CURRENT_DIRECTORY_NAME;
  if (!plain) throw new InvalidRequestImageNameError(name);
}

export class AddRequest {
  private readonly dependencies: AddRequestDependencies;
  private readonly settings: AddRequestSettings;

  constructor(dependencies: AddRequestDependencies, settings: AddRequestSettings) {
    this.dependencies = dependencies;
    this.settings = settings;
  }

  async add(input: AddRequestInput): Promise<AddedRequest> {
    const { events, files, clock } = this.dependencies;
    input.images.forEach((image) => assertPlainFileName(image.name));
    const id = nextRequestId((await loadRequests(events)).length);
    const directory = join(this.settings.requestsDirectory, id);
    await files.writeText(directory, REQUEST_FILE_NAME, input.body);
    const attachments: AttachmentPayload[] = [];
    for (const image of input.images) {
      const path = imagePath(image.name);
      if (!(await files.copyFile(image.sourceDirectory, image.name, directory, path))) {
        throw new RequestImageMissingError(image.name, image.sourceDirectory);
      }
      attachments.push({ name: image.name, path, mediaType: mediaTypeOf(image.name) });
    }
    const received: RequestReceivedPayload = {
      id,
      title: input.title,
      requester: input.requester,
      channel: input.channel,
      body: input.body,
      attachments,
      receivedAt: clock.now().toISOString(),
    };
    await events.append(REQUEST_RECEIVED_EVENT, requestSubject(id), received);
    return { id, attachments };
  }
}
