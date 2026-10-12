import { z } from 'zod';

export const LineEnvelopeSchema = z.object({
  type: z.string(),
  subtype: z.string().optional(),
  session_id: z.string().optional(),
});

export const SystemInitSchema = z.object({
  type: z.literal('system'),
  subtype: z.literal('init'),
  session_id: z.string(),
  model: z.string(),
});

export const HookResponseSchema = z.object({
  type: z.literal('system'),
  subtype: z.literal('hook_response'),
  hook_event: z.string(),
  hook_name: z.string().optional(),
  exit_code: z.number().int().nullable().optional(),
  output: z.string().optional(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
});

export const PermissionDeniedSchema = z.object({
  type: z.literal('system'),
  subtype: z.literal('permission_denied'),
  tool_name: z.string(),
  message: z.string(),
});

export const TextBlockSchema = z.object({ type: z.literal('text'), text: z.string() });

export const ThinkingBlockSchema = z.object({ type: z.enum(['thinking', 'redacted_thinking']) });

export const ToolUseBlockSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.unknown(),
});

export const AssistantSchema = z.object({
  type: z.literal('assistant'),
  parent_tool_use_id: z.string().nullable().optional(),
  message: z.object({ content: z.array(z.unknown()) }),
});

const ToolResultPartSchema = z.object({ type: z.string(), text: z.string().optional() });

export const ToolResultBlockSchema = z.object({
  type: z.literal('tool_result'),
  tool_use_id: z.string(),
  is_error: z.boolean().optional(),
  content: z.union([z.string(), z.array(ToolResultPartSchema)]).optional(),
});

export const UserSchema = z.object({
  type: z.literal('user'),
  message: z.object({ content: z.union([z.string(), z.array(z.unknown())]) }),
});

const RateLimitWindowSchema = z.object({
  utilization: z.number().nonnegative(),
  resetsAt: z.number().nonnegative(),
});

export const RateLimitEventSchema = z.object({
  type: z.literal('rate_limit_event'),
  rate_limit_info: z.object({
    unifiedWindows: z
      .object({
        five_hour: RateLimitWindowSchema.optional(),
        seven_day: RateLimitWindowSchema.optional(),
      })
      .optional(),
  }),
});

export const ResultSchema = z.object({
  type: z.literal('result'),
  subtype: z.string(),
  is_error: z.boolean(),
  session_id: z.string().optional(),
  result: z.string().optional(),
  total_cost_usd: z.number().nonnegative().optional(),
  duration_ms: z.number().nonnegative().optional(),
  num_turns: z.number().int().nonnegative().optional(),
  usage: z
    .object({
      input_tokens: z.number().nonnegative(),
      output_tokens: z.number().nonnegative(),
      cache_read_input_tokens: z.number().nonnegative().optional(),
      cache_creation_input_tokens: z.number().nonnegative().optional(),
    })
    .optional(),
});

export type ResultLine = z.infer<typeof ResultSchema>;

const MessageUsageSchema = z.object({
  input_tokens: z.number().nonnegative().nullable().optional(),
  output_tokens: z.number().nonnegative().nullable().optional(),
  cache_read_input_tokens: z.number().nonnegative().nullable().optional(),
  cache_creation_input_tokens: z.number().nonnegative().nullable().optional(),
});
export type MessageUsage = z.infer<typeof MessageUsageSchema>;

export const AssistantUsageSchema = z.object({
  type: z.literal('assistant'),
  parent_tool_use_id: z.string().nullable().optional(),
  message: z.object({ id: z.string().min(1), usage: MessageUsageSchema }),
});

export const MessageStartSchema = z.object({
  type: z.literal('stream_event'),
  parent_tool_use_id: z.string().nullable().optional(),
  event: z.object({ type: z.literal('message_start'), message: z.object({ id: z.string().min(1), usage: MessageUsageSchema }) }),
});

export const MessageDeltaSchema = z.object({
  type: z.literal('stream_event'),
  event: z.object({ type: z.literal('message_delta'), usage: MessageUsageSchema }),
});
