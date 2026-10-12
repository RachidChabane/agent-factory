import { forgeFilePath } from '../../contract/index.ts';
import { LEDGER_ID } from './project-ids.ts';

export const STOREFRONT_FORGE_URL = 'https://github.example.com/example-org/storefront';

export interface ForgeLinks {
  issue(number: number): string;
  pullRequest(number: number): string;
}

export const storefrontLinks: ForgeLinks = {
  issue: (number) => `${STOREFRONT_FORGE_URL}/issues/${number}`,
  pullRequest: (number) => `${STOREFRONT_FORGE_URL}/pull/${number}`,
};

/** A local forge has no web address; the cockpit serves its files. */
export const ledgerLinks: ForgeLinks = {
  issue: (number) => forgeFilePath(LEDGER_ID, `issues/${number}.md`),
  pullRequest: (number) => forgeFilePath(LEDGER_ID, `pulls/${number}.md`),
};

export function actionsRunUrl(runId: string): string {
  return `${STOREFRONT_FORGE_URL}/actions/runs/${runId}`;
}

export function workflowUrl(file: string): string {
  return `${STOREFRONT_FORGE_URL}/actions/workflows/${file}`;
}
