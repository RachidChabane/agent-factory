import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_FACT_LABEL_CHARACTERS, MAX_FACT_VALUE_CHARACTERS, MAX_FACTS, MAX_KEY_FRAMES } from './constants.ts';
import { parseReport, ReportUnreadableError } from './filmReportParsing.ts';

const FILE = 'report.json';

describe('film report parsing', () => {
  it('reads a recorded report with facts and key frames', () => {
    const report = parseReport(
      JSON.stringify({ status: 'recorded', facts: [{ label: 'Items in the cart', value: 2 }, { label: 'Paid', value: true }, { label: 'Total', value: '19.90' }], keyFrames: ['screens/cart.png', './screens/paid.png'] }),
      FILE,
    );
    expect(report).toEqual({
      status: 'recorded',
      reason: null,
      facts: [{ label: 'Items in the cart', value: '2' }, { label: 'Paid', value: 'true' }, { label: 'Total', value: '19.90' }],
      keyFrames: ['screens/cart.png', 'screens/paid.png'],
    });
  });

  it('reads a skipped report with its reason on one line', () => {
    expect(parseReport('{"status":"skipped","reason":"the sandbox account\\nis locked"}', FILE)).toMatchObject({ status: 'skipped', reason: 'the sandbox account is locked' });
    expect(parseReport('{"status":"skipped"}', FILE).reason).toBeNull();
  });

  it('leaves out a fact that is not a label with a scalar value, rather than failing the film', () => {
    const report = parseReport(JSON.stringify({ status: 'recorded', facts: [{ label: 'Kept', value: 1 }, { label: 'Object', value: { a: 1 } }, { label: '  ', value: 'blank label' }, 'text', null, { value: 'no label' }] }), FILE);
    expect(report.facts).toEqual([{ label: 'Kept', value: '1' }]);
  });

  it('caps the number of facts, the length of their labels and values, and the key frames', () => {
    const facts = Array.from({ length: MAX_FACTS + 5 }, (_unused, position) => ({ label: 'l'.repeat(MAX_FACT_LABEL_CHARACTERS + 10), value: `${position} ${'v'.repeat(MAX_FACT_VALUE_CHARACTERS * 2)}` }));
    const keyFrames = Array.from({ length: MAX_KEY_FRAMES + 3 }, (_unused, position) => `frame-${position}.png`);
    const report = parseReport(JSON.stringify({ status: 'recorded', facts, keyFrames }), FILE);
    expect(report.facts).toHaveLength(MAX_FACTS);
    expect(report.facts[0]?.label).toHaveLength(MAX_FACT_LABEL_CHARACTERS);
    expect(report.facts[0]?.value).toHaveLength(MAX_FACT_VALUE_CHARACTERS);
    expect(report.keyFrames).toEqual(keyFrames.slice(0, MAX_KEY_FRAMES));
  });

  it('refuses a report that is not JSON', () => {
    expect(() => parseReport('{not json', FILE)).toThrow(ReportUnreadableError);
    expect(() => parseReport('', FILE)).toThrow(ReportUnreadableError);
  });

  describe('names the field that breaks its rule, what it must be and what it holds', () => {
    const rejection = (report: unknown): string => {
      try {
        parseReport(JSON.stringify(report), FILE);
      } catch (error) {
        if (error instanceof ReportUnreadableError) return error.message;
        throw error;
      }
      throw new Error('the report was accepted');
    };

    it.each([
      ['a list', [], 'found a list'],
      ['a string', 'recorded', 'found "recorded"'],
      ['a number', 7, 'found a number'],
      ['null', null, 'found null'],
    ])('a report that is %s is not an object', (_name, report, found) => {
      expect(rejection(report)).toBe(`${FILE} is not a readable film report: the report must be a JSON object with a status (${found})`);
    });

    it('a missing status', () => {
      expect(rejection({})).toBe(`${FILE} is not a readable film report: status must be recorded or skipped (missing)`);
    });

    it('a status that is neither recorded nor skipped', () => {
      expect(rejection({ status: 'done' })).toBe(`${FILE} is not a readable film report: status must be recorded or skipped (found "done")`);
      expect(rejection({ status: true })).toContain('status must be recorded or skipped (found a boolean)');
    });

    it('a reason that is not a string', () => {
      expect(rejection({ status: 'skipped', reason: 42 })).toBe(
        `${FILE} is not a readable film report: reason must be a string, the reason a skipped scenario gives (found a number)`,
      );
      expect(rejection({ status: 'skipped', reason: { text: 'locked' } })).toContain('(found an object)');
    });

    it('facts that are not a list', () => {
      expect(rejection({ status: 'recorded', facts: { label: 'Total', value: 1 } })).toBe(
        `${FILE} is not a readable film report: facts must be a list of { "label": text, "value": text, number or true/false } (found an object)`,
      );
      expect(rejection({ status: 'recorded', facts: 'Total: 1' })).toContain('(found "Total: 1")');
    });

    it('key frames that are not a list', () => {
      expect(rejection({ status: 'recorded', keyFrames: 'screens/cart.png' })).toBe(
        `${FILE} is not a readable film report: keyFrames must be a list of paths relative to the output directory (found "screens/cart.png")`,
      );
    });

    it('every broken field at once, in the order of the rules', () => {
      expect(rejection({ status: 'done', reason: 1, facts: null, keyFrames: false })).toBe(
        `${FILE} is not a readable film report: ` +
          'status must be recorded or skipped (found "done"); ' +
          'reason must be a string, the reason a skipped scenario gives (found a number); ' +
          'facts must be a list of { "label": text, "value": text, number or true/false } (found null); ' +
          'keyFrames must be a list of paths relative to the output directory (found a boolean)',
      );
    });

    it('a long text is cut in what it holds', () => {
      expect(rejection({ status: 'x'.repeat(200) }).length).toBeLessThan(200);
    });
  });

  it('never gives a fact more than one line, whatever the report holds', () => {
    fc.assert(
      fc.property(fc.array(fc.record({ label: fc.string(), value: fc.oneof(fc.string(), fc.integer(), fc.boolean()) }), { maxLength: 30 }), (facts) => {
        const report = parseReport(JSON.stringify({ status: 'recorded', facts }), FILE);
        return (
          report.facts.length <= MAX_FACTS &&
          report.facts.every((fact) => fact.label !== '' && !/[\n\r]/.test(fact.label + fact.value) && fact.label.length <= MAX_FACT_LABEL_CHARACTERS && fact.value.length <= MAX_FACT_VALUE_CHARACTERS)
        );
      }),
    );
  });

  it('fails only with an unreadable-report error, whatever it is given', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        try {
          parseReport(JSON.stringify(value), FILE);
        } catch (error) {
          return error instanceof ReportUnreadableError;
        }
        return true;
      }),
    );
  });
});
