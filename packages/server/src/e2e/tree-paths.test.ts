import { describe, expect, it } from 'vitest';
import { pathsUnder } from './tree-paths.ts';

const PATHS = ['.evidence/1/diffstat.txt', '.evidence/1/before-log.txt', '.evidence/12/diffstat.txt', 'src/categories.js', 'package.json'];

describe('pathsUnder', () => {
  it('lists the paths below a directory, relative to it', () => {
    expect(pathsUnder('.evidence/1', PATHS)).toEqual(['diffstat.txt', 'before-log.txt']);
    expect(pathsUnder('.evidence', PATHS)).toEqual(['1/diffstat.txt', '1/before-log.txt', '12/diffstat.txt']);
  });

  it('does not take a directory whose name only starts like the one asked for', () => {
    expect(pathsUnder('.evidence/1', ['.evidence/12/diffstat.txt'])).toEqual([]);
  });

  it('lists nothing for a directory the tree does not have', () => {
    expect(pathsUnder('docs', PATHS)).toEqual([]);
  });
});
