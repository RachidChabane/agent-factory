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

  it('refuses a report that is not JSON or has no known status', () => {
    expect(() => parseReport('{not json', FILE)).toThrow(ReportUnreadableError);
    expect(() => parseReport('{}', FILE)).toThrow('status must be recorded or skipped');
    expect(() => parseReport('{"status":"done"}', FILE)).toThrow(ReportUnreadableError);
    expect(() => parseReport('[]', FILE)).toThrow(ReportUnreadableError);
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
