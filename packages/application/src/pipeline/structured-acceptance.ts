import type { StructuredTestRunner, TestRunReport } from '@agent-factory/domain';
import type { AcceptanceManifest } from '../acceptance/acceptance-manifest.ts';
import { ACCEPTANCE_REPORT_DIRECTORY, structuredAcceptanceCommand } from '../acceptance/structured-command.ts';
import { TestReportFormatError } from '../acceptance/test-reports/report-paths.ts';
import { readTestReport } from '../acceptance/test-reports/test-report-reader.ts';
import type { WorkspaceFiles, Worktree } from '../ports.ts';
import { OFFLINE, type ShellCommands, type ShellOutcome } from './shell-commands.ts';

export interface StructuredAcceptanceRun {
  readonly command: string;
  readonly outcome: ShellOutcome;
  readonly report: TestRunReport | null;
  readonly reportProblem: string | null;
}

export class StructuredAcceptance {
  private readonly shell: ShellCommands;
  private readonly files: WorkspaceFiles;

  constructor(shell: ShellCommands, files: WorkspaceFiles) {
    this.shell = shell;
    this.files = files;
  }

  /** Runs the checks with `shell`, the shell of a stack when the checks need one. */
  async run(worktree: Worktree, manifest: AcceptanceManifest, runner: StructuredTestRunner, shell: ShellCommands = this.shell): Promise<StructuredAcceptanceRun | null> {
    const plan = structuredAcceptanceCommand(manifest, runner, worktree.path);
    if (plan === null) return null;
    await this.files.remove(worktree.path, ACCEPTANCE_REPORT_DIRECTORY);
    await this.files.makeDirectory(worktree.path, ACCEPTANCE_REPORT_DIRECTORY);
    try {
      const outcome = await shell.execute(plan.command, worktree.path, OFFLINE);
      const text = await this.files.readText(worktree.path, plan.reportPath);
      if (text === null) {
        return {
          command: plan.command,
          outcome,
          report: null,
          reportProblem: `${runner} wrote no report to ${plan.reportPath}: the acceptance command must hand the factory's reporter arguments to ${runner}`,
        };
      }
      try {
        return { command: plan.command, outcome, report: readTestReport(runner, text, worktree.path), reportProblem: null };
      } catch (error) {
        if (error instanceof TestReportFormatError) return { command: plan.command, outcome, report: null, reportProblem: error.message };
        throw error;
      }
    } finally {
      await this.files.remove(worktree.path, ACCEPTANCE_REPORT_DIRECTORY);
    }
  }
}
