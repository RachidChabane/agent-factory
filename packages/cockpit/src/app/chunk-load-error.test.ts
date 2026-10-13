import { describe, expect, it } from 'vitest';
import { isChunkLoadError } from './chunk-load-error.ts';

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: http://127.0.0.1:7420/assets/RunsView-Dx4kXJAl.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/RunsView-Dx4kXJAl.css',
  ])('recognises %s', (message) => {
    expect(isChunkLoadError(new Error(message))).toBe(true);
  });

  it('does not take a rendering error for a stale bundle', () => {
    expect(isChunkLoadError(new TypeError('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError('boom')).toBe(false);
  });
});
