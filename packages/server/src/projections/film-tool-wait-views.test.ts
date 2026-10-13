import { describe, expect, it } from 'vitest';
import { FilmToolWaitViewSchema } from '@agent-factory/cockpit';
import {
  FILM_TOOLS_AVAILABLE_EVENT,
  FILM_TOOLS_SUBJECT,
  FILM_TOOLS_UNAVAILABLE_EVENT,
  SETTINGS_SUBJECT,
  TOOL_CHECKED_EVENT,
  latestToolChecks,
  type FactoryEventRecord,
} from '@agent-factory/application';
import { filmToolWaitView } from './film-views.ts';

const FIRST_AT = new Date('2026-10-12T08:00:00.000Z');
const LATER_AT = new Date('2026-10-12T08:05:00.000Z');
const NO_CHECKS = new Map();

let sequence = 0;

function record(type: string, payload: unknown, occurredAt: Date, subject = FILM_TOOLS_SUBJECT): FactoryEventRecord {
  sequence += 1;
  return { sequence, type, subject, payload, occurredAt };
}

const UNAVAILABLE = {
  tool: 'vault',
  scope: 'installation',
  status: 'unauthenticated',
  detail: 'token expired',
  loginCommand: 'vault login -method=oidc',
  fixCommand: null,
};

function toolChecked(tool: string, status: string, occurredAt: Date, subject = SETTINGS_SUBJECT): FactoryEventRecord {
  return record(TOOL_CHECKED_EVENT, { tool, status, version: null, detail: '', fixCommand: null, operator: 'alex' }, occurredAt, subject);
}

describe('the tool the films of a project wait for, in the cockpit', () => {
  it('is the tool the log says the films wait for, with when they began to wait and when it was last read failing', () => {
    const view = filmToolWaitView(
      [record(FILM_TOOLS_UNAVAILABLE_EVENT, UNAVAILABLE, FIRST_AT), record(FILM_TOOLS_UNAVAILABLE_EVENT, { ...UNAVAILABLE, detail: 'token revoked' }, LATER_AT)],
      true,
      NO_CHECKS,
    );
    expect(view).toEqual({ ...UNAVAILABLE, detail: 'token revoked', since: FIRST_AT.toISOString(), checkedAt: LATER_AT.toISOString() });
    expect(FilmToolWaitViewSchema.safeParse(view).success).toBe(true);
  });

  it('was last read at the latest check of a tool of the installation, in the installation\'s own log', () => {
    const checks = latestToolChecks([toolChecked('vault', 'unauthenticated', LATER_AT)]);
    const view = filmToolWaitView([record(FILM_TOOLS_UNAVAILABLE_EVENT, UNAVAILABLE, FIRST_AT)], true, checks);
    expect(view).toMatchObject({ since: FIRST_AT.toISOString(), checkedAt: LATER_AT.toISOString() });
  });

  it('was last read at the latest check of a tool of the project, in the project\'s log', () => {
    const records = [record(FILM_TOOLS_UNAVAILABLE_EVENT, { ...UNAVAILABLE, scope: 'project' }, FIRST_AT), toolChecked('vault', 'unauthenticated', LATER_AT)];
    expect(filmToolWaitView(records, true, NO_CHECKS)?.checkedAt).toBe(LATER_AT.toISOString());
  });

  it('does not take the check of a tool of the other scope, or one older than the record, for the last reading', () => {
    const installationOnly = latestToolChecks([toolChecked('vault', 'unauthenticated', LATER_AT)]);
    const ofProject = filmToolWaitView([record(FILM_TOOLS_UNAVAILABLE_EVENT, { ...UNAVAILABLE, scope: 'project' }, FIRST_AT)], true, installationOnly);
    expect(ofProject?.checkedAt).toBe(FIRST_AT.toISOString());
    const older = latestToolChecks([toolChecked('vault', 'unauthenticated', FIRST_AT)]);
    expect(filmToolWaitView([record(FILM_TOOLS_UNAVAILABLE_EVENT, UNAVAILABLE, LATER_AT)], true, older)?.checkedAt).toBe(LATER_AT.toISOString());
  });

  it('is nothing once the films no longer wait', () => {
    const records = [record(FILM_TOOLS_UNAVAILABLE_EVENT, UNAVAILABLE, FIRST_AT), record(FILM_TOOLS_AVAILABLE_EVENT, {}, LATER_AT)];
    expect(filmToolWaitView(records, true, NO_CHECKS)).toBeNull();
  });

  it('is nothing for a project whose films need no tool, whatever the log of an earlier configuration holds', () => {
    expect(filmToolWaitView([record(FILM_TOOLS_UNAVAILABLE_EVENT, UNAVAILABLE, FIRST_AT)], false, NO_CHECKS)).toBeNull();
  });

  it('ignores the events of other subjects and an event it cannot read', () => {
    const records = [record(FILM_TOOLS_UNAVAILABLE_EVENT, UNAVAILABLE, FIRST_AT, 'issue/4'), record(FILM_TOOLS_UNAVAILABLE_EVENT, { tool: 'vault' }, FIRST_AT)];
    expect(filmToolWaitView(records, true, NO_CHECKS)).toBeNull();
  });
});
