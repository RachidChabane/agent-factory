import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createIssueFromPlan, planIssueCreation, specOriginOf, type SpecOrigin } from '@agent-factory/application';
import type { FactoryConfig } from '../../config/factory-config.ts';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES } from '../output.ts';

const UTF8 = 'utf8';
const REMOTE_MODE = 'remote';
const LABEL_SEPARATOR = ', ';

async function originOf(context: CliContext, config: FactoryConfig, specPath: string): Promise<SpecOrigin | null> {
  const eventLog = context.openEventLog(config);
  try {
    return await specOriginOf(eventLog.events, config.directories.requests, resolve(specPath));
  } finally {
    eventLog.close();
  }
}

export async function issueCreateCommand(specPath: string, confirmed: boolean, context: CliContext): Promise<number> {
  const config = await context.loadConfig();
  const text = await readFile(specPath, UTF8);
  const plan = planIssueCreation(text, await originOf(context, config, specPath));
  const target = `${config.target.owner}/${config.target.name}`;
  if (config.github.mode === REMOTE_MODE && !confirmed) {
    context.output.line(`This creates an issue on GitHub in ${target}:`);
    context.output.line(`Title: ${plan.title}`);
    context.output.line(`Labels: ${plan.labels.join(LABEL_SEPARATOR)}`);
    context.output.line('');
    context.output.line(plan.body.trimEnd());
    context.output.line('');
    context.output.error('Nothing was created. Re-run with --confirm to create it.');
    return EXIT_CODES.confirmationRequired;
  }
  const factory = await context.openFactory(config);
  try {
    const issue = await createIssueFromPlan(factory.dependencies, plan);
    const from = plan.origin === null ? '' : ` from ${plan.origin.requestId} ${plan.origin.specId}`;
    context.output.line(`Issue #${issue.number} created in ${target}${from} [${issue.labels.join(LABEL_SEPARATOR)}]; add spec:validated once you have reviewed it`);
    return EXIT_CODES.ok;
  } finally {
    factory.close();
  }
}
