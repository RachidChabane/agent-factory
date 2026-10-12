import { configJsonSchemaText } from '../../config/config-json-schema.ts';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES } from '../output.ts';

/** Prints the JSON Schema of config.yaml, for editors and for checking a configuration elsewhere. */
export function schemaCommand(context: CliContext): number {
  context.output.line(configJsonSchemaText().trimEnd());
  return EXIT_CODES.ok;
}
