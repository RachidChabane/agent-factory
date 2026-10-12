import { describe, expect, it } from 'vitest';
import type { SettingsChange, ToolName, ToolProbeResult } from '@agent-factory/domain';
import { InMemoryEventStore } from '../audit/testing/fakes.ts';
import { ChangeSettings, SettingsChangeRefusedError, type SettingsDocument } from './change-settings.ts';
import { SETTINGS_CHANGED_EVENT, SETTINGS_SUBJECT, SettingsChangedPayloadSchema, TOOL_CHECKED_EVENT } from './settings-events.ts';
import { checkTool, latestToolChecks, type ToolProber } from './tool-checks.ts';

class RecordingDocument implements SettingsDocument {
  readonly applied: SettingsChange[] = [];

  apply(change: SettingsChange): Promise<{ readonly backupPath: string }> {
    this.applied.push(change);
    return Promise.resolve({ backupPath: `/factory/config-backups/config-${this.applied.length}.yaml` });
  }
}

const ROLE: SettingsChange = { kind: 'role', role: 'reviewer', model: 'opus', effort: 'high', maxBudgetUsd: 3, maxTurns: 60 };

describe('settings changes', () => {
  it('writes a valid change to the document and records who changed what, with the backup', async () => {
    const events = new InMemoryEventStore();
    const document = new RecordingDocument();
    const sequence = await new ChangeSettings({ events, document }).change(ROLE, 'alex');
    expect(document.applied).toEqual([ROLE]);
    const record = events.records.find((entry) => entry.sequence === sequence);
    expect(record?.type).toBe(SETTINGS_CHANGED_EVENT);
    expect(SettingsChangedPayloadSchema.parse(record?.payload)).toEqual({ change: ROLE, operator: 'alex', backupPath: '/factory/config-backups/config-1.yaml' });
  });

  it('refuses a change outside the sane bounds before touching the document', async () => {
    const events = new InMemoryEventStore();
    const document = new RecordingDocument();
    const change: SettingsChange = { kind: 'limits', concurrentIssues: 1, minimumFreeMemoryPercent: 5, pauseAbovePressure: 'critical' };
    const refused = new ChangeSettings({ events, document }).change(change, 'alex');
    await expect(refused).rejects.toBeInstanceOf(SettingsChangeRefusedError);
    await expect(refused).rejects.toMatchObject({ problems: [expect.stringContaining('free-memory'), expect.stringContaining('critical')] });
    expect(document.applied).toEqual([]);
    expect(events.typesOf(SETTINGS_SUBJECT)).toEqual([]);
  });
});

describe('tool checks', () => {
  it('records each probe and keeps the latest result per tool', async () => {
    const events = new InMemoryEventStore();
    const results: Record<string, ToolProbeResult> = {
      cloud: { tool: 'cloud', status: 'unauthenticated', version: null, detail: 'no auth credentials found', fixCommand: 'cloud auth login' },
    };
    const prober: ToolProber = {
      probe: (tool: ToolName) => Promise.resolve(results[tool] ?? { tool, status: 'connected', version: '1.0.0', detail: 'ok', fixCommand: null }),
    };
    await checkTool(events, prober, 'cloud', 'alex');
    results['cloud'] = { tool: 'cloud', status: 'connected', version: '2.4.0', detail: 'logged in', fixCommand: null };
    await checkTool(events, prober, 'cloud', 'alex');
    await checkTool(events, prober, 'gh', 'alex');
    expect(events.typesOf(SETTINGS_SUBJECT)).toEqual([TOOL_CHECKED_EVENT, TOOL_CHECKED_EVENT, TOOL_CHECKED_EVENT]);
    const latest = latestToolChecks(events.records);
    expect([...latest.keys()]).toEqual(['cloud', 'gh']);
    expect(latest.get('cloud')).toMatchObject({ status: 'connected', version: '2.4.0', operator: 'alex' });
  });
});
