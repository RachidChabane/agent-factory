import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AddRequest, requestChallenge, requestTitleOf } from '@agent-factory/application';
import { requestChallenger } from '../../composition/use-cases.ts';
import type { CliContext } from '../cli-context.ts';
import { EXIT_CODES } from '../output.ts';
import type { FactoryConfig } from '../../config/factory-config.ts';
import { abortOnShutdown } from '../shutdown.ts';
import { runningFactory, withFactoryLock } from './factory-running.ts';

const UTF8 = 'utf8';
const CLI_CHANNEL = 'cli';

async function imageNames(directory: string): Promise<readonly string[]> {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

export async function requestAddCommand(path: string, imagesDirectory: string | null, requester: string, context: CliContext): Promise<number> {
  const config = await context.loadConfig();
  const body = await readFile(path, UTF8);
  const images = imagesDirectory === null ? [] : (await imageNames(resolve(imagesDirectory))).map((name) => ({ name, sourceDirectory: resolve(imagesDirectory) }));
  const eventLog = context.openEventLog(config);
  try {
    const added = await new AddRequest(
      { events: eventLog.events, files: context.files, clock: context.clock },
      { requestsDirectory: config.directories.requests },
    ).add({ title: requestTitleOf(body), requester, channel: CLI_CHANNEL, body, images });
    context.output.line(`Request ${added.id} stored with ${added.attachments.length} image(s) in ${config.directories.requests}/${added.id}`);
    context.output.line(`Challenge it with "factory request challenge ${added.id}"`);
    return EXIT_CODES.ok;
  } finally {
    eventLog.close();
  }
}

export async function requestChallengeCommand(requestId: string, context: CliContext): Promise<number> {
  const config = await context.loadConfig();
  const running = await runningFactory(config);
  if (running !== null) {
    const eventLog = context.openEventLog(config);
    try {
      await requestChallenge(eventLog.events, requestId, CLI_CHANNEL);
      context.output.line(`Request ${requestId} queued; the factory running as process ${running} challenges it`);
      return EXIT_CODES.ok;
    } finally {
      eventLog.close();
    }
  }
  return withFactoryLock(config, () => challengeNow(requestId, config, context));
}

async function challengeNow(requestId: string, config: FactoryConfig, context: CliContext): Promise<number> {
  const factory = await context.openFactory(config);
  const controller = new AbortController();
  const releaseSignals = abortOnShutdown(controller, context.output);
  try {
    const outcome = await requestChallenger(factory).challenge(requestId, controller.signal);
    if (outcome.status === 'failed') {
      context.output.error(`The challenge of ${requestId} failed: ${outcome.reason}`);
      return EXIT_CODES.failure;
    }
    const directory = `${config.directories.requests}/${requestId}`;
    context.output.line(`Request ${requestId} challenged: ${outcome.items.length} item(s), report ${directory}/report.md, reply ${directory}/reply.md`);
    for (const path of outcome.specPaths) context.output.line(`Proposed spec: ${directory}/${path}`);
    for (const report of outcome.problems) context.output.error(`${report.specId}: ${report.problems.join('; ')}`);
    return EXIT_CODES.ok;
  } finally {
    releaseSignals();
    factory.close();
  }
}
