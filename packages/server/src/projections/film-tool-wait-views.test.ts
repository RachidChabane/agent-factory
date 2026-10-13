import { describe, expect, it } from 'vitest';
import { FilmToolWaitViewSchema } from '@agent-factory/cockpit';
import type { FilmToolWait } from '@agent-factory/application';
import { filmToolWaitView } from './film-views.ts';

const BEGAN_AT = new Date('2026-10-12T08:00:00.000Z');
const READ_AT = new Date('2026-10-12T08:05:00.000Z');

const WAIT: FilmToolWait = {
  tool: 'vault',
  scope: 'installation',
  status: 'unauthenticated',
  detail: 'token expired',
  loginCommand: 'vault login -method=oidc',
  fixCommand: 'vault status',
  since: BEGAN_AT,
  checkedAt: READ_AT,
};

describe('the tool the films of a project wait for, in the cockpit', () => {
  it('is the tool with what its check found, what to run, when the films began to wait and when the tool was last read', () => {
    const view = filmToolWaitView(WAIT);
    expect(view).toEqual({
      tool: 'vault',
      scope: 'installation',
      status: 'unauthenticated',
      detail: 'token expired',
      loginCommand: 'vault login -method=oidc',
      fixCommand: 'vault status',
      since: BEGAN_AT.toISOString(),
      checkedAt: READ_AT.toISOString(),
    });
    expect(FilmToolWaitViewSchema.safeParse(view).success).toBe(true);
  });

  it('keeps a login and a fix command the tool does not declare as nothing to run', () => {
    const view = filmToolWaitView({ ...WAIT, scope: 'project', loginCommand: null, fixCommand: null });
    expect(view).toMatchObject({ scope: 'project', loginCommand: null, fixCommand: null });
    expect(FilmToolWaitViewSchema.safeParse(view).success).toBe(true);
  });

  it('is nothing when the films wait for no tool', () => {
    expect(filmToolWaitView(null)).toBeNull();
  });
});
