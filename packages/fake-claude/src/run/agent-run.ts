import type { Clock } from '../clock.ts';
import { HookDispatcher, type StopVerdict } from '../hooks/hook-dispatcher.ts';
import type { HookRunner } from '../hooks/hook-runner.ts';
import type { HookConfiguration } from '../hooks/hook-settings.ts';
import { DEFAULT_FINAL_TEXT, type Scenario, type Script } from '../scenario/scenario.ts';
import { resolveScript, selectScript } from '../scenario/script-selection.ts';
import type { SessionRecord } from '../session/session-record.ts';
import type { SessionStore } from '../session/session-store.ts';
import type { StreamSink } from '../stream/stream-sink.ts';
import { rateLimitWindowsOf } from '../usage-report/rate-limits.ts';
import type { WorkingTree } from '../workspace/working-tree.ts';
import { RunNarrator } from './run-narrator.ts';
import { RunStage } from './run-stage.ts';
import { actionFor } from './step-actions.ts';

export interface AgentRunSettings {
  readonly prompt: string;
  readonly scenario: Scenario;
  readonly hooks: HookConfiguration;
  readonly model: string;
  readonly permissionMode: string;
  readonly effort: string | null;
  readonly tools: readonly string[];
  readonly resumeSessionId: string | null;
  readonly stopHookBlockCap: number;
  readonly workingDirectory: string;
}

export interface AgentRunPorts {
  readonly sessions: SessionStore;
  readonly tree: WorkingTree;
  readonly hookRunner: HookRunner;
  readonly clock: Clock;
  readonly streamTo: (transcriptPath: string) => StreamSink;
}

interface OpenedSession {
  readonly record: SessionRecord;
  readonly script: Script;
}

export async function runAgent(settings: AgentRunSettings, ports: AgentRunPorts): Promise<void> {
  const { record, script } = await openSession(settings, ports.sessions);
  const transcriptPath = ports.sessions.transcriptPath(record.sessionId);
  const narrator = new RunNarrator(ports.streamTo(transcriptPath), {
    sessionId: record.sessionId,
    runNumber: record.runs,
    model: settings.model,
    promptCharacters: settings.prompt.length,
  });
  const hooks = new HookDispatcher(settings.hooks, ports.hookRunner, narrator, {
    sessionId: record.sessionId,
    transcriptPath,
    workingDirectory: settings.workingDirectory,
    permissionMode: settings.permissionMode,
    effort: settings.effort,
    promptId: narrator.promptId,
  });
  const stage = new RunStage(narrator, hooks, ports.tree);
  await new AgentRun(settings, ports, { record, script, narrator, hooks, stage }).execute();
}

async function openSession(settings: AgentRunSettings, sessions: SessionStore): Promise<OpenedSession> {
  if (settings.resumeSessionId !== null) {
    const record = await sessions.resume(settings.resumeSessionId);
    return { record, script: resolveScript(settings.scenario, record.script) };
  }
  const selected = selectScript(settings.scenario, settings.prompt);
  return { record: await sessions.begin(selected.reference), script: selected.script };
}

interface RunParts extends OpenedSession {
  readonly narrator: RunNarrator;
  readonly hooks: HookDispatcher;
  readonly stage: RunStage;
}

class AgentRun {
  readonly #settings: AgentRunSettings;
  readonly #ports: AgentRunPorts;
  readonly #script: Script;
  readonly #narrator: RunNarrator;
  readonly #hooks: HookDispatcher;
  readonly #stage: RunStage;
  #record: SessionRecord;

  constructor(settings: AgentRunSettings, ports: AgentRunPorts, parts: RunParts) {
    this.#settings = settings;
    this.#ports = ports;
    this.#script = parts.script;
    this.#narrator = parts.narrator;
    this.#hooks = parts.hooks;
    this.#stage = parts.stage;
    this.#record = parts.record;
  }

  async execute(): Promise<void> {
    await this.#narrator.open({
      workingDirectory: this.#settings.workingDirectory,
      tools: this.#settings.tools,
      permissionMode: this.#settings.permissionMode,
      rateLimits: rateLimitWindowsOf(this.#settings.scenario.usage, this.#ports.clock.now()),
    });
    let honouredBlocks = 0;
    let verdict = await this.#playThenStop(false);
    while (verdict.blocked && honouredBlocks < this.#settings.stopHookBlockCap) {
      honouredBlocks += 1;
      await this.#narrator.stopHookFeedback(verdict.feedback);
      verdict = await this.#playThenStop(true);
    }
    await this.#narrator.close();
  }

  async #playThenStop(stopHookActive: boolean): Promise<StopVerdict> {
    await this.#playNextSlot();
    return this.#hooks.onStop({ stopHookActive, lastAssistantMessage: this.#narrator.lastAssistantText });
  }

  async #playNextSlot(): Promise<void> {
    const slot = this.#record.nextSlot;
    for (const step of this.#script.attempts[slot]?.steps ?? []) {
      await actionFor(step, this.#ports.tree).perform(this.#stage);
    }
    await this.#narrator.say(closingTextOf(this.#script, slot));
    this.#record = { ...this.#record, nextSlot: slot + 1 };
    await this.#ports.sessions.save(this.#record);
  }
}

function closingTextOf(script: Script, slot: number): string {
  const attempt = script.attempts[slot] ?? script.attempts.at(-1);
  return attempt?.final ?? DEFAULT_FINAL_TEXT;
}
