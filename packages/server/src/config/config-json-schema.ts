import { z } from 'zod';
import { AgentFactoryConfigSchema } from './schema/root.ts';

export const CONFIG_SCHEMA_ID = 'https://raw.githubusercontent.com/RachidChabane/agent-factory/main/schema/config.schema.json';
const CONFIG_SCHEMA_TITLE = 'Agent Factory configuration';
const CONFIG_SCHEMA_DESCRIPTION = 'The config.yaml of an Agent Factory installation: shared settings and the projects it works on.';
const JSON_INDENT = 2;

/** The JSON Schema editors use for completion and inline errors, generated from the zod schema the factory validates with. */
export function configJsonSchema(): Record<string, unknown> {
  const generated = z.toJSONSchema(AgentFactoryConfigSchema, { io: 'input', unrepresentable: 'any' });
  return { ...generated, $id: CONFIG_SCHEMA_ID, title: CONFIG_SCHEMA_TITLE, description: CONFIG_SCHEMA_DESCRIPTION };
}

export function configJsonSchemaText(): string {
  return `${JSON.stringify(configJsonSchema(), null, JSON_INDENT)}\n`;
}
