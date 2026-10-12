import { describe, expect, it } from 'vitest';
import { COMMAND_BODY_SCHEMAS } from './commands.ts';
import { FilmOrderViewSchema, FilmViewSchema, IssueSpecViewSchema } from './snapshot.ts';

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
