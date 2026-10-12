import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const COMMAND_TOKEN_BYTES = 32;
const TOKEN_ENCODING = 'hex';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export class CommandToken {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static generate(): CommandToken {
    return new CommandToken(randomBytes(COMMAND_TOKEN_BYTES).toString(TOKEN_ENCODING));
  }

  matches(presented: string | readonly string[] | undefined): boolean {
    return typeof presented === 'string' && timingSafeEqual(digest(presented), digest(this.value));
  }
}
