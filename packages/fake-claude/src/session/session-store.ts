import type { ScriptReference } from '../scenario/script-reference.ts';
import type { SessionRecord } from './session-record.ts';

export interface SessionStore {
  begin(script: ScriptReference): Promise<SessionRecord>;
  resume(sessionId: string): Promise<SessionRecord>;
  save(record: SessionRecord): Promise<void>;
  transcriptPath(sessionId: string): string;
}
