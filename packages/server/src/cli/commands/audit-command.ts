import { loadAudit, requestOnDemandAudit, RUN_FINISHED_EVENT, RunFinishedPayloadSchema, runSubject, type AuditRecord, type EventStore } from '@agent-factory/application';
import { auditRunner } from '../../composition/project/project-use-cases.ts';
import type { CliContext } from '../cli-context.ts';
import { renderAudit, type AuditRunFigures } from '../audit-view.ts';
import { EXIT_CODES } from '../output.ts';
import { abortOnShutdown } from '../shutdown.ts';
import { runningFactory, withFactoryLock } from './factory-running.ts';
import { selectedProject, withAgentSession, withProjectSession, type ProjectSession, type SelectedProject } from './project-session.ts';

const FIRST_SEQUENCE = 0;

/** What the audit's run cost; runs are recorded in the installation's log, not the project's. */
async function runFigures(installationEvents: EventStore, audit: AuditRecord): Promise<AuditRunFigures | null> {
  if (audit.conclusion === null) return null;
  const records = await installationEvents.read(runSubject(audit.conclusion.runId), FIRST_SEQUENCE);
  const finished = records.findLast((record) => record.type === RUN_FINISHED_EVENT);
  if (finished === undefined) return null;
  const { costUsd, durationMs } = RunFinishedPayloadSchema.parse(finished.payload);
  return { costUsd, durationMs };
}

async function auditEach(shas: readonly string[], { installation, project }: ProjectSession, context: CliContext, signal: AbortSignal): Promise<number> {
  const runner = auditRunner(project);
  const { events, github } = project.dependencies;
  let exitCode: number = EXIT_CODES.ok;
  for (const sha of shas) {
    if (signal.aborted) return EXIT_CODES.failure;
    const { auditId, alreadyRecorded } = await requestOnDemandAudit({ events, github }, sha);
    if (alreadyRecorded) context.output.line(`Audit ${auditId} was already recorded`);
    const outcome = await runner.audit(auditId, signal);
    if (outcome.status === 'failed') {
      context.output.error(`The audit of ${auditId} failed: ${outcome.reason}`);
      exitCode = EXIT_CODES.failure;
      continue;
    }
    const audit = await loadAudit(events, auditId);
    if (audit === null) continue;
    for (const line of renderAudit(audit, await runFigures(installation.events, audit))) context.output.line(line);
  }
  return exitCode;
}

async function auditNow(shas: readonly string[], selected: SelectedProject, context: CliContext): Promise<number> {
  return withFactoryLock(selected.config, () =>
    withAgentSession(context, selected, async (session) => {
      const controller = new AbortController();
      const releaseSignals = abortOnShutdown(controller, context.output);
      try {
        return await auditEach(shas, session, context, controller.signal);
      } finally {
        releaseSignals();
      }
    }),
  );
}

async function recordOnly(shas: readonly string[], running: number, selected: SelectedProject, context: CliContext): Promise<number> {
  return withProjectSession(context, selected, async ({ project }) => {
    const { events, github } = project.dependencies;
    for (const sha of shas) {
      const { auditId } = await requestOnDemandAudit({ events, github }, sha);
      context.output.line(`Audit ${auditId} of ${project.id} queued; the factory running as process ${running} audits it`);
    }
    return EXIT_CODES.ok;
  });
}

export async function auditCommand(shas: readonly string[], requested: string | null, context: CliContext): Promise<number> {
  const selected = await selectedProject(context, requested);
  const running = await runningFactory(selected.config);
  return running === null ? auditNow(shas, selected, context) : recordOnly(shas, running, selected, context);
}
