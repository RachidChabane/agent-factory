export const POLICY_ARGUMENT = '--policy';
const STDIN_MAX_CHARACTERS = 4 * 1024 * 1024;

export function policyPathFrom(argv: readonly string[]): string {
  const flagIndex = argv.indexOf(POLICY_ARGUMENT);
  const value = flagIndex === -1 ? undefined : argv[flagIndex + 1];
  if (value === undefined || value === '') {
    throw new Error(`missing ${POLICY_ARGUMENT} argument`);
  }
  return value;
}

export async function readAll(input: NodeJS.ReadableStream): Promise<string> {
  let text = '';
  for await (const chunk of input) {
    text += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    if (text.length > STDIN_MAX_CHARACTERS) {
      throw new Error('hook input exceeds the accepted size');
    }
  }
  return text;
}

export function writeJson(output: NodeJS.WritableStream, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    output.write(`${JSON.stringify(value)}\n`, (error) => (error ? reject(error) : resolve()));
  });
}
