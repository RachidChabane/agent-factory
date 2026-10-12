import { GH_ENVIRONMENT_PASSTHROUGH, GH_FIXED_ENVIRONMENT } from './constants.ts';

export function buildGhEnvironment(source: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const environment: Record<string, string> = { ...GH_FIXED_ENVIRONMENT };
  for (const name of GH_ENVIRONMENT_PASSTHROUGH) {
    const value = source[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}
