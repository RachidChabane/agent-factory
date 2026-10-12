import { DEFAULT_ISSUE_TYPES } from '@agent-factory/domain';
import { describe, expect, it } from 'vitest';
import { acceptanceAuthorValues, filmsValue, ROLE_PROMPT_PLACEHOLDERS } from './role-prompts.ts';
import { SPEC } from './testing/pipeline-scenario.ts';

const REPOSITORY = { owner: 'example-org', name: 'storefront' };
const UI_TYPE = DEFAULT_ISSUE_TYPES.find((type) => type.id === 'ui');

describe('the films rule of the acceptance author', () => {
  it('says that the factory records the films the spec declares, against the base and the head', () => {
    const rule = filmsValue(true);
    expect(rule.startsWith('- ')).toBe(true);
    expect(rule.endsWith('\n')).toBe(true);
    expect(rule).toContain('`Films:` header');
    expect(rule).toContain('recorded by the factory itself against the base and the head once the pull request is open');
    expect(rule).toContain('never write a check for what only a film can show');
  });

  it('says nothing when the project films nothing', () => {
    expect(filmsValue(false)).toBe('');
  });

  it('is a value of the prompt, empty or not, so that every template can use it', () => {
    if (UI_TYPE === undefined) throw new Error('the ui preset is missing');
    expect(acceptanceAuthorValues(REPOSITORY, SPEC, UI_TYPE, false)[ROLE_PROMPT_PLACEHOLDERS.films]).toBe('');
    expect(acceptanceAuthorValues(REPOSITORY, SPEC, UI_TYPE, true)[ROLE_PROMPT_PLACEHOLDERS.films]).toBe(filmsValue(true));
  });
});
