import { describe, expect, it } from 'vitest';
import { REASON_NO_JSON_BLOCK, parseAuditVerdict } from './audit-verdict.ts';
import { verdictAnswer } from './testing/fakes.ts';

describe('parseAuditVerdict', () => {
  it('reads the verdict block at the end of the answer', () => {
    const parsed = parseAuditVerdict(verdictAnswer('challenge'));
    expect(parsed).toMatchObject({ ok: true, report: { verdict: 'challenge', proposedFix: 'add a test' } });
  });

  it('uses the last fenced block when the answer quotes an earlier one', () => {
    const text = `${verdictAnswer('keep', { summary: 'first' })}\n${verdictAnswer('rewrite', { summary: 'last' })}`;
    expect(parseAuditVerdict(text)).toMatchObject({ ok: true, report: { verdict: 'rewrite', summary: 'last' } });
  });

  it.each([
    ['no block', 'plain answer', REASON_NO_JSON_BLOCK],
    ['invalid json', '```json\n{ nope\n```', 'not valid JSON'],
    ['unknown verdict', verdictAnswer('approve'), 'verdict schema'],
    ['unknown level', verdictAnswer('keep', { findings: [{ level: 'style', statement: 's', evidence: 'e' }] }), 'verdict schema'],
    ['missing evidence', verdictAnswer('keep', { findings: [{ level: 'idea', statement: 's' }] }), 'verdict schema'],
  ])('rejects %s', (_label, text, fragment) => {
    const parsed = parseAuditVerdict(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain(fragment);
  });
});
