import { FACTORY_LABEL } from './constants.ts';

export function withFactoryLabel(labels: readonly string[]): readonly string[] {
  return labels.includes(FACTORY_LABEL) ? labels : [FACTORY_LABEL, ...labels];
}

export function withClosingLines(body: string, closes: readonly number[]): string {
  const missing = closes.filter((number) => !new RegExp(`Closes #${number}\\b`).test(body));
  if (missing.length === 0) return body;
  return `${body.trimEnd()}\n\n${missing.map((number) => `Closes #${number}`).join('\n')}\n`;
}
