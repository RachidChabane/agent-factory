import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AddRequest, requestChallenge, requestTitleOf } from '@agent-factory/application';
import { requestChallenger } from '../../composition/project/project-use-cases.ts';
import type { CliContext } from '../cli-context.ts';
import { COMMAND_NAMES, REQUEST_SUBCOMMANDS } from '../command-line.ts';
import { EXIT_CODES } from '../output.ts';
import { abortOnShutdown } from '../shutdown.ts';
import { runningFactory, withFactoryLock } from './factory-running.ts';
import { nextCommand, selectedProject, withAgentSession, withProjectEvents, type SelectedProject } from './project-session.ts';

const UTF8 = 'utf8';
const CLI_CHANNEL = 'cli';
const REPORT_FILE = 'report.md';
const REPLY_FILE = 'reply.md';

async function imageNames(directory: string): Promise<readonly string[]> {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

export async function requestAddCommand(path: string, imagesDirectory: string | null, requester: string, requested: string | null, context: CliContext): Promise<number> {
  const selected = await selectedProject(context, requested);
  const { project } = selected;
  const body = await readFile(resolve(context.workingDirectory, path), UTF8);
  const sourceDirectory = imagesDirectory === null ? null : resolve(context.workingDirectory, imagesDirectory);
  const images = sourceDirectory === null ? [] : (await imageNames(sourceDirectory)).map((name) => ({ name, sourceDirectory }));
  const added = await withProjectEvents(context, selected, (events) =>
    new AddRequest({ events, files: context.files, clock: context.clock }, { requestsDirectory: project.directories.requests }).add({
      title: requestTitleOf(body),
      requester,
      channel: CLI_CHANNEL,
      body,
      images,
    }),
  );
  context.output.line(`Request ${added.id} of ${project.id} stored with ${added.attachments.length} image(s) in ${join(project.directories.requests, added.id)}`);
  context.output.line(`Challenge it with "${nextCommand(selected, COMMAND_NAMES.request, REQUEST_SUBCOMMANDS.challenge, added.id)}"`);
  return EXIT_CODES.ok;
}

async function challengeNow(requestId: string, selected: SelectedProject, context: CliContext): Promise<number> {
  return withAgentSession(context, selected, async ({ installation, project }) => {
    const controller = new AbortController();
    const releaseSignals = abortOnShutdown(controller, context.output);
    try {
      const outcome = await requestChallenger(project, installation).challenge(requestId, controller.signal);
      if (outcome.status === 'failed') {
        context.output.error(`The challenge of ${requestId} failed: ${outcome.reason}`);
        return EXIT_CODES.failure;
      }
      const directory = join(project.config.directories.requests, requestId);
      context.output.line(`Request ${requestId} challenged: ${outcome.items.length} item(s), report ${join(directory, REPORT_FILE)}, reply ${join(directory, REPLY_FILE)}`);
      for (const path of outcome.specPaths) context.output.line(`Proposed spec: ${join(directory, path)}`);
      for (const report of outcome.problems) context.output.error(`${report.specId}: ${report.problems.join('; ')}`);
      return EXIT_CODES.ok;
    } finally {
      releaseSignals();
    }
  });
}

export async function requestChallengeCommand(requestId: string, requested: string | null, context: CliContext): Promise<number> {
  const selected = await selectedProject(context, requested);
  const running = await runningFactory(selected.config);
  if (running === null) return withFactoryLock(selected.config, () => challengeNow(requestId, selected, context));
  await withProjectEvents(context, selected, (events) => requestChallenge(events, requestId, CLI_CHANNEL));
  context.output.line(`Request ${requestId} queued; the factory running as process ${running} challenges it`);
  return EXIT_CODES.ok;
}
