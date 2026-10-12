import { ResumeIssue } from '@agent-factory/application';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES } from '../output.ts';

export async function resumeCommand(issueNumber: number, answer: string | null, context: CliContext): Promise<number> {
  const factory = await context.openFactory(await context.loadConfig());
  try {
    const outcome = await new ResumeIssue(factory.dependencies, { conventions: factory.settings.conventions, escalation: factory.settings.implementerEscalation }).resume(
      issueNumber,
      answer,
    );
    const spec = outcome.specChanged ? 'the clarified spec was recorded' : 'the spec is unchanged';
    const checks = outcome.checksReauthored ? '; the acceptance checks will be written again from the base' : '';
    const decision = outcome.decisionAnswered ? '; the implementer will continue with the answer to its decision request' : '';
    const feedback = outcome.feedbackCycleGranted ? '; one fresh session on the escalation profile addresses the pending feedback' : '';
    context.output.line(
      `Issue #${issueNumber} resumed at ${outcome.resumedAt}: ${spec}${checks}${decision}${feedback}. Run "factory run-issue ${issueNumber}" to continue.`,
    );
    return EXIT_CODES.ok;
  } finally {
    factory.close();
  }
}
