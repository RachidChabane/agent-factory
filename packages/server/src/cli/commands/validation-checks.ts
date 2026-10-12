import { stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  buildGhEnvironment,
  buildGitEnvironment,
  createResourceGuard,
  FileRolePromptCatalog,
  LayeredRolePromptCatalog,
  NonLocalRemoteError,
  RemoteLocalityGuard,
} from '@agent-factory/adapters';
import { PIPELINE_ROLES, requiredLabels, type CommandRunner, type ToolProber } from '@agent-factory/application';
import { admitAgentRun, REQUIRED_TOOLS, type ToolProbeResult } from '@agent-factory/domain';
import { z } from 'zod';
import type { AgentFactoryConfig, NotificationChannelConfig, ProjectConfig } from '../../config/agent-factory-config.ts';
import { ROLE_PROMPTS_DIRECTORY } from '../../composition/install-paths.ts';
import type { SourceEnvironment } from '../../composition/installation/installation-context.ts';
import { builtInTools, definedEnvironment, installationToolProber, projectToolProber, type ToolProberSettings } from '../../composition/installation/tools.ts';
import { projectGitEnvironment, rehearsalRepositories } from '../../composition/project/forge.ts';
import { projectConventions } from '../../composition/project/project-settings.ts';

export const VALIDATION_TIMEOUT_MS = 30_000;
const EXIT_CODE_OK = 0;
const VERSION_FLAG = '--version';
const ORIGIN_REMOTE = 'origin';
const FETCH_DIRECTION = 'fetch';
const LABEL_LIST_LIMIT = '1000';
const DEFAULT_LOGIN_DETAIL = 'none configured; agent runs use the default Claude login';
const NO_CHANNEL_DETAIL = 'no channel configured; notices appear only in the cockpit';
const LabelListSchema = z.array(z.object({ name: z.string() }));

export interface CheckOutcome {
  readonly ok: boolean;
  readonly detail: string;
}

export const CHECK_SEVERITIES = ['required', 'optional'] as const;
export type CheckSeverity = (typeof CHECK_SEVERITIES)[number];

export interface ValidationCheck {
  readonly name: string;
  readonly severity: CheckSeverity;
  /** Whether the check runs commands, so that `validate --offline` leaves it out. */
  readonly runsCommands: boolean;
  run(): Promise<CheckOutcome>;
}

export interface ValidationSettings {
  readonly runner: CommandRunner;
  readonly environment: SourceEnvironment;
  readonly platform: string;
  readonly home: string;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function guarded(work: () => Promise<CheckOutcome>): Promise<CheckOutcome> {
  try {
    return await work();
  } catch (error) {
    return { ok: false, detail: errorText(error) };
  }
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
    return { ok, output, detail: ok ? (output.split('\n')[0] ?? '') : `${command.join(' ')} failed: ${output}` };
  } catch (error) {
    return { ok: false, output: '', detail: `${command.join(' ')} could not start: ${errorText(error)}` };
  }
}

function probeOutcome(result: ToolProbeResult): CheckOutcome {
  const version = result.version === null ? '' : ` (${result.version})`;
  const fix = result.fixCommand === null ? '' : `; fix: ${result.fixCommand}`;
  return { ok: result.status === 'connected', detail: `${result.status}${version}: ${result.detail}${fix}` };
}

function toolCheck(prober: ToolProber, tool: string, severity: CheckSeverity, name: string = tool): ValidationCheck {
  return { name, severity, runsCommands: true, run: () => guarded(async () => probeOutcome(await prober.probe(tool))) };
}

