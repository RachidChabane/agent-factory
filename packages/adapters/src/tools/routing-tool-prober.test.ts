import type { ToolProber } from '@agent-factory/application';
import type { ToolName, ToolProbeResult } from '@agent-factory/domain';
import { BUILT_IN_TOOLS } from '@agent-factory/domain';
import { describe, expect, it } from 'vitest';
import { RoutingToolProber } from './routing-tool-prober.ts';

class NamedProber implements ToolProber {
  readonly asked: ToolName[] = [];
  private readonly label: string;

  constructor(label: string) {
    this.label = label;
  }

  probe(tool: ToolName): Promise<ToolProbeResult> {
    this.asked.push(tool);
    return Promise.resolve({ tool, status: 'connected', version: null, detail: this.label, fixCommand: null });
  }
}

describe('RoutingToolProber', () => {
  it.each(BUILT_IN_TOOLS)('asks the built-in prober about %s', async (tool) => {
    const builtIn = new NamedProber('built-in');
    const declared = new NamedProber('declared');
    expect(await new RoutingToolProber(builtIn, declared).probe(tool)).toMatchObject({ tool, detail: 'built-in' });
    expect(declared.asked).toEqual([]);
  });

  it.each(['deploy', 'metrics', 'Git', ''])('asks the declarative prober about %j', async (tool) => {
    const builtIn = new NamedProber('built-in');
    const declared = new NamedProber('declared');
    expect(await new RoutingToolProber(builtIn, declared).probe(tool)).toMatchObject({ tool, detail: 'declared' });
    expect(builtIn.asked).toEqual([]);
  });
});
