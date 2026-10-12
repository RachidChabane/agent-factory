import type { BaseCheckout, BaseCheckouts, KnowledgePack } from '../../ports.ts';

export class FakeBaseCheckouts implements BaseCheckouts {
  readonly created: string[] = [];
  readonly removed: BaseCheckout[] = [];

  checkout(name: string): Promise<BaseCheckout> {
    this.created.push(name);
    return Promise.resolve({ path: `/checkouts/${name}`, sha: 'base0000' });
  }

  remove(checkout: BaseCheckout): Promise<void> {
    this.removed.push(checkout);
    return Promise.resolve();
  }
}

export class StaticKnowledge implements KnowledgePack {
  private readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  read(): Promise<string> {
    return Promise.resolve(this.text);
  }
}

export interface AnswerOverrides {
  readonly summary?: string;
  readonly items?: readonly Record<string, unknown>[];
  readonly specs?: readonly Record<string, unknown>[];
  readonly reply?: string | undefined;
}

export function answerItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'Show the cost on the run page',
    verdict: 'keep',
    currentState: 'The run page shows no cost (app/runs.tsx:12).',
    intent: 'The operator wants to see spending per run.',
    idea: 'Sound.',
    method: 'Fits the cockpit conventions.',
    reason: 'Clear need.',
    question: null,
    sources: [{ label: 'Run page', reference: 'app/runs.tsx:12' }],
    ...overrides,
  };
}

export function answerSpec(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'Show the cost on the run page',
    type: 'ui',
    items: [1],
    need: 'The operator needs the cost of a run on its page.',
    acceptanceCriteria: ['The run page shows the cost in dollars.', 'The cost updates while the run is live.'],
    outOfScope: ['Budget alerts'],
    expectedProof: 'A screenshot of the run page with a cost.',
    ...overrides,
  };
}

export function challengeAnswer(overrides: AnswerOverrides = {}): string {
  const block = {
    summary: 'One item, worth doing.',
    items: [answerItem()],
    specs: [answerSpec()],
    reply: 'We will add the cost to the run page.',
    ...overrides,
  };
  return `Analysis done.\n\n\`\`\`json\n${JSON.stringify(block, null, 2)}\n\`\`\`\n`;
}
