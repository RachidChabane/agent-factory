import type { ChallengeItemPayload, ProposedSpecPayload } from './request-events.ts';

const NEWLINE = '\n';
const BLANK_LINE = '\n\n';
const NONE = 'none';

export interface ChallengeReportContent {
  readonly summary: string;
  readonly items: readonly ChallengeItemPayload[];
  readonly specs: readonly ProposedSpecPayload[];
}

function field(label: string, value: string): string {
  return `- ${label}: ${value === '' ? NONE : value}`;
}

function renderItem(item: ChallengeItemPayload): string {
  const sources = item.sources.length === 0 ? [`- Sources: ${NONE}`] : ['- Sources:', ...item.sources.map((source) => `  - ${source.label}: ${source.reference}`)];
  return [
    `## ${item.id}: ${item.title}`,
    field('Verdict', item.verdict),
    field('Current state', item.currentState),
    field('Intent', item.intent),
    field('Idea', item.idea),
    field('Method', item.method),
    field('Reason', item.reason),
    field('Question', item.question ?? ''),
    ...sources,
  ].join(NEWLINE);
}

function renderSpec(spec: ProposedSpecPayload): string {
  const problems = spec.problems.length === 0 ? '' : ` (problems: ${spec.problems.join(' | ')})`;
  return `- ${spec.path}: ${spec.title}${problems}`;
}

export function renderChallengeReport(content: ChallengeReportContent): string {
  const specs = content.specs.length === 0 ? NONE : content.specs.map(renderSpec).join(NEWLINE);
  return [
    '# Challenge report',
    `## Summary${BLANK_LINE}${content.summary}`,
    ...content.items.map(renderItem),
    `## Proposed specs${BLANK_LINE}${specs}`,
  ].join(BLANK_LINE).concat(NEWLINE);
}
