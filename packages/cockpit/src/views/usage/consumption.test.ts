import { describe, expect, it } from 'vitest';
import { consumptionOf } from './consumption.ts';

describe('consumptionOf', () => {
  it('measures what is used against the limit', () => {
    expect(consumptionOf(2.5, 5)).toEqual({ ratio: 0.5, tone: 'success' });
  });

  it('turns amber when the limit is near and red when it is reached or exceeded', () => {
    expect(consumptionOf(4.5, 5).tone).toBe('running');
    expect(consumptionOf(5, 5).tone).toBe('failed');
    expect(consumptionOf(7.5, 5)).toEqual({ ratio: 1.5, tone: 'failed' });
  });

  it('treats a limit of zero as used up by anything spent, and as untouched otherwise', () => {
    expect(consumptionOf(1, 0)).toEqual({ ratio: 1, tone: 'failed' });
    expect(consumptionOf(0, 0)).toEqual({ ratio: 0, tone: 'success' });
  });
});
