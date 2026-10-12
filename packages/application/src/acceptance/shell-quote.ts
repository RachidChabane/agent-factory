const SAFE_ARGUMENT = /^[A-Za-z0-9_\-./=:@%+,]+$/;
const SINGLE_QUOTE = "'";
const ESCAPED_SINGLE_QUOTE = `'\\''`;
const ARGUMENT_SEPARATOR = ' ';
const EMPTY_ARGUMENT = "''";

export function shellQuote(argument: string): string {
  if (argument === '') return EMPTY_ARGUMENT;
  if (SAFE_ARGUMENT.test(argument)) return argument;
  return `${SINGLE_QUOTE}${argument.split(SINGLE_QUOTE).join(ESCAPED_SINGLE_QUOTE)}${SINGLE_QUOTE}`;
}

export function shellCommandLine(argv: readonly string[]): string {
  return argv.map(shellQuote).join(ARGUMENT_SEPARATOR);
}
