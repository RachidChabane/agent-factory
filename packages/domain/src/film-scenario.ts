/** The prefix of the label under which a spec stores each film scenario it declares. */
export const FILM_LABEL_PREFIX = 'film:';
/** The longest label name a forge accepts. */
export const FORGE_LABEL_MAX_LENGTH = 50;
/** A scenario name has to fit in its label, whatever the forge. */
export const FILM_SCENARIO_MAX_LENGTH = FORGE_LABEL_MAX_LENGTH - FILM_LABEL_PREFIX.length;
export const FILM_SCENARIO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PARENT_SEGMENT = '..';

export const FILM_SCENARIO_RULE = `letters, digits, dot, underscore and hyphen, starting with a letter or digit, at most ${FILM_SCENARIO_MAX_LENGTH} characters`;

/** Whether a name can be a scenario: a label, a directory name and a command argument at once. */
export function isFilmScenarioName(name: string): boolean {
  return name.length <= FILM_SCENARIO_MAX_LENGTH && FILM_SCENARIO_PATTERN.test(name) && !name.includes(PARENT_SEGMENT);
}

export function filmLabel(scenario: string): string {
  return `${FILM_LABEL_PREFIX}${scenario}`;
}

/** The scenario a label declares, or null when the label is not a film label. */
export function filmScenarioOf(label: string): string | null {
  return label.startsWith(FILM_LABEL_PREFIX) ? label.slice(FILM_LABEL_PREFIX.length) : null;
}
