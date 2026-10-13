import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const OPTIONS = { directory: '--to', file: '--file' } as const;
const KNOWN_OPTIONS: readonly string[] = Object.values(OPTIONS);
const OPTION_PREFIX = '--';
const OPTION_WIDTH = 2;
const FINGERPRINT_ALGORITHM = 'sha256';
const FINGERPRINT_LENGTH = 12;
const NAME_SEPARATOR = '-';

export class UploadArgumentError extends Error {
  constructor(detail: string) {
    super(`${detail}. Usage: demo-upload-command --to <directory> --file <path>`);
    this.name = 'UploadArgumentError';
  }
}

export interface DemoUploadRequest {
  readonly directory: string;
  readonly file: string;
}

function optionValues(argv: readonly string[]): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += OPTION_WIDTH) {
    const option = argv[index] ?? '';
    const value = argv[index + 1];
    if (!KNOWN_OPTIONS.includes(option)) throw new UploadArgumentError(`${option === '' ? 'an empty argument' : option} is not an option of this command`);
    if (value === undefined || value.startsWith(OPTION_PREFIX)) throw new UploadArgumentError(`${option} needs a value`);
    values.set(option, value);
  }
  return values;
}

function required(values: ReadonlyMap<string, string>, option: string): string {
  const value = values.get(option);
  if (value === undefined) throw new UploadArgumentError(`${option} is required`);
  return value;
}

export function parseUploadArguments(argv: readonly string[]): DemoUploadRequest {
  const values = optionValues(argv);
  return { directory: required(values, OPTIONS.directory), file: required(values, OPTIONS.file) };
}

/** The name a file is stored under: its own, behind a short fingerprint of its content so that two files named alike never overwrite each other. */
export async function storedName(file: string): Promise<string> {
  const fingerprint = createHash(FINGERPRINT_ALGORITHM)
    .update(await readFile(file))
    .digest('hex')
    .slice(0, FINGERPRINT_LENGTH);
  return `${fingerprint}${NAME_SEPARATOR}${basename(file)}`;
}

/** Copies the file into the directory and answers the `file://` address of the copy: what a product's own upload tool does with a storage service. */
export async function uploadToDirectory(request: DemoUploadRequest): Promise<string> {
  const directory = resolve(request.directory);
  await mkdir(directory, { recursive: true });
  const target = join(directory, await storedName(request.file));
  await copyFile(request.file, target);
  return pathToFileURL(target).href;
}
