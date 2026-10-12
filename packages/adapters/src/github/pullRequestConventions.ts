export function withClosingLines(body: string, closes: readonly number[]): string {
  const missing = closes.filter((number) => !new RegExp(`Closes #${number}\\b`).test(body));
  if (missing.length === 0) return body;
  return `${body.trimEnd()}\n\n${missing.map((number) => `Closes #${number}`).join('\n')}\n`;
}
