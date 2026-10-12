import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  buildGhEnvironment,
  buildGitEnvironment,
  FileRolePromptCatalog,
  MacosResourceGuard,
  NonLocalRemoteError,
  RemoteLocalityGuard,
} from '@agent-factory/adapters';
import { AUDIT_LABEL, PIPELINE_ROLES, SPEC_VALIDATED_LABEL, typeLabel, type PreflightStepReport } from '@agent-factory/application';
import type { CommandRunner } from '@agent-factory/application';
import { admitAgentRun, FACTORY_LABEL, ISSUE_TYPES, TOOL_NAMES, REQUIRED_TOOLS, type ToolName, type ToolProbeResult } from '@agent-factory/domain';
import { z } from 'zod';
import type { FactoryConfig } from '../../config/factory-config.ts';
import { checkCommandEnvironment } from '../../config/pipeline-settings-from-config.ts';
import { factoryGitEnvironment, rehearsalRepositories } from '../../composition/github-gateway.ts';
import { definedEnvironment, gatePreflight, toolProber } from '../../composition/tool-checks.ts';
import { ROLE_PROMPTS_DIRECTORY } from '../../composition/install-paths.ts';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES } from '../output.ts';

export const VALIDATION_TIMEOUT_MS = 30_000;
const EXIT_CODE_OK = 0;
const VERSION_FLAG = '--version';
const OK_MARK = 'ok  ';
const FAIL_MARK = 'FAIL';
const WARN_MARK = 'warn';
const COMMAND_SANDBOX_CHECK = 'command sandbox';
const SKIPPED_PREFLIGHT = 'skipped: the command sandbox is not usable';
const PREFLIGHT_CHECK_PREFIX = 'gate preflight';
const SKIPPED_WITHOUT_CONFIG = 'skipped: the configuration did not load';
const ORIGIN_REMOTE = 'origin';
const FETCH_DIRECTION = 'fetch';
const NOT_USED_IN_LOCAL_MODE = 'not used: github.mode is local';
const LABEL_LIST_LIMIT = '1000';
const DEFAULT_LOGIN_DETAIL = 'none configured; agent runs use the default Claude login';
const NOTIFICATIONS_DISABLED = 'disabled: notifications.googleChatWebhookUrl is not configured';
export const REQUIRED_LABELS: readonly string[] = [FACTORY_LABEL, SPEC_VALIDATED_LABEL, AUDIT_LABEL, ...ISSUE_TYPES.map(typeLabel)];
const LabelListSchema = z.array(z.object({ name: z.string() }));

async function labelsOutcome(context: CliContext, config: FactoryConfig): Promise<CheckOutcome> {
  const slug = `${config.target.owner}/${config.target.name}`;
  const listed = await commandOutcome(
    context.runner,
    ['gh', 'label', 'list', '--repo', slug, '--limit', LABEL_LIST_LIMIT, '--json', 'name'],
    buildGhEnvironment(context.environment),
    process.cwd(),
  );
  if (!listed.ok) return listed;
  let names: readonly string[];
  try {
    names = LabelListSchema.parse(JSON.parse(listed.output)).map((label) => label.name);
  } catch (error) {
    return { ok: false, detail: `unexpected label list from ${slug}: ${errorText(error)}` };
  }
  const missing = REQUIRED_LABELS.filter((label) => !names.includes(label));
  return missing.length === 0
    ? { ok: true, detail: `${slug} has every factory label` }
    : { ok: false, detail: `${slug} lacks the labels ${missing.join(', ')}; pull requests and specs cannot carry them` };
}

export interface CheckOutcome {
  readonly ok: boolean;
  readonly detail: string;
}

export const CHECK_SEVERITIES = ['required', 'optional'] as const;
export type CheckSeverity = (typeof CHECK_SEVERITIES)[number];

export interface EnvironmentCheck {
  readonly name: string;
  readonly severity: CheckSeverity;
  run(config: FactoryConfig | null): Promise<CheckOutcome>;
}

export interface ValidateOptions {
  readonly gatePreflight: boolean;
}

function probeOutcome(result: ToolProbeResult): CheckOutcome {
  const version = result.version === null ? '' : ` (${result.version})`;
  const fix = result.fixCommand === null ? '' : `; fix: ${result.fixCommand}`;
  return { ok: result.status === 'connected', detail: `${result.status}${version}: ${result.detail}${fix}` };
}

