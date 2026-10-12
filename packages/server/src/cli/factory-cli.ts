import type { CliContext } from './cli-context.ts';
import { parseCommandLine, USAGE, type CommandLine } from './command-line.ts';
import { auditCommand } from './commands/audit-command.ts';
import { initCommand } from './commands/init-command.ts';
import { issueAbandonCommand } from './commands/issue-abandon-command.ts';
import { issueCreateCommand } from './commands/issue-create-command.ts';
import { mergeCommand } from './commands/merge-command.ts';
import { prFeedbackCommand } from './commands/pr-feedback-command.ts';
import { rehearsalAddIssueCommand, rehearsalInitCommand, rehearsalResetCommand } from './commands/rehearsal-command.ts';
import { requestAddCommand, requestChallengeCommand } from './commands/request-command.ts';
import { resumeCommand } from './commands/resume-command.ts';
import { runIssueCommand } from './commands/run-issue-command.ts';
import { schemaCommand } from './commands/schema-command.ts';
import { startCommand } from './commands/start-command.ts';
import { statusCommand } from './commands/status-command.ts';
import { stopCommand } from './commands/stop-command.ts';
import { toolCommand } from './commands/tool-command.ts';
import { usageCommand } from './commands/usage-command.ts';
import { validateCommand } from './commands/validate-command.ts';
import { watchCommand } from './commands/watch-command.ts';
import { EXIT_CODES } from './output.ts';

/** The demonstration and its fictional projects load only when asked for. */
async function startDemo(context: CliContext, port: number | null): Promise<number> {
  const { startDemoCommand } = await import('../demo/demo-command.ts');
  return startDemoCommand(context, port);
}

async function dispatch({ project, command }: CommandLine, context: CliContext): Promise<number> {
  switch (command.kind) {
    case 'help':
      context.output.line(USAGE);
      return EXIT_CODES.ok;
    case 'init':
      return initCommand(command, context);
    case 'validate':
      return validateCommand(context, { offline: command.offline, gatePreflight: command.gatePreflight });
    case 'schema':
      return schemaCommand(context);
    case 'start':
      return command.demo ? startDemo(context, command.port) : startCommand(context, command.port);
    case 'status':
      return statusCommand(command.issueNumber, project, context);
    case 'usage':
      return usageCommand(command.refresh, context);
    case 'watch':
      return watchCommand(command, context);
    case 'stop':
      return stopCommand(command.now, context);
    case 'run-issue':
      return runIssueCommand(command.issueNumber, project, context);
    case 'resume':
      return resumeCommand(command.issueNumber, command.answer, project, context);
    case 'merge':
      return mergeCommand(command.pullRequestNumber, command.expectedHeadSha, project, context);
    case 'rehearsal-init':
      return rehearsalInitCommand(command.sourceClonePath, project, context);
    case 'rehearsal-reset':
      return rehearsalResetCommand(command.sourceClonePath, project, context);
    case 'rehearsal-add-issue':
      return rehearsalAddIssueCommand(command.specPath, command.labels, project, context);
    case 'request-add':
      return requestAddCommand(command.path, command.imagesDirectory, command.requester, project, context);
    case 'request-challenge':
      return requestChallengeCommand(command.requestId, project, context);
    case 'issue-create':
      return issueCreateCommand(command.specPath, { blockedBy: command.blockedBy, confirmed: command.confirmed, start: command.start }, project, context);
    case 'issue-abandon':
      return issueAbandonCommand(command.issueNumber, command.reason, project, context);
    case 'pr-feedback':
      return prFeedbackCommand(command.pullRequestNumber, command.path, command.author, project, context);
    case 'audit':
      return auditCommand(command.commits, project, context);
    case 'tool-check':
      return toolCommand('check', command.tool, project, context);
    case 'tool-login':
      return toolCommand('login', command.tool, project, context);
  }
}

export async function runCli(argv: readonly string[], context: CliContext): Promise<number> {
  const parsed = parseCommandLine(argv);
  if (!parsed.ok) {
    context.output.error(`${parsed.error}\n\n${USAGE}`);
    return EXIT_CODES.usage;
  }
  try {
    return await dispatch(parsed.line, context);
  } catch (error) {
    context.output.error(error instanceof Error ? error.message : String(error));
    return EXIT_CODES.failure;
  }
}
