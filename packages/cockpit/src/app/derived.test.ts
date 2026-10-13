import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '../test/render.tsx';
import { TEST_NOW } from '../test/harness.tsx';
import { boardOf } from './derived.ts';

const ONE_TICK_MS = 15_000;

describe('boardOf', () => {
  it('derives the board once for a snapshot and a moment, whoever asks', () => {
    const snapshot = fixtureSnapshot();
    expect(boardOf(snapshot, TEST_NOW)).toBe(boardOf(snapshot, TEST_NOW));
  });

  it('derives it again when the moment moves on or the snapshot is replaced', () => {
    const snapshot = fixtureSnapshot();
    const board = boardOf(snapshot, TEST_NOW);
    expect(boardOf(snapshot, TEST_NOW + ONE_TICK_MS)).not.toBe(board);
    expect(boardOf({ ...snapshot }, TEST_NOW)).not.toBe(board);
  });
});
