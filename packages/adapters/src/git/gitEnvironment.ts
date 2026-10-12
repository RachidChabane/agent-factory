import { GIT_ENVIRONMENT_PASSTHROUGH, GIT_FIXED_ENVIRONMENT } from './constants.ts';

export function buildGitEnvironment(source: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const environment: Record<string, string> = { ...GIT_FIXED_ENVIRONMENT };
  for (const name of GIT_ENVIRONMENT_PASSTHROUGH) {
    const value = source[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}