async function isDirectory(path: string): Promise<boolean> {
  return stat(path).then(
    (entry) => entry.isDirectory(),
    () => false,
  );
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

async function accountsOutcome(config: AgentFactoryConfig): Promise<CheckOutcome> {
  if (config.claude.accounts.length === 0) return { ok: true, detail: DEFAULT_LOGIN_DETAIL };
  const missing: string[] = [];
  for (const account of config.claude.accounts) {
    if (!(await isDirectory(account.configDir))) missing.push(`${account.name} (${account.configDir})`);
  }
  return missing.length === 0
    ? { ok: true, detail: config.claude.accounts.map((account) => `${account.name} (${account.billing})`).join(', ') }
    : { ok: false, detail: `no login directory for ${missing.join(', ')}; run CLAUDE_CONFIG_DIR=<dir> claude /login` };
}

function channelProblem(channel: NotificationChannelConfig, environment: SourceEnvironment): string | null {
  const variable = channel.kind === 'google-chat' || channel.kind === 'slack' ? channel.webhookVariable : channel.kind === 'webhook' ? channel.urlVariable : null;
  if (variable === null) return null;
  const value = environment[variable];
  return value === undefined || value === '' ? `${channel.kind}: ${variable} is not set` : null;
}

function notificationsOutcome(config: AgentFactoryConfig, environment: SourceEnvironment): CheckOutcome {
  const { channels } = config.notifications;
  if (channels.length === 0) return { ok: true, detail: NO_CHANNEL_DETAIL };
  const problems = channels.flatMap((channel) => {
    const problem = channelProblem(channel, environment);
    return problem === null ? [] : [problem];
  });
  return problems.length === 0 ? { ok: true, detail: channels.map((channel) => channel.kind).join(', ') } : { ok: false, detail: `${problems.join('; ')}; notices would not be sent` };
}

async function rolePromptsOutcome(): Promise<CheckOutcome> {
  const catalog = await FileRolePromptCatalog.load(ROLE_PROMPTS_DIRECTORY);
  const missing = PIPELINE_ROLES.filter((role) => !catalog.roles().includes(role));
  return missing.length === 0 ? { ok: true, detail: ROLE_PROMPTS_DIRECTORY } : { ok: false, detail: `no template for ${missing.join(', ')} in ${ROLE_PROMPTS_DIRECTORY}` };
}

async function resourcesOutcome(config: AgentFactoryConfig, settings: ValidationSettings): Promise<CheckOutcome> {
  const snapshot = await createResourceGuard(settings.platform, settings.runner, definedEnvironment(settings.environment)).snapshot();
  const summary = `${snapshot.freeMemoryPercent}% free memory, pressure ${snapshot.pressure}`;
  const admission = admitAgentRun(snapshot, config.resources);
  return admission.admitted ? { ok: true, detail: summary } : { ok: false, detail: `${summary}: ${admission.reason}` };
}

function proberSettings(config: AgentFactoryConfig, settings: ValidationSettings): ToolProberSettings {
  return { runner: settings.runner, environment: settings.environment, platform: settings.platform, workingDirectory: config.home };
}

/** What the whole installation needs: the built-in tools, the logins, the channels, the machine and the declared tools. */
export function installationChecks(config: AgentFactoryConfig, settings: ValidationSettings): readonly ValidationCheck[] {
  const prober = installationToolProber(config, proberSettings(config, settings));
  const builtIn = builtInTools(config).map((tool): ValidationCheck =>
    tool === 'git'
      ? { name: 'git', severity: 'required', runsCommands: true, run: () => commandOutcome(settings.runner, ['git', VERSION_FLAG], buildGitEnvironment(settings.environment), config.home) }
      : toolCheck(prober, tool, REQUIRED_TOOLS.includes(tool) ? 'required' : 'optional', tool === 'sandbox' ? 'command sandbox' : tool),
  );
  return [
    ...builtIn,
    { name: 'role prompts', severity: 'required', runsCommands: false, run: () => guarded(rolePromptsOutcome) },
    { name: 'claude accounts', severity: 'required', runsCommands: false, run: () => guarded(() => accountsOutcome(config)) },
    { name: 'notifications', severity: 'required', runsCommands: false, run: () => Promise.resolve(notificationsOutcome(config, settings.environment)) },
    { name: 'resources', severity: 'required', runsCommands: true, run: () => guarded(() => resourcesOutcome(config, settings)) },
    ...config.tools.map((tool) => toolCheck(prober, tool.name, 'optional', `tool ${tool.name}`)),
  ];
}

async function labelsOutcome(project: ProjectConfig, settings: ValidationSettings, cwd: string): Promise<CheckOutcome> {
  const slug = `${project.repository.owner}/${project.repository.name}`;
  const listed = await commandOutcome(settings.runner, ['gh', 'label', 'list', '--repo', slug, '--limit', LABEL_LIST_LIMIT, '--json', 'name'], buildGhEnvironment(settings.environment), cwd);
  if (!listed.ok) return listed;
  let names: readonly string[];
  try {
    names = LabelListSchema.parse(JSON.parse(listed.output)).map((label) => label.name);
  } catch (error) {
    return { ok: false, detail: `unexpected label list from ${slug}: ${errorText(error)}` };
  }
  const missing = requiredLabels(projectConventions(project)).filter((label) => !names.includes(label));
  return missing.length === 0
    ? { ok: true, detail: `${slug} has every label the project uses` }
    : { ok: false, detail: `${slug} lacks the labels ${missing.join(', ')}; specs and pull requests cannot carry them` };
}

async function localCloneOutcome(project: ProjectConfig, settings: ValidationSettings): Promise<CheckOutcome> {
  if (project.forge.kind !== 'local') return { ok: false, detail: `${project.id} has no local forge` };
  const guard = new RemoteLocalityGuard(settings.runner, projectGitEnvironment(project, settings.environment));
  const bare = project.forge.bareRepositoryPath;
  try {
    const origin = (await guard.remoteUrls(project.clonePath)).find((entry) => entry.remote === ORIGIN_REMOTE && entry.direction === FETCH_DIRECTION);
    if (origin === undefined || resolve(origin.url) !== resolve(bare)) {
      return { ok: false, detail: `${project.clonePath} must be a clone of the local forge ${bare}; run "agent-factory --project ${project.id} rehearsal init <source-clone>"` };
    }
    await guard.assertLocalOnly(rehearsalRepositories(project));
    return { ok: true, detail: `${project.clonePath} (local forge ${bare})` };
  } catch (error) {
    if (error instanceof NonLocalRemoteError) return { ok: false, detail: error.message };
    return { ok: false, detail: `${project.clonePath} is not a clone of the local forge: ${errorText(error)}` };
  }
}

async function githubCloneOutcome(project: ProjectConfig, settings: ValidationSettings, cwd: string): Promise<CheckOutcome> {
  const remote = await commandOutcome(settings.runner, ['git', '-C', project.clonePath, 'remote', 'get-url', ORIGIN_REMOTE], buildGitEnvironment(settings.environment), cwd);
  if (!remote.ok) return { ok: false, detail: `${project.clonePath} is not a clone: ${remote.detail}` };
  const slug = `${project.repository.owner}/${project.repository.name}`;
  return remote.output.includes(slug) ? { ok: true, detail: `${project.clonePath} (${remote.output})` } : { ok: false, detail: `${project.clonePath} points at ${remote.output}, not ${slug}` };
}

async function promptOverridesOutcome(project: ProjectConfig): Promise<CheckOutcome> {
  const overridden = Object.keys(project.prompts);
  if (overridden.length === 0) return { ok: true, detail: 'the built-in prompts' };
  await LayeredRolePromptCatalog.load(await FileRolePromptCatalog.load(ROLE_PROMPTS_DIRECTORY), project.prompts);
  return { ok: true, detail: `overridden for ${overridden.join(', ')}` };
}

async function knowledgeOutcome(project: ProjectConfig): Promise<CheckOutcome> {
  if (project.knowledge.length === 0) return { ok: true, detail: 'no source declared' };
  const paths = project.knowledge.map((source) => (source.kind === 'path' ? source.path : join(project.clonePath, source.path)));
  const missing: string[] = [];
  for (const path of paths) if (!(await exists(path))) missing.push(path);
  return missing.length === 0 ? { ok: true, detail: paths.join(', ') } : { ok: false, detail: `missing: ${missing.join(', ')}` };
}

/** What one project needs: its clone, its labels, its prompts and knowledge, and its declared tools. */
export function projectChecks(config: AgentFactoryConfig, project: ProjectConfig, settings: ValidationSettings): readonly ValidationCheck[] {
  const cwd = config.home;
  const prober = projectToolProber(project, proberSettings(config, settings));
  return [
    {
      name: 'clone',
      severity: 'required',
      runsCommands: true,
      run: () => guarded(() => (project.forge.kind === 'local' ? localCloneOutcome(project, settings) : githubCloneOutcome(project, settings, cwd))),
    },
    ...(project.forge.kind === 'github' ? [{ name: 'labels', severity: 'required', runsCommands: true, run: () => guarded(() => labelsOutcome(project, settings, cwd)) } satisfies ValidationCheck] : []),
    { name: 'prompts', severity: 'required', runsCommands: false, run: () => guarded(() => promptOverridesOutcome(project)) },
    { name: 'knowledge', severity: 'required', runsCommands: false, run: () => guarded(() => knowledgeOutcome(project)) },
    ...project.tools.map((tool) => toolCheck(prober, tool.name, 'optional', `tool ${tool.name}`)),
  ];
}
