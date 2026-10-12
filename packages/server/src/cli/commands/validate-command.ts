import type { PreflightStepReport } from '@agent-factory/application';
import type { AgentFactoryConfig, ProjectConfig } from '../../config/agent-factory-config.ts';
import { projectGatePreflight } from '../../composition/project/gate-preflight.ts';
import type { CliContext } from '../cli-context.ts';
import { OFFLINE_FLAG } from '../command-line.ts';
import { EXIT_CODES } from '../output.ts';
import { installationChecks, projectChecks, type CheckOutcome, type CheckSeverity, type ValidationCheck, type ValidationSettings } from './validation-checks.ts';

const OK_MARK = 'ok  ';
const FAIL_MARK = 'FAIL';
const WARN_MARK = 'warn';
const SKIP_MARK = 'skip';
const PREFLIGHT_CHECK = 'gate preflight';
const SANDBOX_CHECK = 'command sandbox';
const SKIPPED_OFFLINE = `not run with ${OFFLINE_FLAG}`;
const SKIPPED_WITHOUT_SANDBOX = 'not run: the command sandbox is not usable';

export interface ValidateOptions {
  readonly offline: boolean;
  readonly gatePreflight: boolean;
}

function mark(outcome: CheckOutcome, severity: CheckSeverity): string {
  if (outcome.ok) return OK_MARK;
  return severity === 'required' ? FAIL_MARK : WARN_MARK;
}

class ValidationReport {
  failures = 0;
  private readonly context: CliContext;

  constructor(context: CliContext) {
    this.context = context;
  }

  record(name: string, outcome: CheckOutcome, severity: CheckSeverity): void {
    if (!outcome.ok && severity === 'required') this.failures += 1;
    this.context.output.line(`${mark(outcome, severity)} ${name}: ${outcome.detail}`);
  }

  skip(name: string, reason: string): void {
    this.context.output.line(`${SKIP_MARK} ${name}: ${reason}`);
  }

  preflight(prefix: string, step: PreflightStepReport): void {
    if (step.blocking) this.failures += 1;
    this.context.output.line(`${step.blocking ? FAIL_MARK : OK_MARK} ${prefix}${PREFLIGHT_CHECK} ${step.phase} ${step.name}: ${step.verdict}: ${step.detail}`);
  }
}

async function runChecks(checks: readonly ValidationCheck[], prefix: string, options: ValidateOptions, report: ValidationReport): Promise<ReadonlyMap<string, CheckOutcome>> {
  const outcomes = new Map<string, CheckOutcome>();
  for (const check of checks) {
    const name = `${prefix}${check.name}`;
    if (options.offline && check.runsCommands) {
      report.skip(name, SKIPPED_OFFLINE);
      continue;
    }
    const outcome = await check.run();
    outcomes.set(check.name, outcome);
    report.record(name, outcome, check.severity);
  }
  return outcomes;
}

async function preflightProject(config: AgentFactoryConfig, project: ProjectConfig, settings: ValidationSettings, report: ValidationReport): Promise<void> {
  const prefix = `${project.id}: `;
  try {
    for (const step of await projectGatePreflight(config, project, settings).run()) report.preflight(prefix, step);
  } catch (error) {
    report.record(`${prefix}${PREFLIGHT_CHECK}`, { ok: false, detail: error instanceof Error ? error.message : String(error) }, 'required');
  }
}

/** Checks the configuration, then everything the installation and each project need; exits non-zero when a required check fails. */
export async function validateCommand(context: CliContext, options: ValidateOptions): Promise<number> {
  const report = new ValidationReport(context);
  let config: AgentFactoryConfig;
  try {
    config = await context.loadConfig();
  } catch (error) {
    report.record('configuration', { ok: false, detail: error instanceof Error ? error.message : String(error) }, 'required');
    return EXIT_CODES.failure;
  }
  report.record('configuration', { ok: true, detail: `${config.configPath}: ${config.projects.map((project) => project.id).join(', ')}` }, 'required');
  const settings: ValidationSettings = { runner: context.runner, environment: context.environment, platform: context.platform, home: context.userHome };
  const installation = await runChecks(installationChecks(config, settings), '', options, report);
  for (const project of config.projects) {
    await runChecks(projectChecks(config, project, settings), `${project.id}: `, options, report);
    const name = `${project.id}: ${PREFLIGHT_CHECK}`;
    if (!options.gatePreflight) continue;
    if (options.offline) report.skip(name, SKIPPED_OFFLINE);
    else if (installation.get(SANDBOX_CHECK)?.ok !== true) report.record(name, { ok: false, detail: SKIPPED_WITHOUT_SANDBOX }, 'required');
    else await preflightProject(config, project, settings, report);
  }
  return report.failures === 0 ? EXIT_CODES.ok : EXIT_CODES.failure;
}
