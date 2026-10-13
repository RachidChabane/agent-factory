export const FILM_PLACEHOLDERS = {
  ref: '{ref}',
  output: '{output}',
  scenario: '{scenario}',
  replay: '{replay}',
} as const;

export const REQUIRED_FILM_PLACEHOLDERS: readonly string[] = [FILM_PLACEHOLDERS.ref, FILM_PLACEHOLDERS.output, FILM_PLACEHOLDERS.scenario];
export const DEFAULT_FILM_TIMEOUT_MINUTES = 20;
export const DEFAULT_FILM_REPLAY_FILE = 'replay.json';
const OPTION_PREFIX = '-';
const PLACEHOLDER_OPENING = '{';

/** What a project declares to have its pull requests filmed by its own tool. */
export interface FilmSettings {
  /** The argument template of the film command; it holds the placeholders of `FILM_PLACEHOLDERS`. */
  readonly command: readonly string[];
  readonly workingDirectory: string;
  /** Added to the operator's environment for the film command. */
  readonly environment: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  /** The file the first recording writes and the second one replays. */
  readonly replayFile: string;
  /** The zone the expected arrival of a film is told in. */
  readonly timeZone: string;
  /** The tools whose checks must pass before a film starts, by their names in the configuration. */
  readonly tools: readonly string[];
}

/** What the pull request body and the merge guard need to tell about the queue. */
export interface FilmPresentation {
  /** The duration assumed for a film while none has succeeded yet. */
  readonly fallbackDurationMs: number;
  readonly timeZone: string;
  /** The cockpit of the project, to follow a recording; null when the factory has no address to give. */
  readonly cockpitUrl: string | null;
}

export function filmPresentationOf(settings: FilmSettings, cockpitUrl: string | null): FilmPresentation {
  return { fallbackDurationMs: settings.timeoutMs, timeZone: settings.timeZone, cockpitUrl };
}

export interface FilmCommandValues {
  readonly ref: string;
  readonly output: string;
  readonly scenario: string;
  /** The replay file of the first recording; null for the first recording itself. */
  readonly replay: string | null;
}

function mentions(command: readonly string[], placeholder: string): boolean {
  return command.some((token) => token.includes(placeholder));
}

function isOption(token: string | undefined): boolean {
  return token !== undefined && token.startsWith(OPTION_PREFIX) && !token.includes(PLACEHOLDER_OPENING);
}

/** Whether the second recording replays what the first one wrote. */
export function replaysFirstRecording(command: readonly string[]): boolean {
  return mentions(command, FILM_PLACEHOLDERS.replay);
}

/** What keeps a template from being a film command; empty when it is one. */
export function filmCommandProblems(command: readonly string[]): readonly string[] {
  const missing = REQUIRED_FILM_PLACEHOLDERS.filter((placeholder) => !mentions(command, placeholder)).map(
    (placeholder) => `the command must contain ${placeholder}`,
  );
  const replayed = command.flatMap((token, index) => {
    if (!token.includes(FILM_PLACEHOLDERS.replay)) return [];
    const ownsItsOption = token.startsWith(OPTION_PREFIX);
    return ownsItsOption || isOption(command[index - 1]) ? [] : [`${FILM_PLACEHOLDERS.replay} must follow an option such as --replay`];
  });
  return [...missing, ...replayed];
}

const PLACEHOLDER_PATTERN = /\{(ref|output|scenario|replay)\}/g;

function substitute(token: string, values: FilmCommandValues): string {
  return token.replace(PLACEHOLDER_PATTERN, (_placeholder, name: keyof FilmCommandValues) => values[name] ?? '');
}

/**
 * The argv of one recording. The first recording has no replay file: the token that holds the
 * placeholder is dropped, with the option just before it when the placeholder stands alone.
 */
export function renderFilmCommand(template: readonly string[], values: FilmCommandValues): readonly string[] {
  const rendered: string[] = [];
  for (const token of template) {
    if (values.replay === null && token.includes(FILM_PLACEHOLDERS.replay)) {
      if (!token.startsWith(OPTION_PREFIX)) rendered.pop();
      continue;
    }
    rendered.push(substitute(token, values));
  }
  return rendered;
}
