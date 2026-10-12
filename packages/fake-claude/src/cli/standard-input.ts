import type { Readable } from 'node:stream';

const TEXT_ENCODING = 'utf8';

export async function readText(input: Readable): Promise<string> {
  input.setEncoding(TEXT_ENCODING);
  let text = '';
  for await (const chunk of input) {
    text += String(chunk);
  }
  return text;
}
