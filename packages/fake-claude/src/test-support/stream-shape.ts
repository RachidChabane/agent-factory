import { dig, digList, digString, type JsonObject } from './json-navigation.ts';

/** A short label per stream line, so a test can assert the order of a whole run in one comparison. */
export function shapeOf(line: JsonObject): string {
  const type = digString(line, 'type');
  switch (type) {
    case 'system':
      return systemShape(line);
    case 'assistant':
      return assistantShape(line);
    case 'user':
      return userShape(line);
    case 'rate_limit_event':
      return 'rate-limit';
    default:
      return type;
  }
}

export function shapesOf(lines: readonly JsonObject[]): readonly string[] {
  return lines.map(shapeOf);
}

function systemShape(line: JsonObject): string {
  const subtype = digString(line, 'subtype');
  switch (subtype) {
    case 'hook_started':
      return `hook-started:${digString(line, 'hook_event')}`;
    case 'hook_response':
      return `hook-response:${digString(line, 'hook_event')}`;
    case 'permission_denied':
      return 'denied';
    default:
      return subtype;
  }
}

function assistantShape(line: JsonObject): string {
  const block = dig(line, 'message', 'content', 0);
  const kind = digString(block, 'type');
  return kind === 'tool_use' ? `tool-use:${digString(block, 'name')}` : 'say';
}

function userShape(line: JsonObject): string {
  const block = digList(line, 'message', 'content')[0];
  if (digString(block, 'type') === 'text') {
    return 'feedback';
  }
  return dig(block, 'is_error') === true ? 'tool-error' : 'tool-result';
}

export function assistantTexts(lines: readonly JsonObject[]): readonly string[] {
  return lines.flatMap((line) => {
    const block = dig(line, 'message', 'content', 0);
    return digString(line, 'type') === 'assistant' && dig(block, 'type') === 'text' ? [digString(block, 'text')] : [];
  });
}

export function linesOfShape(lines: readonly JsonObject[], shape: string): readonly JsonObject[] {
  return lines.filter((line) => shapeOf(line) === shape);
}
