import { describe, expect, it } from 'vitest';
import { COMMAND_BODY_SCHEMAS } from './commands.ts';
import { FilmOrderViewSchema, FilmToolWaitViewSchema, FilmViewSchema, IssueSpecViewSchema, ProjectSettingsViewSchema } from './snapshot.ts';

const MOMENT = '2026-10-12T10:00:00.000Z';

describe('the command that orders a film', () => {
  const schema = COMMAND_BODY_SCHEMAS['pr.film'];

  it('names a project, an issue and a scenario', () => {
    expect(schema.parse({ project: 'storefront', issueNumber: 12, scenario: ' checkout-flow ' })).toEqual({ project: 'storefront', issueNumber: 12, scenario: 'checkout-flow' });
  });

  it('refuses a name that is not a scenario, with the rule', () => {
    for (const scenario of ['', 'a b', '../escape', '-flag', 'a/b']) {
      const result = schema.safeParse({ project: 'storefront', issueNumber: 12, scenario });
      expect(result.success).toBe(false);
    }
    expect(schema.safeParse({ project: 'storefront', issueNumber: 12, scenario: 'a b' }).error?.issues[0]?.message).toContain('the scenario name must be letters, digits');
  });
});

describe('the films in the snapshot', () => {
  it('lists the scenarios a spec declares', () => {
    expect(IssueSpecViewSchema.safeParse({ need: 'n', acceptanceCriteria: [], outOfScope: [], expectedProof: 'p', films: ['checkout-flow'] }).success).toBe(true);
    expect(IssueSpecViewSchema.safeParse({ need: 'n', acceptanceCriteria: [], outOfScope: [], expectedProof: 'p' }).success).toBe(false);
  });

  it('accepts every state of an order and refuses another', () => {
    const base = { scenario: 'checkout-flow', operator: 'Alex Morgan', expectedAt: null, filmsAhead: 0, reason: null, since: MOMENT };
    for (const state of ['queued', 'recording-base', 'recording-head', 'committing', 'finished', 'failed']) expect(FilmOrderViewSchema.safeParse({ ...base, state }).success).toBe(true);
    expect(FilmOrderViewSchema.safeParse({ ...base, state: 'recording' }).success).toBe(false);
  });

  it('holds the two recordings of a scenario', () => {
    const phase = { sha: 'a'.repeat(40), videoUrl: '/api/projects/storefront/evidence/12/films/checkout-flow/before/film.mp4', screenshotUrls: [], facts: [{ label: 'Items', value: '2' }] };
    expect(FilmViewSchema.safeParse({ scenario: 'checkout-flow', recordedAt: MOMENT, before: phase, after: phase }).success).toBe(true);
    expect(FilmViewSchema.safeParse({ scenario: 'checkout-flow', recordedAt: MOMENT, before: phase }).success).toBe(false);
  });
});

describe('the tool the films of a project wait for, in the snapshot', () => {
  const wait = {
    tool: 'vault',
    scope: 'installation',
    status: 'unauthenticated',
    detail: 'token expired',
    loginCommand: 'vault login -method=oidc',
    fixCommand: null,
    since: MOMENT,
    checkedAt: MOMENT,
  };

  it('names the tool, why its check fails, the commands that restore it and when', () => {
    expect(FilmToolWaitViewSchema.safeParse(wait).success).toBe(true);
    expect(FilmToolWaitViewSchema.safeParse({ ...wait, scope: 'project', loginCommand: null, fixCommand: 'brew install vault' }).success).toBe(true);
  });

  it.each(['unauthenticated', 'missing', 'error'])('accepts a tool that is %s', (status) => {
    expect(FilmToolWaitViewSchema.safeParse({ ...wait, status }).success).toBe(true);
  });

  it('refuses a tool that is connected, which holds nothing back, and a scope that is neither the installation nor the project', () => {
    expect(FilmToolWaitViewSchema.safeParse({ ...wait, status: 'connected' }).success).toBe(false);
    expect(FilmToolWaitViewSchema.safeParse({ ...wait, scope: 'builtin' }).success).toBe(false);
  });

  it('refuses a wait that tells nothing of when the films began to wait or when the tool was read', () => {
    expect(FilmToolWaitViewSchema.safeParse({ ...wait, since: undefined }).success).toBe(false);
    expect(FilmToolWaitViewSchema.safeParse({ ...wait, checkedAt: 'yesterday' }).success).toBe(false);
  });

  it('lists the tools the films of a project need in the settings of its films', () => {
    const films = ProjectSettingsViewSchema.shape.films.unwrap();
    expect(films.safeParse({ timeZone: 'UTC', timeoutMinutes: 20, tools: ['vault'] }).success).toBe(true);
    expect(films.safeParse({ timeZone: 'UTC', timeoutMinutes: 20 }).success).toBe(false);
  });
});
