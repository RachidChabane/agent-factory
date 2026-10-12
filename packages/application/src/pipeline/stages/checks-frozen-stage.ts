import { ADVANCED, type PipelineStage, type StageContext, type StageResult } from './stage.ts';

export class ChecksFrozenStage implements PipelineStage {
  readonly handles = ['checks-frozen'] as const;

  async advance(context: StageContext): Promise<StageResult> {
    await context.writer.transition('implementing', 'implementation starts against the frozen checks');
    return ADVANCED;
  }
}
