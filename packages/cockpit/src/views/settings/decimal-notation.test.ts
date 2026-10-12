import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decimalNotation } from './decimal-notation.ts';
import { FIXED_SEED } from './property-test-config.ts';

const english = decimalNotation('en');
const french = decimalNotation('fr');

describe('decimalNotation in English', () => {
  it('writes the decimal point and no thousands separator', () => {
    expect(english.format(4.5)).toBe('4.5');
    expect(english.format(5000)).toBe('5000');
    expect(english.format(0.1)).toBe('0.1');
  });

  it('reads digits with an optional decimal part', () => {
    expect(english.parse('4.5')).toBe(4.5);
    expect(english.parse('12')).toBe(12);
    expect(english.parse('  7.25  ')).toBe(7.25);
    expect(english.parse('0.5')).toBe(0.5);
  });

  it('does not read a comma as a decimal mark, so that 1,000 is never 1', () => {
    expect(english.parse('1,000')).toBeNull();
    expect(english.parse('4,5')).toBeNull();
  });

  it.each(['', '   ', 'abc', '1e3', '-1', '+1', '.5', '5.', '1.2.3', '1 000', 'Infinity', 'NaN', '0x10', '４２'])('refuses %j', (text) => {
    expect(english.parse(text)).toBeNull();
    expect(english.parseWhole(text)).toBeNull();
  });

  it('reads a number whose value is whole', () => {
    expect(english.parseWhole('16')).toBe(16);
    expect(english.parseWhole(' 3 ')).toBe(3);
    expect(english.parseWhole('3.0')).toBe(3);
    expect(english.parseWhole('2.5')).toBeNull();
    expect(english.parseWhole('2,5')).toBeNull();
  });

  it('refuses a number too large to be finite rather than reading it as infinity', () => {
    const huge = '9'.repeat(400);
    expect(english.parse(huge)).toBeNull();
    expect(english.parseWhole(huge)).toBeNull();
  });
});

describe('decimalNotation in French', () => {
  it('writes the decimal comma and no group separator', () => {
    expect(french.format(4.5)).toBe('4,5');
    expect(french.format(5000)).toBe('5000');
  });

  it('reads the decimal comma, and the decimal point from a numeric keypad', () => {
    expect(french.parse('4,5')).toBe(4.5);
    expect(french.parse('4.5')).toBe(4.5);
    expect(french.parse('12')).toBe(12);
  });

  it('refuses a number written with several marks', () => {
    expect(french.parse('1.000,5')).toBeNull();
    expect(french.parse('1,5,5')).toBeNull();
    expect(french.parse('1 000')).toBeNull();
  });

  it('reads a number whose value is whole', () => {
    expect(french.parseWhole('16')).toBe(16);
    expect(french.parseWhole('3,0')).toBe(3);
    expect(french.parseWhole('2,5')).toBeNull();
  });
});

describe('decimalNotation round trip', () => {
  it('reads back what it wrote, in both languages', () => {
    const cents = fc.integer({ min: 0, max: 100_000_000 }).map((count) => count / 100);
    fc.assert(
      fc.property(cents, (value) => {
        expect(english.parse(english.format(value))).toBe(value);
        expect(french.parse(french.format(value))).toBe(value);
      }),
      { seed: FIXED_SEED },
    );
  });

  it('reads back a whole number it wrote', () => {
    fc.assert(
      fc.property(fc.nat({ max: 1_000_000 }), (value) => {
        expect(english.parseWhole(english.format(value))).toBe(value);
        expect(french.parseWhole(french.format(value))).toBe(value);
      }),
      { seed: FIXED_SEED },
    );
  });
});
