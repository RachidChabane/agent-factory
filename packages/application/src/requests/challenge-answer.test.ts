import { describe, expect, it } from 'vitest';
import { REASON_NO_CHALLENGE_JSON_BLOCK, parseChallengeAnswer } from './challenge-answer.ts';
import { answerItem, answerSpec, challengeAnswer } from './testing/request-fakes.ts';

describe('parseChallengeAnswer', () => {
  it('reads the block at the end of the answer', () => {
    const parsed = parseChallengeAnswer(challengeAnswer());
    expect(parsed).toMatchObject({
      ok: true,
      answer: { summary: 'One item, worth doing.', items: [{ verdict: 'keep', question: null }], specs: [{ type: 'ui', items: [1] }] },
    });
  });

  it('uses the last fenced block when the answer quotes an earlier one', () => {
    const text = `${challengeAnswer({ summary: 'first' })}\n${challengeAnswer({ summary: 'last' })}`;
    expect(parseChallengeAnswer(text)).toMatchObject({ ok: true, answer: { summary: 'last' } });
  });

  it('defaults the sources of an item and the items of a spec to empty lists', () => {
    const item: Record<string, unknown> = answerItem();
    const spec: Record<string, unknown> = answerSpec();
    delete item['sources'];
    delete spec['items'];
    const parsed = parseChallengeAnswer(challengeAnswer({ items: [item], specs: [spec] }));
    expect(parsed).toMatchObject({ ok: true, answer: { items: [{ sources: [] }], specs: [{ items: [] }] } });
  });

  it.each([
    ['no block', 'plain answer', REASON_NO_CHALLENGE_JSON_BLOCK],
    ['invalid json', '```json\n{ nope\n```', 'not valid JSON'],
    ['unknown verdict', challengeAnswer({ items: [answerItem({ verdict: 'approve' })] }), 'challenge schema'],
    ['empty spec type', challengeAnswer({ specs: [answerSpec({ type: ' ' })] }), 'challenge schema'],
    ['spec type that is a display name, not an id', challengeAnswer({ specs: [answerSpec({ type: 'Infra / CI' })] }), 'must be an issue type id'],
    ['capitalised spec type', challengeAnswer({ specs: [answerSpec({ type: 'UI' })] }), 'must be an issue type id'],
    ['missing reply', challengeAnswer({ reply: undefined }), 'challenge schema'],
    ['empty spec title', challengeAnswer({ specs: [answerSpec({ title: '  ' })] }), 'challenge schema'],
    ['spec answering an unknown item', challengeAnswer({ specs: [answerSpec({ items: [2] })] }), 'item 2 does not exist'],
  ])('rejects %s', (_label, text, fragment) => {
    const parsed = parseChallengeAnswer(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain(fragment);
  });
});
