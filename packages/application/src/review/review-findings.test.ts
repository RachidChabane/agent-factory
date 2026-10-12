import { describe, expect, it } from 'vitest';
import { blockingFindings, describeFinding, readReviewFindings } from './review-findings.ts';

const FINDING = {
  severity: 'blocking',
  category: 'criteria-coverage',
  file: 'app/pages/mockup.vue',
  line: 12,
  summary: 'Criterion 2 is not implemented.',
} as const;

describe('readReviewFindings', () => {
  it('reads the findings report of the last json block', () => {
    const text = ['Draft:', '```json', '{ "findings": [] }', '```', 'Final:', '```json', JSON.stringify({ findings: [FINDING] }), '```'].join('\n');
    expect(readReviewFindings(text)).toEqual({ valid: true, findings: [FINDING] });
  });

  it('accepts a sound change without findings and a bare list of findings', () => {
    expect(readReviewFindings('No issue.\n```json\n{ "findings": [] }\n```')).toEqual({ valid: true, findings: [] });
    expect(readReviewFindings(`\`\`\`json\n${JSON.stringify([FINDING])}\n\`\`\``)).toEqual({ valid: true, findings: [FINDING] });
  });

  it('rejects a review without a json block', () => {
    expect(readReviewFindings('Looks good to me.')).toEqual({
      valid: false,
      problem: 'the review has no ```json block of findings',
    });
  });

  it('rejects malformed JSON and findings outside the format', () => {
    expect(readReviewFindings('```json\n[{]\n```').valid).toBe(false);
    const reading = readReviewFindings(`\`\`\`json\n${JSON.stringify({ findings: [{ ...FINDING, severity: 'major' }] })}\n\`\`\``);
    expect(reading.valid).toBe(false);
    expect(reading.valid ? '' : reading.problem).toContain('severity');
  });

  it('separates blocking findings and describes them with their location', () => {
    const nonBlocking = { ...FINDING, severity: 'non-blocking', file: null, line: null } as const;
    expect(blockingFindings([FINDING, nonBlocking])).toEqual([FINDING]);
    expect(describeFinding(FINDING)).toBe('[criteria-coverage] (app/pages/mockup.vue:12) Criterion 2 is not implemented.');
    expect(describeFinding(nonBlocking)).toBe('[criteria-coverage] Criterion 2 is not implemented.');
  });
});
