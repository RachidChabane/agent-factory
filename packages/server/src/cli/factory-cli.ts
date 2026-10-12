import type { CliContext } from './cli-context.ts';
import { parseCommandLine, USAGE } from './command-line.ts';
import { auditCommand } from './commands/audit-command.ts';
import { mergeCommand } from './commands/merge-command.ts';
import { rehearsalAddIssueCommand, rehearsalInitCommand, rehearsalResetCommand } from './commands/rehearsal-command.ts';
import { resumeCommand } from './commands/resume-command.ts';
import { runIssueCommand } from './commands/run-issue-command.ts';
import { statusCommand } from './commands/status-command.ts';
import { validateCommand } from './commands/validate-command.ts';
import { EXIT_CODES } from './output.ts';
import { issueAbandonCommand } from './commands/issue-abandon-command.ts';
import { issueCreateCommand } from './commands/issue-create-command.ts';
import { prFeedbackCommand } from './commands/pr-feedback-command.ts';
import { requestAddCommand, requestChallengeCommand } from './commands/request-command.ts';
import { startCommand } from './commands/start-command.ts';

export async function runCli(argv: readonly string[], context: CliContext): Promise<number> {
  const parsed = parseCommandLine(argv);
  if (!parsed.ok) {
    context.output.error(`${parsed.error}\n\n${USAGE}`);
    return EXIT_CODES.usage;
  }
  const { command } = parsed;
  try {
    switch (command.kind) {
      case 'help':
        context.output.line(USAGE);
        return EXIT_CODES.ok;
      case 'run-issue':
        return await runIssueCommand(command.issueNumber, context);
      case 'resume':
        return await resumeCommand(command.issueNumber, command.answer, context);
      case 'merge':
        return await mergeCommand(command.pullRequestNumber, command.expectedHeadSha, context);
      case 'status':
        return await statusCommand(command.issueNumber, context);
      case 'validate':
        return await validateCommand(context, { gatePreflight: command.gatePreflight });
      case 'rehearsal-init':
        return await rehearsalInitCommand(command.sourceClonePath, context);
      case 'rehearsal-reset':
        return await rehearsalResetCommand(command.sourceClonePath, context);
      case 'rehearsal-add-issue':
        return await rehearsalAddIssueCommand(command.specPath, command.labels, context);
      case 'start':
        return await startCommand(context);
      case 'request-add':
        return await requestAddCommand(command.path, command.imagesDirectory, command.requester, context);
      case 'request-challenge':
        return await requestChallengeCommand(command.requestId, context);
      case 'issue-create':
        return await issueCreateCommand(command.specPath, command.confirmed, context);
      case 'issue-abandon':
        return await issueAbandonCommand(command.issueNumber, command.reason, context);
      case 'audit':
        return await auditCommand(command.commits, context);
      case 'pr-feedback':
        return await prFeedbackCommand(command.pullRequestNumber, command.path, command.author, context);
    }
  } catch (error) {
    context.output.error(error instanceof Error ? error.message : String(error));
    return EXIT_CODES.failure;
  }
}
