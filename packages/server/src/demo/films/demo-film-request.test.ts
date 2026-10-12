import { describe, expect, it } from 'vitest';
import { filmPhaseOf, FilmArgumentError, parseFilmArguments } from './demo-film-request.ts';

const FIRST_RUN = ['--ref', 'abc1234', '--out', '/work/out', '--scenario', 'checkout-flow'];

describe('parseFilmArguments', () => {
  it('reads the commit, the output directory and the scenario of the first run, which has no replay file', () => {
    expect(parseFilmArguments(FIRST_RUN)).toEqual({ ref: 'abc1234', outputDirectory: '/work/out', scenario: 'checkout-flow', replayPath: null });
  });

  it('reads the replay file of the second run, whatever the order of the options', () => {
    const request = parseFilmArguments(['--replay', '/work/base/replay.json', '--scenario', 'checkout-flow', '--out', '/work/out', '--ref', 'def5678']);
    expect(request).toEqual({ ref: 'def5678', outputDirectory: '/work/out', scenario: 'checkout-flow', replayPath: '/work/base/replay.json' });
  });

  it.each(['--ref', '--out', '--scenario'])('refuses a command line without %s, and says which option is missing', (option) => {
    const index = FIRST_RUN.indexOf(option);
    const without = [...FIRST_RUN.slice(0, index), ...FIRST_RUN.slice(index + 2)];
    expect(() => parseFilmArguments(without)).toThrow(`${option} is required`);
  });

  it('refuses an option the command does not have', () => {
    expect(() => parseFilmArguments([...FIRST_RUN, '--headless', 'yes'])).toThrow('--headless is not an option of this command');
  });

  it('refuses an option that has no value, at the end of the line or before another option', () => {
    expect(() => parseFilmArguments([...FIRST_RUN, '--replay'])).toThrow('--replay needs a value');
    expect(() => parseFilmArguments(['--ref', '--out', '/work/out', '--scenario', 'checkout-flow'])).toThrow('--ref needs a value');
  });

  it('prints the usage with every refusal', () => {
    expect(() => parseFilmArguments([])).toThrow(FilmArgumentError);
    expect(() => parseFilmArguments([])).toThrow('Usage: demo-film-command --ref <commit> --out <directory> --scenario <name> [--replay <file>]');
  });
});

describe('filmPhaseOf', () => {
  it('is the base for the run that replays nothing and the head for the run that replays the first one', () => {
    expect(filmPhaseOf(parseFilmArguments(FIRST_RUN))).toBe('base');
    expect(filmPhaseOf(parseFilmArguments([...FIRST_RUN, '--replay', '/work/base/replay.json']))).toBe('head');
  });
});
