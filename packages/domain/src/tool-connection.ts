export const TOOL_NAMES = ['gh', 'claude', 'pup', 'tuc', 'gcloud', 'vault', 'avn', 'gws', 'figma', 'sandbox'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const TOOL_STATUSES = ['connected', 'unauthenticated', 'missing', 'error'] as const;
export type ToolStatus = (typeof TOOL_STATUSES)[number];

export const REQUIRED_TOOLS: readonly ToolName[] = ['gh', 'claude', 'sandbox'];

export interface ToolProbeResult {
  readonly tool: ToolName;
  readonly status: ToolStatus;
  readonly version: string | null;
  readonly detail: string;
  readonly fixCommand: string | null;
}
