export const FACTORY_PUBLIC_URL = 'https://factory.example.com';
export const FACTORY_VERSION = '0.1.0';

export interface Person {
  readonly name: string;
  readonly login: string;
}

export const OPERATOR: Person = { name: 'Alex Morgan', login: 'amorgan' };
export const DANA: Person = { name: 'Dana Reyes', login: 'dreyes' };
export const RILEY: Person = { name: 'Riley Chen', login: 'rchen' };
export const SAM: Person = { name: 'Sam Okafor', login: 'sokafor' };
export const JORDAN: Person = { name: 'Jordan Lee', login: 'jlee' };

export const DEPENDENCY_BOT_LOGIN = 'dependency-bot[bot]';
export const ACTIONS_BOT_LOGIN = 'github-actions[bot]';

export const MODEL_OPUS = 'claude-opus-5-5';
export const MODEL_SONNET = 'claude-sonnet-5-5';
export const MODEL_HAIKU = 'claude-haiku-5-5';
export const MODELS: readonly string[] = [MODEL_OPUS, MODEL_SONNET, MODEL_HAIKU];

export const ACCOUNT_PERSONAL = 'personal';
export const ACCOUNT_SHARED = 'shared';
