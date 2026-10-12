import { describe, expect, it } from 'vitest';
import { splitCodeFences } from './assistant-text.ts';

describe('splitCodeFences', () => {
  it('keeps plain prose as one segment', () => {
    expect(splitCodeFences('  Reading the frozen tests first.  ')).toEqual([{ kind: 'prose', text: 'Reading the frozen tests first.' }]);
  });

  it('separates a fenced block from the prose around it', () => {
    const text = 'Here is the plan:\n```ts\nconst answer = 42;\n```\nThat is all.';
    expect(splitCodeFences(text)).toEqual([
      { kind: 'prose', text: 'Here is the plan:' },
      { kind: 'code', text: 'const answer = 42;' },
      { kind: 'prose', text: 'That is all.' },
    ]);
  });

  it('reads an answer that is nothing but a fenced block of JSON', () => {
    expect(splitCodeFences('```json\n{ "findings": [] }\n```')).toEqual([{ kind: 'code', text: '{ "findings": [] }' }]);
  });

  it('keeps several blocks in order', () => {
    const kinds = splitCodeFences('a\n```\none\n```\nb\n```\ntwo\n```').map((segment) => segment.kind);
    expect(kinds).toEqual(['prose', 'code', 'prose', 'code']);
  });

  it('leaves a fence that was never closed inside the prose', () => {
    expect(splitCodeFences('Starting a block:\n```ts\nconst unfinished')).toEqual([{ kind: 'prose', text: 'Starting a block:\n```ts\nconst unfinished' }]);
  });

  it('drops what is blank', () => {
    expect(splitCodeFences('   \n  ')).toEqual([]);
    expect(splitCodeFences('')).toEqual([]);
  });
});
