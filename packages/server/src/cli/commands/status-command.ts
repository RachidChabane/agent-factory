import { issueStatus, loadJournal } from '@agent-factory/application';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES } from '../output.ts';
import { renderIssueStatus } from '../status-view.ts';

export async function statusCommand(issueNumber: number, context: CliContext): Promise<number> {
  const eventLog = context.openEventLog(await context.loadConfig());
  try {
    const journal = await loadJournal(eventLog.events, issueNumber);
    if (journal.state === null) {
      context.output.error(`Issue #${issueNumber} is unknown to the factory`);
      return EXIT_CODES.failure;
    }
    for (const line of renderIssueStatus(issueStatus(journal))) context.output.line(line);
    return EXIT_CODES.ok;
  } finally {
    eventLog.close();
  }
}
