import { invalidInvocation } from '../errors.ts';
import { builtInScript } from './built-in-scripts.ts';
import { detectRole } from './role-detection.ts';
import type { FakeRole, Scenario, Script } from './scenario.ts';
import type { ScriptReference } from './script-reference.ts';

export interface SelectedScript {
  readonly reference: ScriptReference;
  readonly script: Script;
}

export function selectScript(scenario: Scenario, prompt: string): SelectedScript {
  const role = detectRole(prompt, scenario.signatures);
  if (role === null) {
    return builtIn(null);
  }
  const index = scenario.entries.findIndex((entry) => entry.role === role && prompt.includes(entry.when));
  const entry = scenario.entries[index];
  if (entry !== undefined) {
    return { reference: { source: 'entry', index }, script: entry };
  }
  const fallback = scenario.fallback[role];
  return fallback === undefined ? builtIn(role) : { reference: { source: 'fallback', role }, script: fallback };
}

export function resolveScript(scenario: Scenario, reference: ScriptReference): Script {
  switch (reference.source) {
    case 'entry':
      return scenario.entries[reference.index] ?? missingScript(`entries[${String(reference.index)}]`);
    case 'fallback':
      return scenario.fallback[reference.role] ?? missingScript(`fallback.${reference.role}`);
    case 'built-in':
      return builtInScript(reference.role);
  }
}

function builtIn(role: FakeRole | null): SelectedScript {
  return { reference: { source: 'built-in', role }, script: builtInScript(role) };
}

function missingScript(location: string): never {
  throw invalidInvocation(`the session was started from scenario ${location}, which the scenario no longer defines`);
}
