import type { ToolProber } from '@agent-factory/application';
import { isBuiltInTool, type ToolName, type ToolProbeResult } from '@agent-factory/domain';

export class RoutingToolProber implements ToolProber {
  private readonly builtIn: ToolProber;
  private readonly declared: ToolProber;

  constructor(builtIn: ToolProber, declared: ToolProber) {
    this.builtIn = builtIn;
    this.declared = declared;
  }

  probe(tool: ToolName): Promise<ToolProbeResult> {
    return isBuiltInTool(tool) ? this.builtIn.probe(tool) : this.declared.probe(tool);
  }
}
