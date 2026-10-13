export const BUILT_IN_TOOLS = ['git', 'gh', 'claude', 'sandbox'] as const;
export type BuiltInTool = (typeof BUILT_IN_TOOLS)[number];

export type ToolName = string;

export const TOOL_STATUSES = ['connected', 'unauthenticated', 'missing', 'error'] as const;
/** The statuses of a tool that cannot be used as it is: every status but `connected`. */
export const TOOL_FAILURE_STATUSES = ['unauthenticated', 'missing', 'error'] as const satisfies readonly (typeof TOOL_STATUSES)[number][];
export type ToolFailureStatus = (typeof TOOL_FAILURE_STATUSES)[number];
/** How a tool's login or the keep-alive of its session ended. */
export const TOOL_SESSION_OUTCOMES = ['succeeded', 'failed', 'timed-out'] as const;
export type ToolSessionOutcome = (typeof TOOL_SESSION_OUTCOMES)[number];
export type ToolStatus = (typeof TOOL_STATUSES)[number];

export const REQUIRED_TOOLS: readonly ToolName[] = ['gh', 'claude', 'sandbox'];

export function isToolFailure(status: ToolStatus): status is ToolFailureStatus {
  return status !== 'connected';
}

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
