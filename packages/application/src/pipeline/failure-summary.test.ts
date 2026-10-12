import { describe, expect, it } from 'vitest';
import { agentStoppedSummary, STOPPED_MESSAGE_HEAD_LINES, STOPPED_MESSAGE_TAIL_LINES, stoppedMessageExcerpt } from './failure-summary.ts';

const QUESTION = 'Criterion 2 is ambiguous: does the log record timestamp count as the time?';

function numberedLines(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `line ${index + 1}`);
}

describe('agentStoppedSummary', () => {
  it('keeps the opening of a long stop message, where the agent states why it stopped', () => {
    const finalText = [QUESTION, ...numberedLines(40)].join('\n');

    const summary = agentStoppedSummary('acceptance-author', '.factory/acceptance.json was not written.', finalText);

    expect(summary).toContain(QUESTION);
    expect(summary).toContain('line 40');
  });

  it('names the problem alone when the agent said nothing', () => {
    expect(agentStoppedSummary('implementer', 'no result.', '  \n')).toBe('The implementer run finished without its result: no result.');
  });
});

describe('stoppedMessageExcerpt', () => {
  it('returns a message that fits whole', () => {
    const lines = numberedLines(STOPPED_MESSAGE_HEAD_LINES + STOPPED_MESSAGE_TAIL_LINES);

    expect(stoppedMessageExcerpt(lines.join('\n'))).toBe(lines.join('\n'));
  });

  it('keeps the head and the tail of a longer message around a truncation marker', () => {
    const total = STOPPED_MESSAGE_HEAD_LINES + STOPPED_MESSAGE_TAIL_LINES + 5;
    const excerpt = stoppedMessageExcerpt(numberedLines(total).join('\n')).split('\n');

    expect(excerpt).toHaveLength(STOPPED_MESSAGE_HEAD_LINES + STOPPED_MESSAGE_TAIL_LINES + 1);
    expect(excerpt[0]).toBe('line 1');
    expect(excerpt[STOPPED_MESSAGE_HEAD_LINES]).toBe('[...]');
    expect(excerpt.at(-1)).toBe(`line ${total}`);
  });
});
