import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AgentHarness, AgentRunEvent, AgentRunRequest, AgentRunResult } from '@agent-factory/application';
import type { AuditVerdict } from '@agent-factory/domain';

const MANIFEST_PATH = '.factory/acceptance.json';
const EMPTY_MANIFEST = { checks: [], command: null, evidence: [], score: null };
const NO_FINDINGS = 'The change is sound.\n\n```json\n{ "findings": [] }\n```';
const USAGE = { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0 };
const RUN_COST_USD = 0.01;
const RUN_DURATION_MS = 10;
const RUN_TURNS = 2;

async function write(root: string, path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

function verdictAnswer(verdict: AuditVerdict): string {
  const block = {
    verdict,
    summary: 'The change reached main without a test.',
    findings: [{ level: 'method', statement: 'no test covers the change', evidence: 'NOTES.md:1' }],
    proposedFix: verdict === 'keep' ? null : 'add a test',
  };
  return `Audited.\n\n\`\`\`json\n${JSON.stringify(block)}\n\`\`\``;
}

export const DECISION_QUESTION = 'Should the page list the release owners by name or by team?';

export class RehearsalAgents implements AgentHarness {
  readonly requests: AgentRunRequest[] = [];
  auditVerdict: AuditVerdict = 'challenge';
  decisionsToAsk = 0;

  async run(request: AgentRunRequest, onEvent: (event: AgentRunEvent) => void, signal: AbortSignal): Promise<AgentRunResult> {
    this.requests.push(request);
    const sessionId = `session-${request.runId}`;
    onEvent({ kind: 'session-started', sessionId, model: request.model });
    onEvent({ kind: 'rate-limit', snapshots: [{ window: 'five_hour', utilization: 0.2, resetsAt: new Date(Date.now() + 3_600_000) }] });
    const asking = request.role === 'implementer' && request.decisionRequestPath !== null && this.decisionsToAsk > 0;
    if (asking && request.decisionRequestPath !== null) {
      this.decisionsToAsk -= 1;
      await write(request.workingDirectory, request.decisionRequestPath, `${DECISION_QUESTION}\n`);
    }
    const finalText = asking ? DECISION_QUESTION : await this.act(request);
    onEvent({ kind: 'assistant-text', text: finalText, parentToolUseId: null });
    return {
      runId: request.runId,
      sessionId,
      outcome: signal.aborted ? 'aborted' : asking ? 'decision-requested' : 'success',
      finalText,
      costUsd: RUN_COST_USD,
      usage: USAGE,
      durationMs: RUN_DURATION_MS,
      turns: RUN_TURNS,
      gateBlocks: 0,
      rawLogPath: '',
    };
  }

  private async act(request: AgentRunRequest): Promise<string> {
    switch (request.role) {
      case 'acceptance-author':
        await write(request.workingDirectory, MANIFEST_PATH, JSON.stringify(EMPTY_MANIFEST));
        return 'This documentation issue needs no acceptance check.';
      case 'implementer':
        await write(request.workingDirectory, `docs/issue-${request.context.subject.id}.md`, `# Issue ${request.context.subject.id}\n\nDocumented.\n`);
        return 'Documented.';
      case 'reviewer':
        return NO_FINDINGS;
      case 'auditor':
        return verdictAnswer(this.auditVerdict);
      default:
        return 'Nothing to do.';
    }
  }
}
