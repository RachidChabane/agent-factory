/** The scenario that reports itself skipped, so that the demonstration shows a film that failed. */
export const UNAVAILABLE_SCENARIO = 'unavailable-scenario';
/** The file the first run leaves for the second one to replay; the demonstration's configuration names it too. */
export const DEMO_REPLAY_FILE = 'replay.json';

export type FilmPhase = 'base' | 'head';

/** What the factory passes to the film command of the demonstration. */
export interface DemoFilmRequest {
  readonly ref: string;
  readonly outputDirectory: string;
  readonly scenario: string;
  /** The replay file the first run wrote; null in the first run, which records the base. */
  readonly replayPath: string | null;
}

export class FilmArgumentError extends Error {
  constructor(detail: string) {
    super(`${detail}. Usage: demo-film-command --ref <commit> --out <directory> --scenario <name> [--replay <file>]`);
    this.name = 'FilmArgumentError';
  }
}

const OPTIONS = { ref: '--ref', output: '--out', scenario: '--scenario', replay: '--replay' } as const;
const KNOWN_OPTIONS: readonly string[] = Object.values(OPTIONS);
const OPTION_PREFIX = '--';
const OPTION_WIDTH = 2;

function optionValues(argv: readonly string[]): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += OPTION_WIDTH) {
    const option = argv[index] ?? '';
    const value = argv[index + 1];
    if (!KNOWN_OPTIONS.includes(option)) throw new FilmArgumentError(`${option === '' ? 'an empty argument' : option} is not an option of this command`);
    if (value === undefined || value.startsWith(OPTION_PREFIX)) throw new FilmArgumentError(`${option} needs a value`);
    values.set(option, value);
  }
  return values;
}

function required(values: ReadonlyMap<string, string>, option: string): string {
  const value = values.get(option);
  if (value === undefined) throw new FilmArgumentError(`${option} is required`);
  return value;
}

export function parseFilmArguments(argv: readonly string[]): DemoFilmRequest {
  const values = optionValues(argv);
  return {
    ref: required(values, OPTIONS.ref),
    outputDirectory: required(values, OPTIONS.output),
    scenario: required(values, OPTIONS.scenario),
    replayPath: values.get(OPTIONS.replay) ?? null,
  };
}

/** The first run records the base; the one that replays the first run's choices records the head. */
export function filmPhaseOf(request: DemoFilmRequest): FilmPhase {
  return request.replayPath === null ? 'base' : 'head';
}
