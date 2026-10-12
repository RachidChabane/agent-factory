export const BUILT_IN_TOOLS = ['git', 'gh', 'claude', 'sandbox'] as const;
export type BuiltInTool = (typeof BUILT_IN_TOOLS)[number];

export type ToolName = string;

export const TOOL_STATUSES = ['connected', 'unauthenticated', 'missing', 'error'] as const;
/** How a tool's login or the keep-alive of its session ended. */
export const TOOL_SESSION_OUTCOMES = ['succeeded', 'failed', 'timed-out'] as const;
export type ToolSessionOutcome = (typeof TOOL_SESSION_OUTCOMES)[number];
export type ToolStatus = (typeof TOOL_STATUSES)[number];

export const REQUIRED_TOOLS: readonly ToolName[] = ['gh', 'claude', 'sandbox'];

export function isBuiltInTool(tool: ToolName): tool is BuiltInTool {
  return BUILT_IN_TOOLS.some((builtIn) => builtIn === tool);
}

export interface ToolProbeResult {
  readonly tool: ToolName;
  readonly status: ToolStatus;
  readonly version: string | null;
  readonly detail: string;
  readonly fixCommand: string | null;
}