function toolCheck(context: CliContext, tool: ToolName, name: string = tool): EnvironmentCheck {
  return {
    name,
    severity: REQUIRED_TOOLS.includes(tool) ? 'required' : 'optional',
    run: async (config) => probeOutcome(await toolProber(config, context.environment, context.runner, process.cwd()).probe(tool)),
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function commandOutcome(
  runner: CommandRunner,
  command: readonly string[],
  environment: Readonly<Record<string, string>>,
  cwd: string,
): Promise<CheckOutcome & { readonly output: string }> {
  try {
    const result = await runner.run(command, cwd, VALIDATION_TIMEOUT_MS, environment);
    const output = `${result.stdout}${result.stderr}`.trim();
    const ok = result.exitCode === EXIT_CODE_OK && !result.timedOut;
    return { ok, output, detail: ok ? output.split('\n')[0] ?? '' : `${command.join(' ')} failed: ${output}` };
  } catch (error) {
    return { ok: false, output: '', detail: `${command.join(' ')} could not start: ${errorText(error)}` };
  }
}

async function rehearsalCloneOutcome(context: CliContext, config: FactoryConfig): Promise<CheckOutcome> {
  const guard = new RemoteLocalityGuard(context.runner, factoryGitEnvironment(config, context.environment));
  const bare = config.github.local.bareRepositoryPath;
  try {
    const origin = (await guard.remoteUrls(config.target.clonePath)).find(
      (entry) => entry.remote === ORIGIN_REMOTE && entry.direction === FETCH_DIRECTION,
    );
    if (origin === undefined || resolve(origin.url) !== resolve(bare)) {
      return { ok: false, detail: `${config.target.clonePath} must be a clone of the rehearsal remote ${bare}; run "factory rehearsal init"` };
    }
    await guard.assertLocalOnly(rehearsalRepositories(config));
    return { ok: true, detail: `${config.target.clonePath} (rehearsal remote ${bare})` };
  } catch (error) {
    if (error instanceof NonLocalRemoteError) return { ok: false, detail: error.message };
    return { ok: false, detail: `${config.target.clonePath} is not a rehearsal clone: ${errorText(error)}` };
  }
}

export function environmentChecks(context: CliContext, configError: () => string | null): readonly EnvironmentCheck[] {
  const { runner, environment } = context;
  const cwd = process.cwd();
  return [
    {
      name: 'configuration',
      severity: 'required',
      run: (config) => Promise.resolve(config === null ? { ok: false, detail: configError() ?? 'not loaded' } : { ok: true, detail: config.configPath }),
    },
    { name: 'git', severity: 'required', run: () => commandOutcome(runner, ['git', VERSION_FLAG], buildGitEnvironment(environment), cwd) },
    {
      name: 'gh auth',
      severity: 'required',
      run: (config) =>
        config?.github.mode === 'local' ? Promise.resolve({ ok: true, detail: NOT_USED_IN_LOCAL_MODE }) : toolCheck(context, 'gh').run(config),
    },
    toolCheck(context, 'claude'),
    {
      name: 'target clone',
      severity: 'required',
      run: async (config) => {
        if (config === null) return { ok: false, detail: SKIPPED_WITHOUT_CONFIG };
        if (config.github.mode === 'local') return rehearsalCloneOutcome(context, config);
        const remote = await commandOutcome(
          runner,
          ['git', '-C', config.target.clonePath, 'remote', 'get-url', ORIGIN_REMOTE],
          buildGitEnvironment(environment),
          cwd,
        );
        if (!remote.ok) return { ok: false, detail: `${config.target.clonePath} is not a clone: ${remote.detail}` };
        const slug = `${config.target.owner}/${config.target.name}`;
        return remote.output.includes(slug)
          ? { ok: true, detail: `${config.target.clonePath} (${remote.output})` }
          : { ok: false, detail: `${config.target.clonePath} points at ${remote.output}, not ${slug}` };
      },
    },
    {
      name: 'labels',
      severity: 'required',
      run: (config) => {
        if (config === null) return Promise.resolve({ ok: false, detail: SKIPPED_WITHOUT_CONFIG });
        return config.github.mode === 'local' ? Promise.resolve({ ok: true, detail: NOT_USED_IN_LOCAL_MODE }) : labelsOutcome(context, config);
      },
    },
    {
      name: 'role prompts',
      severity: 'required',
      run: async () => {
        try {
          const catalog = await FileRolePromptCatalog.load(ROLE_PROMPTS_DIRECTORY);
          const missing = PIPELINE_ROLES.filter((role) => !catalog.roles().includes(role));
          return missing.length === 0
            ? { ok: true, detail: ROLE_PROMPTS_DIRECTORY }
            : { ok: false, detail: `no template for ${missing.join(', ')} in ${ROLE_PROMPTS_DIRECTORY}` };
        } catch (error) {
          return { ok: false, detail: errorText(error) };
        }
      },
    },
    { name: 'claude accounts', severity: 'required', run: (config) => accountsOutcome(config) },
    { name: 'notifications', severity: 'required', run: (config) => Promise.resolve(notificationsOutcome(config, environment)) },
    {
      name: 'resources',
      severity: 'required',
      run: async (config) => {
        try {
          const probeEnvironment = config === null ? definedEnvironment(environment) : checkCommandEnvironment(config, environment);
          const snapshot = await new MacosResourceGuard(runner, probeEnvironment).snapshot();
          const summary = `${snapshot.freeMemoryPercent}% free memory, pressure ${snapshot.pressure}`;
          if (config === null) return { ok: true, detail: summary };
          const admission = admitAgentRun(snapshot, config.resources);
          return admission.admitted ? { ok: true, detail: summary } : { ok: false, detail: `${summary}: ${admission.reason}` };
        } catch (error) {
          return { ok: false, detail: errorText(error) };
        }
      },
    },
    toolCheck(context, 'sandbox', COMMAND_SANDBOX_CHECK),
    ...TOOL_NAMES.filter((tool) => !REQUIRED_TOOLS.includes(tool)).map((tool) => toolCheck(context, tool)),
  ];
}

async function accountsOutcome(config: FactoryConfig | null): Promise<CheckOutcome> {
  if (config === null) return { ok: false, detail: SKIPPED_WITHOUT_CONFIG };
  if (config.claude.accounts.length === 0) return { ok: true, detail: DEFAULT_LOGIN_DETAIL };
  const missing: string[] = [];
  for (const account of config.claude.accounts) {
    const present = await stat(account.configDir).then(
      (entry) => entry.isDirectory(),
      () => false,
    );
    if (!present) missing.push(`${account.name} (${account.configDir})`);
  }
  return missing.length === 0
    ? { ok: true, detail: config.claude.accounts.map((account) => account.name).join(', ') }
    : { ok: false, detail: `no login directory for ${missing.join(', ')}; run CLAUDE_CONFIG_DIR=<dir> claude /login` };
}

function notificationsOutcome(config: FactoryConfig | null, environment: Readonly<Record<string, string | undefined>>): CheckOutcome {
  if (config === null) return { ok: false, detail: SKIPPED_WITHOUT_CONFIG };
  const variable = config.notifications.googleChatWebhookVariable;
  if (variable === null) return { ok: true, detail: NOTIFICATIONS_DISABLED };
  const value = environment[variable];
  return value === undefined || value === ''
    ? { ok: false, detail: `${variable} is not set; notifications would not be sent` }
    : { ok: true, detail: `Google Chat webhook from ${variable}` };
}

function mark(outcome: CheckOutcome, severity: CheckSeverity): string {
  if (outcome.ok) return OK_MARK;
  return severity === 'required' ? FAIL_MARK : WARN_MARK;
}

function preflightLine(step: PreflightStepReport): string {
  return `${step.blocking ? FAIL_MARK : OK_MARK} ${PREFLIGHT_CHECK_PREFIX} ${step.phase} ${step.name}: ${step.verdict}: ${step.detail}`;
}

export async function validateCommand(context: CliContext, options: ValidateOptions = { gatePreflight: true }): Promise<number> {
  let config: FactoryConfig | null = null;
  let configFailure: string | null = null;
  try {
    config = await context.loadConfig();
  } catch (error) {
    configFailure = errorText(error);
  }
  let failures = 0;
  let sandboxUsable = false;
  for (const check of environmentChecks(context, () => configFailure)) {
    const outcome = await check.run(config);
    if (!outcome.ok && check.severity === 'required') failures += 1;
    if (check.name === COMMAND_SANDBOX_CHECK) sandboxUsable = outcome.ok;
    context.output.line(`${mark(outcome, check.severity)} ${check.name}: ${outcome.detail}`);
  }
  if (config === null || !options.gatePreflight) return failures === 0 ? EXIT_CODES.ok : EXIT_CODES.failure;
  if (!sandboxUsable) {
    context.output.line(`${FAIL_MARK} ${PREFLIGHT_CHECK_PREFIX}: ${SKIPPED_PREFLIGHT}`);
    return EXIT_CODES.failure;
  }
  for (const step of await gatePreflight(config, context.environment, context.runner).run()) {
    if (step.blocking) failures += 1;
    context.output.line(preflightLine(step));
  }
  return failures === 0 ? EXIT_CODES.ok : EXIT_CODES.failure;
}
