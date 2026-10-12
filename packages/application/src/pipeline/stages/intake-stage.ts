import { isSpecValidated } from '../../spec/markdown-spec-reader.ts';
import { issueBranchName } from '../branch-name.ts';
import { PIPELINE_EVENTS } from '../journal-events.ts';
import { SpecNotValidatedError } from '../pipeline-errors.ts';
import { ADVANCED, type PipelineStage, type StageContext, type StageResult } from './stage.ts';

export class IntakeStage implements PipelineStage {
  readonly handles = [null, 'spec-draft'] as const;

  async advance(context: StageContext): Promise<StageResult> {
    const { journal, writer, toolkit } = context;
    const issue = await toolkit.dependencies.github.getIssue(journal.issueNumber);
    const { validated } = toolkit.settings.conventions.labels;
    if (!isSpecValidated(issue, toolkit.settings.conventions)) throw new SpecNotValidatedError(journal.issueNumber, validated);
    const spec = toolkit.dependencies.specReader.read(issue);
    if (journal.state === null) await writer.transition('spec-draft', 'issue taken into the factory');
    if (journal.spec === null) {
      await writer.record(PIPELINE_EVENTS.specCaptured, { spec, branch: issueBranchName(toolkit.settings.conventions.branchPrefix, spec.number, spec.title) });
    }
    await writer.transition('spec-validated', `label ${validated} present`);
    return ADVANCED;
  }
}
