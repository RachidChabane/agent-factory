export const MEDIA_FILE_PLACEHOLDER = '{file}';
export const DEFAULT_MEDIA_UPLOAD_TIMEOUT_SECONDS = 120;

/** The schemes a link may have for the operator to open it: a web address, or a file of the machine the factory runs on. */
const LINK_PROTOCOLS: readonly string[] = ['http:', 'https:', 'file:'];
const LINE_SEPARATOR = /\r?\n/;

/** What a project declares to make the media of its pull requests reachable from its notices. */
export interface MediaUploadSettings {
  /** The argument template of the upload command; it holds `{file}`, the path of the file to upload. */
  readonly command: readonly string[];
  readonly timeoutMs: number;
}

/** What keeps a template from being an upload command; empty when it is one. */
export function uploadCommandProblems(command: readonly string[]): readonly string[] {
  return command.some((token) => token.includes(MEDIA_FILE_PLACEHOLDER)) ? [] : [`the command must contain ${MEDIA_FILE_PLACEHOLDER}`];
}

/** The argv that uploads one file. */
export function renderUploadCommand(template: readonly string[], file: string): readonly string[] {
  return template.map((token) => token.replaceAll(MEDIA_FILE_PLACEHOLDER, file));
}

/** The link an upload command printed: its last non-empty line, when that is a web or file address; otherwise null. */
export function uploadedLink(output: string): string | null {
  const line = output
    .split(LINE_SEPARATOR)
    .map((candidate) => candidate.trim())
    .findLast((candidate) => candidate !== '');
  if (line === undefined) return null;
  return URL.canParse(line) && LINK_PROTOCOLS.includes(new URL(line).protocol) ? line : null;
}
