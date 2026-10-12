import { FACTORY_HOME_VARIABLE } from '../config/agent-factory-config.ts';

/**
 * The only variables of the caller's environment the factory commands see: where to find the tools,
 * where the temporary files go, and how to print. Nothing else, so the run holds no credential and
 * no setting of the caller's shell, and the operator is the factory's default one.
 */
const INHERITED_VARIABLES: readonly string[] = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'TERM'];

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

/** The environment of a factory command that works on the installation at `home`. */
export function factoryEnvironment(source: EnvironmentSource, home: string): Readonly<Record<string, string>> {
  const inherited = INHERITED_VARIABLES.flatMap((name) => {
    const value = source[name];
    return value === undefined ? [] : [[name, value] as const];
  });
  return { ...Object.fromEntries(inherited), [FACTORY_HOME_VARIABLE]: home };
}
