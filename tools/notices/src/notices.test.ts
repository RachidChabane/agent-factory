import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { entriesOf, renderNotices } from './notices.ts';

describe('the third-party notices', () => {
  it('lists every package once, sorted, with its licence and home page, after a summary by licence', () => {
    const entries = entriesOf({
      MIT: [
        { name: 'zod', versions: ['4.1.11'], homepage: 'https://zod.dev' },
        { name: 'react', versions: ['19.1.1'], homepage: 'https://react.dev/' },
      ],
      ISC: [{ name: 'yaml', versions: ['2.8.1'] }],
      '': [{ name: 'mystery', versions: ['1.0.0'] }],
    });
    assert.deepEqual(entries.map((entry) => [entry.name, entry.license]), [['mystery', 'UNKNOWN'], ['react', 'MIT'], ['yaml', 'ISC'], ['zod', 'MIT']]);
    const text = renderNotices(entries);
    assert.match(text, /## Licences \(4 packages\)/);
    assert.match(text, /\| ISC \| 1 \|\n\| MIT \| 2 \|\n\| UNKNOWN \| 1 \|/);
    assert.match(text, /\| react \| MIT \| https:\/\/react\.dev\/ \|/);
    assert.match(text, /\| yaml \| ISC \|  \|/);
  });

  it('names no version, so that a version bump leaves the file as it is', () => {
    const listing = (version: string): unknown => ({ MIT: [{ name: 'zod', versions: [version], homepage: 'https://zod.dev' }] });
    assert.equal(renderNotices(entriesOf(listing('4.1.11'))), renderNotices(entriesOf(listing('4.6.7'))));
  });
});
