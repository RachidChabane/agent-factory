import type { ToolName, ToolProbeResult } from '@agent-factory/domain';
import type { EventStore, FactoryEventRecord } from '../ports.ts';
import { SETTINGS_SUBJECT, TOOL_CHECKED_EVENT, ToolCheckedPayloadSchema, type ToolCheckedPayload } from './settings-events.ts';

export interface ToolProber {
  probe(tool: ToolName): Promise<ToolProbeResult>;
}

export interface CheckedTool extends ToolCheckedPayload {
  readonly checkedAt: Date;
}

export async function checkTool(events: EventStore, prober: ToolProber, tool: ToolName, operator: string): Promise<ToolProbeResult> {
  const result = await prober.probe(tool);
  const payload: ToolCheckedPayload = { ...result, operator };
  await events.append(TOOL_CHECKED_EVENT, SETTINGS_SUBJECT, payload);
  return result;
}

export function latestToolChecks(records: readonly FactoryEventRecord[]): ReadonlyMap<ToolName, CheckedTool> {
  const latest = new Map<ToolName, CheckedTool>();
  for (const record of records) {
    if (record.subject !== SETTINGS_SUBJECT || record.type !== TOOL_CHECKED_EVENT) continue;
    const parsed = ToolCheckedPayloadSchema.safeParse(record.payload);
    if (parsed.success) latest.set(parsed.data.tool, { ...parsed.data, checkedAt: record.occurredAt });
  }
  return latest;
}
