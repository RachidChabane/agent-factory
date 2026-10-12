import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { filmCommandProblems, filmPresentationOf, renderFilmCommand, replaysFirstRecording, type FilmCommandValues, type FilmSettings } from './film-settings.ts';

const VALUES: FilmCommandValues = { ref: 'abc123', output: '/store/out', scenario: 'checkout-flow', replay: '/store/before/replay.json' };

describe('film command problems', () => {
  it('accepts a template with the three required placeholders', () => {
    expect(filmCommandProblems(['film-tool', '--ref', '{ref}', '--out', '{output}', '--scenario', '{scenario}'])).toEqual([]);
  });

  it('names each required placeholder the template lacks', () => {
    expect(filmCommandProblems(['film-tool', '--ref', '{ref}'])).toEqual(['the command must contain {output}', 'the command must contain {scenario}']);
  });

  it('accepts a replay placeholder that follows an option or belongs to one', () => {
    const base = ['film-tool', '{ref}', '{output}', '{scenario}'];
    expect(filmCommandProblems([...base, '--replay', '{replay}'])).toEqual([]);
    expect(filmCommandProblems([...base, '--replay={replay}'])).toEqual([]);
  });

  it('refuses a replay placeholder that follows no option', () => {
    expect(filmCommandProblems(['film-tool', '{ref}', '{output}', '{scenario}', '{replay}'])).toEqual(['{replay} must follow an option such as --replay']);
  });

  it('tells whether the second recording replays the first', () => {
    expect(replaysFirstRecording(['film-tool', '--replay', '{replay}'])).toBe(true);
    expect(replaysFirstRecording(['film-tool', '{ref}'])).toBe(false);
  });
});

describe('film command rendering', () => {
  it('substitutes every placeholder, also inside a longer token', () => {
    expect(renderFilmCommand(['film-tool', '--ref={ref}', '{output}', 'scenario:{scenario}', '--replay', '{replay}'], VALUES)).toEqual([
      'film-tool',
      '--ref=abc123',
      '/store/out',
      'scenario:checkout-flow',
      '--replay',
      '/store/before/replay.json',
    ]);
  });

  it('drops the replay token and its option for the first recording', () => {
    expect(renderFilmCommand(['film-tool', '--replay', '{replay}', '{ref}'], { ...VALUES, replay: null })).toEqual(['film-tool', 'abc123']);
  });

  it('drops a replay option that carries its value in one token', () => {
    expect(renderFilmCommand(['film-tool', '--replay={replay}', '{ref}'], { ...VALUES, replay: null })).toEqual(['film-tool', 'abc123']);
  });

  it('leaves a template without placeholders as it is', () => {
    fc.assert(
      fc.property(fc.array(fc.stringMatching(/^[a-z0-9 -]{0,12}$/), { maxLength: 6 }), (tokens) => {
        expect(renderFilmCommand(tokens, VALUES)).toEqual(tokens);
      }),
    );
  });
});

describe('film presentation', () => {
  it('falls back on the timeout of the command and carries the zone and the cockpit address', () => {
    const settings: FilmSettings = {
      command: ['film-tool'],
      workingDirectory: '/tools/films',
      environment: {},
      timeoutMs: 20 * 60_000,
      replayFile: 'replay.json',
      timeZone: 'UTC',
    };
    expect(filmPresentationOf(settings, 'https://factory.example.test/projects/storefront')).toEqual({
      fallbackDurationMs: 20 * 60_000,
      timeZone: 'UTC',
      cockpitUrl: 'https://factory.example.test/projects/storefront',
    });
  });
});
