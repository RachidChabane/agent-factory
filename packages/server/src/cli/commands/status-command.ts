import { issueStatus, loadJournal, ProjectEventStore, type EventStore } from '@agent-factory/application';
import type { IssueState } from '@agent-factory/domain';
import type { AgentFactoryConfig, ProjectConfig } from '../../config/agent-factory-config.ts';
import { costBasis } from '../../projections/cost-views.ts';
import { indexEvents } from '../../projections/event-index.ts';
import { pauseViews, usageView } from '../../projections/installation-views.ts';
import { issueJournals } from '../../projections/issue-views.ts';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES } from '../output.ts';
import { renderOverview, type ProjectOverview } from '../overview-view.ts';
import { renderIssueStatus } from '../status-view.ts';
import { runningFactory } from './factory-running.ts';
import { forgeName } from './forge-names.ts';
import { itemName, selectedProject, withProjectEvents } from './project-session.ts';

const FIRST_SEQUENCE = 0;
const EVERY_SUBJECT = '';

export function installationCostBasis(config: AgentFactoryConfig): ReturnType<typeof costBasis> {
  return costBasis(config.claude.accounts.map((account) => account.billing));
}

async function issueStatusCommand(issueNumber: number, requested: string | null, context: CliContext): Promise<number> {
  const selected = await selectedProject(context, requested);
  const journal = await withProjectEvents(context, selected, (events) => loadJournal(events, issueNumber));
  if (journal.state === null) {
    context.output.error(`${itemName(selected.project, issueNumber)} is unknown to the factory`);
    return EXIT_CODES.failure;
  }
  for (const line of renderIssueStatus(selected.project.id, issueStatus(journal), installationCostBasis(selected.config))) context.output.line(line);
  return EXIT_CODES.ok;
}

function issuesByState(index: ReturnType<typeof indexEvents>): ReadonlyMap<IssueState, number> {
  const counts = new Map<IssueState, number>();
  for (const journal of issueJournals(index).values()) {
    if (journal.state !== null) counts.set(journal.state, (counts.get(journal.state) ?? 0) + 1);
  }
  return counts;
}

async function projectOverview(events: EventStore, project: ProjectConfig): Promise<ProjectOverview> {
  const records = await events.read(EVERY_SUBJECT, FIRST_SEQUENCE);
  return { id: project.id, name: project.name, forge: forgeName(project), issuesByState: issuesByState(indexEvents(records)), pauses: pauseViews(records, 'project') };
}

async function overviewCommand(context: CliContext): Promise<number> {
  const config = await context.loadConfig();
  const installation = await context.openInstallation(config, { projects: [] });
  try {
    const records = await installation.events.read(EVERY_SUBJECT, FIRST_SEQUENCE);
    const projects: ProjectOverview[] = [];
    for (const project of config.projects) projects.push(await projectOverview(new ProjectEventStore(installation.events, project.id), project));
    const overview = {
      home: config.home,
      configPath: config.configPath,
      factoryProcess: await runningFactory(config),
      cockpitUrl: config.server.publicUrl,
      maxConcurrentRuns: config.resources.maxConcurrentRuns,
      pauses: pauseViews(records, 'installation'),
      usage: usageView(config, await installation.budget.usage(), records),
      projects,
    };
    for (const line of renderOverview(overview, context.clock.now())) context.output.line(line);
    return EXIT_CODES.ok;
  } finally {
    installation.close();
  }
}

export async function statusCommand(issueNumber: number | null, requested: string | null, context: CliContext): Promise<number> {
  return issueNumber === null ? overviewCommand(context) : issueStatusCommand(issueNumber, requested, context);
}
