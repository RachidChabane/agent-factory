import { z } from 'zod';
import { STREAM_FACTORY_EVENT, STREAM_RUN_LOG_EVENT, STREAM_TELEMETRY_EVENT } from '../contract/index.ts';

/** The name the tabs of a browser agree on to elect the one that holds the event stream. */
export const STREAM_LOCK_NAME = 'agent-factory-cockpit-event-stream';
/** The channel the leading tab relays the frames of the stream on. */
export const STREAM_CHANNEL_NAME = 'agent-factory-cockpit-event-stream';
export const FRAME_CHANNELS = [STREAM_FACTORY_EVENT, STREAM_RUN_LOG_EVENT, STREAM_TELEMETRY_EVENT] as const;
export type FrameChannel = (typeof FRAME_CHANNELS)[number];

export const StreamMessageSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hello') }),
  z.object({ kind: z.literal('open') }),
  z.object({ kind: z.literal('disconnect') }),
  z.object({ kind: z.literal('frame'), channel: z.enum(FRAME_CHANNELS), data: z.string() }),
]);
export type StreamMessage = z.infer<typeof StreamMessageSchema>;

const SEQUENCE_PATTERN = /"sequence"\s*:\s*(\d+)/;

/** The sequence a factory event frame carries, or null when it carries none. */
export function sequenceOfFrame(data: string): number | null {
  const match = SEQUENCE_PATTERN.exec(data);
  return match?.[1] === undefined ? null : Number(match[1]);
}
