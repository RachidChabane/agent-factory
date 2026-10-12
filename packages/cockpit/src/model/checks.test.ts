import { describe, expect, it } from 'vitest';
import { blamedConclusion, failsOnBaseToo } from './checks.ts';

describe('failsOnBaseToo', () => {
  it('holds for a failure the base branch shares', () => {
    expect(failsOnBaseToo({ conclusion: 'failure', failsOnBase: true })).toBe(true);
  });

  it('does not hold for a failure the change caused', () => {
    expect(failsOnBaseToo({ conclusion: 'failure', failsOnBase: false })).toBe(false);
  });

  it('never holds for a check that did not fail, whatever the base says', () => {
    expect(failsOnBaseToo({ conclusion: 'success', failsOnBase: true })).toBe(false);
    expect(failsOnBaseToo({ conclusion: 'pending', failsOnBase: true })).toBe(false);
    expect(failsOnBaseToo({ conclusion: 'cancelled', failsOnBase: true })).toBe(false);
  });
});

describe('blamedConclusion', () => {
  it('turns a failure the base shares into a neutral one', () => {
    expect(blamedConclusion({ conclusion: 'failure', failsOnBase: true })).toBe('neutral');
  });

  it('keeps every other conclusion as it is', () => {
    expect(blamedConclusion({ conclusion: 'failure', failsOnBase: false })).toBe('failure');
    expect(blamedConclusion({ conclusion: 'success', failsOnBase: true })).toBe('success');
    expect(blamedConclusion({ conclusion: 'pending', failsOnBase: false })).toBe('pending');
  });
});
