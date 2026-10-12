import { describe, expect, it } from 'vitest';
import { COMMAND_TOKEN_BYTES, CommandToken } from './command-token.ts';

describe('CommandToken', () => {
  it('generates an unpredictable value per instance', () => {
    const first = CommandToken.generate();
    expect(first.value).toMatch(new RegExp(`^[0-9a-f]{${COMMAND_TOKEN_BYTES * 2}}$`));
    expect(CommandToken.generate().value).not.toBe(first.value);
  });

  it('accepts only its own value', () => {
    const token = CommandToken.generate();
    expect(token.matches(token.value)).toBe(true);
    expect(token.matches(`${token.value}0`)).toBe(false);
    expect(token.matches('')).toBe(false);
    expect(token.matches(undefined)).toBe(false);
    expect(token.matches([token.value])).toBe(false);
    expect(token.matches(CommandToken.generate().value)).toBe(false);
  });
});
