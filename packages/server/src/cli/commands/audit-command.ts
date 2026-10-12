import { loadAudit, requestOnDemandAudit, RUN_FINISHED_EVENT, RunFinishedPayloadSchema, runSubject, type AuditRecord } from '@agent-factory/application';
import { auditRunner, RoleNotConfiguredError } from '../../composition/use-cases.ts';
import type { FactoryContainer } from '../../composition/factory-container.ts';
import type { CliContext } from '../cli-context.ts';
import { renderAudit, type AuditRunFigures } from '../audit-view.ts';
import { EXIT_CODES } from '../output.ts';
import { abortOnShutdown } from '../shutdown.ts';
import { runningFactory, withFactoryLock } from './factory-running.ts';

const AUDITOR_ROLE_NAME = 'auditor';
const FIRST_SEQUENCE = 0;

async function runFigures(factory: FactoryContainer, audit: AuditRecord): Promise<AuditRunFigures | null> {
  if (audit.conclusion === null) return null;
  const records = await factory.dependencies.events.read(runSubject(audit.conclusion.runId), FIRST_SEQUENCE);
  const finished = records.findLast((record) => record.type === RUN_FINISHED_EVENT);
  if (finished === undefined) return null;
  const { costUsd, durationMs } = RunFinishedPayloadSchema.parse(finished.payload);
  return { costUsd, durationMs };
}

async function auditEach(shas: readonly string[], factory: FactoryContainer, context: CliContext, signal: AbortSignal): Promise<number> {
  const runner = auditRunner(factory);
  if (runner === null) throw new RoleNotConfiguredError(AUDITOR_ROLE_NAME, factory.config.configPath);
  const { events, github } = factory.dependencies;
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
    for (const line of renderAudit(audit, await runFigures(factory, audit))) context.output.line(line);
  }
  return exitCode;
}

async function auditNow(shas: readonly string[], context: CliContext): Promise<number> {
  const config = await context.loadConfig();
  return withFactoryLock(config, async () => {
    const factory = await context.openFactory(config);
    const controller = new AbortController();
    const releaseSignals = abortOnShutdown(controller, context.output);
    try {
      return await auditEach(shas, factory, context, controller.signal);
    } finally {
      releaseSignals();
      factory.close();
    }
  });
}

async function recordOnly(shas: readonly string[], running: number, context: CliContext): Promise<number> {
  const config = await context.loadConfig();
  const factory = await context.openFactory(config);
  try {
    const { events, github } = factory.dependencies;
    for (const sha of shas) {
      const { auditId } = await requestOnDemandAudit({ events, github }, sha);
      context.output.line(`Audit ${auditId} queued; the factory running as process ${running} audits it`);
    }
    return EXIT_CODES.ok;
  } finally {
    factory.close();
  }
}

export async function auditCommand(shas: readonly string[], context: CliContext): Promise<number> {
  const running = await runningFactory(await context.loadConfig());
  return running === null ? auditNow(shas, context) : recordOnly(shas, running, context);
}
