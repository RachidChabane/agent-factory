import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalPath, isWithin, sha256Hex } from '@agent-factory/plugin';

export const RUN_FILE_NAMES = {
  settings: 'settings.json',
  gatePolicy: 'gate-policy.json',
  mcpConfig: 'mcp-config.json',
  appendSystemPrompt: 'append-system-prompt.md',
  streamLog: 'stream.jsonl',
  stderrLog: 'stderr.log',
  gateDecisions: 'gate-decisions.jsonl',
  githubConfig: 'gh-config',
} as const;

const RUN_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

export interface RunWorkspace {
  readonly directory: string;
  readonly settingsPath: string;
  readonly gatePolicyPath: string;
  readonly mcpConfigPath: string;
  readonly appendSystemPromptPath: string;
  readonly streamLogPath: string;
  readonly stderrLogPath: string;
  readonly gateDecisionLogPath: string;
  readonly githubConfigDirectory: string;
}

export interface FileFingerprint {
  readonly path: string;
  readonly sha256: string;
}

export interface IsolationLayout {
  readonly worktree: string;
  readonly runsRoot: string;
  readonly protectedDirectories: readonly string[];
  readonly writableDirectories: readonly string[];
}

export async function resolveIsolationLayout(
  workingDirectory: string,
  runsDirectory: string,
  factoryInstallDirectory: string,
  additionalProtectedDirectories: readonly string[] = [],
  writableDirectories: readonly string[] = [],
): Promise<IsolationLayout> {
  await mkdir(runsDirectory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  const worktree = canonicalPath(workingDirectory);
  const runsRoot = canonicalPath(runsDirectory);
  const protectedDirectories = [
    ...new Set([runsRoot, canonicalPath(factoryInstallDirectory), ...additionalProtectedDirectories.map(canonicalPath)]),
  ];
  for (const directory of protectedDirectories) {
    if (isWithin(directory, worktree) || isWithin(worktree, directory)) {
      throw new Error(`the worktree ${worktree} and the protected directory ${directory} must not contain each other`);
    }
  }
  const writable: string[] = [];
  for (const directory of writableDirectories) {
    await mkdir(directory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
    const canonical = canonicalPath(directory);
    const overlapping = protectedDirectories.find((guarded) => isWithin(guarded, canonical) || isWithin(canonical, guarded));
    if (overlapping !== undefined) {
      throw new Error(`the writable directory ${canonical} and the protected directory ${overlapping} must not contain each other`);
    }
    writable.push(canonical);
  }
  return { worktree, runsRoot, protectedDirectories, writableDirectories: [...new Set(writable)] };
}

export async function createRunWorkspace(runsRoot: string, runId: string): Promise<RunWorkspace> {
  if (!RUN_IDENTIFIER.test(runId)) {
    throw new Error(`run identifier ${JSON.stringify(runId)} is not a safe directory name`);
  }
  const directory = join(runsRoot, runId);
  await mkdir(directory, { mode: PRIVATE_DIRECTORY_MODE });
  const githubConfigDirectory = join(directory, RUN_FILE_NAMES.githubConfig);
  await mkdir(githubConfigDirectory, { mode: PRIVATE_DIRECTORY_MODE });
  return {
    directory,
    settingsPath: join(directory, RUN_FILE_NAMES.settings),
    gatePolicyPath: join(directory, RUN_FILE_NAMES.gatePolicy),
    mcpConfigPath: join(directory, RUN_FILE_NAMES.mcpConfig),
    appendSystemPromptPath: join(directory, RUN_FILE_NAMES.appendSystemPrompt),
    streamLogPath: join(directory, RUN_FILE_NAMES.streamLog),
    stderrLogPath: join(directory, RUN_FILE_NAMES.stderrLog),
    gateDecisionLogPath: join(directory, RUN_FILE_NAMES.gateDecisions),
    githubConfigDirectory,
  };
}

export async function writeRunFile(path: string, content: string): Promise<FileFingerprint> {
  await writeFile(path, content, { mode: PRIVATE_FILE_MODE, flag: 'wx' });
  return { path, sha256: sha256Hex(content) };
}

export async function writeRunJson(path: string, value: unknown): Promise<FileFingerprint> {
  return writeRunFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function changedFiles(fingerprints: readonly FileFingerprint[]): Promise<readonly string[]> {
  const changes = await Promise.all(
    fingerprints.map(async (fingerprint) => {
      const current = await readFile(fingerprint.path).then(sha256Hex, () => null);
      return current === fingerprint.sha256 ? null : fingerprint.path;
    }),
  );
  return changes.filter((path) => path !== null);
}
