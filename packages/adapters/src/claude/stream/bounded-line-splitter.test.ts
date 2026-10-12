import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BoundedLineSplitter } from './bounded-line-splitter.ts';

interface CollectedLine {
  readonly line: string;
  readonly truncated: boolean;
}

function collect(maxLineBytes: number, chunks: readonly string[]): readonly CollectedLine[] {
  const lines: CollectedLine[] = [];
  const splitter = new BoundedLineSplitter(maxLineBytes, (line, truncated) => lines.push({ line, truncated }));
  chunks.forEach((chunk) => splitter.push(Buffer.from(chunk)));
  splitter.flush();
  return lines;
}

describe('BoundedLineSplitter', () => {
  it('reassembles lines split across chunks', () => {
    expect(collect(1_000, ['{"a":', '1}\n{"b"', ':2}\n'])).toEqual([
      { line: '{"a":1}', truncated: false },
      { line: '{"b":2}', truncated: false },
    ]);
  });

  it('emits a final line without a trailing newline on flush', () => {
    expect(collect(1_000, ['one\ntwo'])).toEqual([
      { line: 'one', truncated: false },
      { line: 'two', truncated: false },
    ]);
  });

  it('drops carriage returns and blank lines', () => {
    expect(collect(1_000, ['one\r\n\n\r\ntwo\n'])).toEqual([
      { line: 'one', truncated: false },
      { line: 'two', truncated: false },
    ]);
  });

  it('caps an oversized line and resumes with the next one', () => {
    expect(collect(4, ['abcdefgh', 'ij\nok\n'])).toEqual([
      { line: 'abcd', truncated: true },
      { line: 'ok', truncated: false },
    ]);
  });

  it('keeps multi-byte characters split across chunks intact', () => {
    const encoded = Buffer.from('é\n');
    const lines: string[] = [];
    const splitter = new BoundedLineSplitter(100, (line) => lines.push(line));
    splitter.push(encoded.subarray(0, 1));
    splitter.push(encoded.subarray(1));
    expect(lines).toEqual(['é']);
  });

  it('yields the same lines however the stream is chunked', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ unit: fc.constantFrom('a', 'b', '{', '}') , minLength: 1, maxLength: 10 }), { maxLength: 15 }),
        fc.array(fc.integer({ min: 1, max: 7 }), { minLength: 1, maxLength: 10 }),
        (records, cuts) => {
          const text = records.map((record) => `${record}\n`).join('');
          const chunks: string[] = [];
          let offset = 0;
          let cut = 0;
          while (offset < text.length) {
            const size = cuts[cut % cuts.length] ?? 1;
            chunks.push(text.slice(offset, offset + size));
            offset += size;
            cut += 1;
          }
          expect(collect(1_000, chunks).map((entry) => entry.line)).toEqual(records);
        },
      ),
    );
  });
});
