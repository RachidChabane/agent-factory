import { resolve } from 'node:path';
import { invalidInvocation } from '../errors.ts';
import { readJsonFile, validateDocument } from '../json/json-file.ts';
import { parseScenario } from './scenario-parser.ts';
import type { Scenario } from './scenario.ts';

const SCENARIO_LABEL = 'scenario';

export async function loadScenario(scenarioArgument: string | null, workingDirectory: string): Promise<Scenario> {
  if (scenarioArgument === null) {
    throw invalidInvocation('--scenario <file> is required');
  }
  const file = resolve(workingDirectory, scenarioArgument);
  const document = await readJsonFile(file, SCENARIO_LABEL);
  return validateDocument(SCENARIO_LABEL, file, () => parseScenario(document));
}
