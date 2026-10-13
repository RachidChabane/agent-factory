import { describe, expect, it } from 'vitest';
import { describeBytes } from './byte-size.ts';

describe('describeBytes', () => {
  it.each([
    [0, '0 B'],
    [999, '999 B'],
    [1_000, '1 kB'],
    [1_500, '1.5 kB'],
    [999_999, '1 MB'],
    [5_000_000, '5 MB'],
    [6_200_000, '6.2 MB'],
    [40_000_000, '40 MB'],
    [2_500_000_000, '2.5 GB'],
  ])('says %i bytes as %s', (bytes, text) => {
    expect(describeBytes(bytes)).toBe(text);
  });

  it('rounds up, so that a size over a limit never reads as the limit', () => {
    expect(describeBytes(5_000_001)).toBe('5.1 MB');
    expect(describeBytes(1_001)).toBe('1.1 kB');
  });
});
