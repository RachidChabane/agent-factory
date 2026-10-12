import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FILM_SCENARIO_MAX_LENGTH, FORGE_LABEL_MAX_LENGTH, filmLabel, filmScenarioOf, isFilmScenarioName } from './film-scenario.ts';

describe('film scenario name', () => {
  it('accepts kebab-case, dotted and underscored names', () => {
    for (const name of ['checkout-flow', 'scenario_2', 'v1.2-flow', 'A']) expect(isFilmScenarioName(name)).toBe(true);
  });

  it('refuses anything that could leave its directory or pass for an option', () => {
    for (const name of ['', '../x', 'a/b', 'a\\b', '-rf', '.hidden', 'a..b', 'a b', 'a\0b', 'é']) expect(isFilmScenarioName(name)).toBe(false);
  });

  it('refuses names beyond the maximum length', () => {
    expect(isFilmScenarioName('a'.repeat(FILM_SCENARIO_MAX_LENGTH))).toBe(true);
    expect(isFilmScenarioName('a'.repeat(FILM_SCENARIO_MAX_LENGTH + 1))).toBe(false);
  });

  it('never accepts a name containing a path separator', () => {
    fc.assert(fc.property(fc.string(), fc.string(), (left, right) => !isFilmScenarioName(`${left}/${right}`)));
  });

  it('only accepts names whose label fits in a forge label', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (name) => !isFilmScenarioName(name) || filmLabel(name).length <= FORGE_LABEL_MAX_LENGTH),
    );
  });
});

describe('film label', () => {
  it('stores a scenario under the film prefix and reads it back', () => {
    expect(filmLabel('checkout-flow')).toBe('film:checkout-flow');
    expect(filmScenarioOf('film:checkout-flow')).toBe('checkout-flow');
  });

  it('reads no scenario from another label', () => {
    expect(filmScenarioOf('type:ui')).toBeNull();
    expect(filmScenarioOf('spec:validated')).toBeNull();
  });

  it('round-trips every accepted name', () => {
    fc.assert(fc.property(fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9._-]{0,20}$/), (name) => filmScenarioOf(filmLabel(name)) === name));
  });
});
