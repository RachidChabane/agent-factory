import { LocalGateChecks, SpawnCommandRunner, type LocalCheckRun, type LocalCheckRunner, type LocalCheckStep } from '@agent-factory/adapters';
import { accessOf, ShellCommands, type Clock, type CommandRunner, type NamedCommand } from '@agent-factory/application';
import type { AgentFactoryConfig, ProjectConfig } from '../../config/agent-factory-config.ts';
import { factoryPorts, ListeningPorts } from '../listening-ports.ts';
import { baseWorkspaces } from './base-workspaces.ts';
import { commandSandbox } from './confinement.ts';
import { projectGitEnvironment } from './forge.ts';
import { checkEnvironment, type SourceEnvironment } from './project-settings.ts';

const CHECKOUT_PREFIX = 'checks-';
const CHECKOUT_SHA_LENGTH = 12;
const NEWLINE = '\n';

export interface LocalChecksSettings {
  readonly runner: CommandRunner;
  readonly environment: SourceEnvironment;
  readonly platform: string;
  readonly home: string;
  readonly clock: Clock;
  /** Aborted when the installation stops, which stops a gate in progress. */
  readonly lifetime: AbortSignal;
}

function logOf(command: NamedCommand, output: string, exitCode: number | null): string {
  const outcome = exitCode === null ? '[could not start]' : `[exit code ${exitCode}]`;
  return `$ ${command.run}${NEWLINE}${output.trimEnd()}${NEWLINE}${outcome}${NEWLINE}`;
}

/** Runs a project's setup and gate commands on a clean checkout of a commit, confined as the pipeline confines them. */
class ProjectGateRunner implements LocalCheckRunner {
  private readonly config: AgentFactoryConfig;
  private readonly project: ProjectConfig;
  private readonly settings: LocalChecksSettings;

  constructor(config: AgentFactoryConfig, project: ProjectConfig, settings: LocalChecksSettings) {
    this.config = config;
    this.project = project;
    this.settings = settings;
  }

  async run(sha: string, signal: AbortSignal): Promise<LocalCheckRun> {
    const { project, settings } = this;
    const workspaces = baseWorkspaces(project, settings.runner, projectGitEnvironment(project, settings.environment));
    const sandbox = commandSandbox(this.config, project, {
      platform: settings.platform,
      home: settings.home,
      environment: settings.environment,
      listening: new ListeningPorts(factoryPorts(this.config.server.port)),
    });
    const shell = new ShellCommands(new SpawnCommandRunner({ abortSignal: signal }), sandbox, checkEnvironment(project, settings.environment), project.gate.timeoutMs, project.gate.niceness);
    const checkout = await workspaces.checkout(`${CHECKOUT_PREFIX}${sha.slice(0, CHECKOUT_SHA_LENGTH)}`, sha);
    const steps: LocalCheckStep[] = [];
    let log = '';
    try {
      for (const command of project.setupCommands) {
        const run = await shell.run(command.run, checkout.path, accessOf(command));
        const passed = run.started && run.exitCode === 0 && !run.timedOut;
        log += logOf(command, run.started ? run.output : run.reason, run.started ? run.exitCode : null);
        if (!passed) return { steps: [...steps, { name: command.name, passed: false, durationMs: run.started ? run.durationMs : null }], log };
      }
      for (const command of [...project.gate.commandsBeforeAcceptance, ...project.gate.commandsAfterAcceptance]) {
        const run = await shell.run(command.run, checkout.path, accessOf(command));
        steps.push({ name: command.name, passed: run.started && run.exitCode === 0 && !run.timedOut, durationMs: run.started ? run.durationMs : null });
        log += logOf(command, run.started ? run.output : run.reason, run.started ? run.exitCode : null);
      }
      return { steps, log };
    } finally {
      await workspaces.remove(checkout);
    }
  }
}

/** The checks of a project's local forge when it runs the project's gate as its continuous integration, or null. */
export function localGateChecks(config: AgentFactoryConfig, project: ProjectConfig, settings: LocalChecksSettings): LocalGateChecks | null {
  if (project.forge.kind !== 'local' || project.forge.checks !== 'gate') return null;
  return new LocalGateChecks(project.forge.directory, new ProjectGateRunner(config, project, settings), settings.clock, settings.lifetime);
}
