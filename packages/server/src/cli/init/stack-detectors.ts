import { z } from 'zod';
import type { RepositoryFiles } from './repository-inspection.ts';

/** A command as config.yaml writes it; `network` says why it needs the network. */
export interface DraftCommand {
  readonly name: string;
  readonly run: string;
  readonly network?: string;
}

export interface StackCommands {
  /** What was recognised, for the operator to check: "Node.js with pnpm". */
  readonly stack: string;
  readonly setup: readonly DraftCommand[];
  readonly beforeAcceptance: readonly DraftCommand[];
  readonly afterAcceptance: readonly DraftCommand[];
}

/** Recognises one kind of repository and proposes its setup and gate commands. */
export interface StackDetector {
  detect(files: RepositoryFiles): Promise<StackCommands | null>;
}

const INSTALL_STEP = 'install';
const LINT_STEP = 'lint';
const TYPECHECK_STEP = 'typecheck';
const TEST_STEP = 'test';
const DOWNLOADS_DEPENDENCIES = 'downloads the locked dependencies from the package registry';
const NO_TEST_PLACEHOLDER = 'no test specified';

function command(name: string, run: string, network?: string): DraftCommand {
  return network === undefined ? { name, run } : { name, run, network };
}

/** The `script/<verb>` front doors of the repository, when it has them: they know the project best. */
export class FrontDoorScripts implements StackDetector {
  static readonly SETUP_SCRIPTS = ['script/setup', 'script/bootstrap'] as const;
  static readonly LINT_SCRIPT = 'script/lint';
  static readonly TEST_SCRIPT = 'script/test';

  detect(files: RepositoryFiles): Promise<StackCommands | null> {
    if (!files.has(FrontDoorScripts.TEST_SCRIPT)) return Promise.resolve(null);
    const setup = FrontDoorScripts.SETUP_SCRIPTS.find((script) => files.has(script));
    return Promise.resolve({
      stack: 'the repository scripts in script/',
      setup: setup === undefined ? [] : [command(INSTALL_STEP, setup, DOWNLOADS_DEPENDENCIES)],
      beforeAcceptance: files.has(FrontDoorScripts.LINT_SCRIPT) ? [command(LINT_STEP, FrontDoorScripts.LINT_SCRIPT)] : [],
      afterAcceptance: [command(TEST_STEP, FrontDoorScripts.TEST_SCRIPT)],
    });
  }
}

const MISE_FILES = ['mise.toml', '.mise.toml'] as const;
const MISE_TASK_HEADER = /^\[tasks\.("?)([A-Za-z0-9:_-]+)\1\]/gm;
const MISE_SETUP_TASKS = ['setup', 'install', 'bootstrap'] as const;

function miseTasks(text: string): ReadonlySet<string> {
  return new Set([...text.matchAll(MISE_TASK_HEADER)].map((match) => match[2] ?? ''));
}

/** The tasks of a mise.toml with a test task. */
export class MiseTasks implements StackDetector {
  async detect(files: RepositoryFiles): Promise<StackCommands | null> {
    for (const file of MISE_FILES) {
      const text = await files.text(file);
      if (text === null) continue;
      const tasks = miseTasks(text);
      if (!tasks.has(TEST_STEP)) continue;
      const setup = MISE_SETUP_TASKS.find((task) => tasks.has(task));
      return {
        stack: `the mise tasks of ${file}`,
        setup: setup === undefined ? [] : [command(INSTALL_STEP, `mise run ${setup}`, DOWNLOADS_DEPENDENCIES)],
        beforeAcceptance: tasks.has(LINT_STEP) ? [command(LINT_STEP, 'mise run lint')] : [],
        afterAcceptance: [command(TEST_STEP, 'mise run test')],
      };
    }
    return null;
  }
}

const MAKEFILE = 'Makefile';

function makeTargets(text: string): ReadonlySet<string> {
  return new Set([...text.matchAll(/^([A-Za-z0-9_.-]+)\s*:(?!=)/gm)].map((match) => match[1] ?? ''));
}

/** A Makefile with a test target. */
export class MakefileTargets implements StackDetector {
  async detect(files: RepositoryFiles): Promise<StackCommands | null> {
    const text = await files.text(MAKEFILE);
    if (text === null) return null;
    const targets = makeTargets(text);
    if (!targets.has(TEST_STEP)) return null;
    const setup = ['install', 'setup', 'deps'].find((target) => targets.has(target));
    return {
      stack: 'the Makefile targets',
      setup: setup === undefined ? [] : [command(INSTALL_STEP, `make ${setup}`, DOWNLOADS_DEPENDENCIES)],
      beforeAcceptance: targets.has(LINT_STEP) ? [command(LINT_STEP, 'make lint')] : [],
      afterAcceptance: [command(TEST_STEP, 'make test')],
    };
  }
}

const PackageJsonSchema = z.object({
  packageManager: z.string().optional(),
  scripts: z.record(z.string(), z.string()).optional(),
});

interface NodePackageManager {
  readonly name: string;
  readonly install: string;
  run(script: string): string;
}

const TYPECHECK_SCRIPTS = ['typecheck', 'type-check', 'check-types', 'types'] as const;

function nodePackageManager(files: RepositoryFiles, declared: string | undefined): NodePackageManager {
  const named = declared?.split('@')[0];
  if (named === 'pnpm' || files.has('pnpm-lock.yaml')) return { name: 'pnpm', install: 'pnpm install --frozen-lockfile', run: (script) => `pnpm run ${script}` };
  if (named === 'yarn' || files.has('yarn.lock')) {
    const berry = files.has('.yarnrc.yml') || (declared !== undefined && !declared.startsWith('yarn@1'));
    return { name: 'yarn', install: berry ? 'yarn install --immutable' : 'yarn install --frozen-lockfile', run: (script) => `yarn run ${script}` };
  }
  if (named === 'bun' || files.has('bun.lock') || files.has('bun.lockb')) return { name: 'bun', install: 'bun install --frozen-lockfile', run: (script) => `bun run ${script}` };
  return { name: 'npm', install: files.has('package-lock.json') ? 'npm ci' : 'npm install', run: (script) => `npm run ${script}` };
}

/** A Node.js package: its package manager installs, and its own scripts lint, type-check and test. */
export class NodePackage implements StackDetector {
  async detect(files: RepositoryFiles): Promise<StackCommands | null> {
    const text = await files.text('package.json');
    if (text === null) return null;
    let manifest: z.infer<typeof PackageJsonSchema>;
    try {
      manifest = PackageJsonSchema.parse(JSON.parse(text));
    } catch {
      return null;
    }
    const scripts = manifest.scripts ?? {};
    const manager = nodePackageManager(files, manifest.packageManager);
    const typecheck = TYPECHECK_SCRIPTS.find((script) => scripts[script] !== undefined);
    const test = scripts[TEST_STEP];
    return {
      stack: `Node.js with ${manager.name}`,
      setup: [command(INSTALL_STEP, manager.install, DOWNLOADS_DEPENDENCIES)],
      beforeAcceptance: [
        ...(scripts[LINT_STEP] === undefined ? [] : [command(LINT_STEP, manager.run(LINT_STEP))]),
        ...(typecheck === undefined ? [] : [command(TYPECHECK_STEP, manager.run(typecheck))]),
      ],
      afterAcceptance: test === undefined || test.includes(NO_TEST_PLACEHOLDER) ? [] : [command(TEST_STEP, manager.run(TEST_STEP))],
    };
  }
}

interface PythonRunner {
  readonly name: string;
  readonly install: string;
  readonly prefix: string;
}

/** A Python project: uv, Poetry or a virtual environment from requirements.txt, with pytest and the linters it configures. */
export class PythonProject implements StackDetector {
  async detect(files: RepositoryFiles): Promise<StackCommands | null> {
    const pyproject = (await files.text('pyproject.toml')) ?? '';
    const runner = this.runner(files);
    if (runner === null) return null;
    const ruff = pyproject.includes('[tool.ruff') || files.has('ruff.toml') || files.has('.ruff.toml');
    const mypy = pyproject.includes('[tool.mypy') || files.has('mypy.ini');
    return {
      stack: `Python with ${runner.name}`,
      setup: [command(INSTALL_STEP, runner.install, DOWNLOADS_DEPENDENCIES)],
      beforeAcceptance: [...(ruff ? [command(LINT_STEP, `${runner.prefix}ruff check .`)] : []), ...(mypy ? [command(TYPECHECK_STEP, `${runner.prefix}mypy .`)] : [])],
      afterAcceptance: [command(TEST_STEP, `${runner.prefix}pytest`)],
    };
  }

  private runner(files: RepositoryFiles): PythonRunner | null {
    if (files.has('uv.lock')) return { name: 'uv', install: 'uv sync --frozen', prefix: 'uv run ' };
    if (files.has('poetry.lock')) return { name: 'Poetry', install: 'poetry install --no-interaction', prefix: 'poetry run ' };
    if (files.has('requirements.txt')) return { name: 'pip', install: 'python3 -m venv .venv && .venv/bin/pip install -r requirements.txt', prefix: '.venv/bin/python -m ' };
    if (files.has('pyproject.toml')) return { name: 'pip', install: 'python3 -m venv .venv && .venv/bin/pip install -e .', prefix: '.venv/bin/python -m ' };
    return null;
  }
}

/** A Go module. */
export class GoModule implements StackDetector {
  detect(files: RepositoryFiles): Promise<StackCommands | null> {
    if (!files.has('go.mod')) return Promise.resolve(null);
    return Promise.resolve({
      stack: 'Go modules',
      setup: [command(INSTALL_STEP, 'go mod download', 'downloads the modules go.sum names')],
      beforeAcceptance: [command('vet', 'go vet ./...')],
      afterAcceptance: [command(TEST_STEP, 'go test ./...')],
    });
  }
}

/** A Cargo package or workspace. */
export class CargoPackage implements StackDetector {
  detect(files: RepositoryFiles): Promise<StackCommands | null> {
    if (!files.has('Cargo.toml')) return Promise.resolve(null);
    const locked = files.has('Cargo.lock') ? ' --locked --offline' : '';
    return Promise.resolve({
      stack: 'Rust with Cargo',
      setup: [command(INSTALL_STEP, 'cargo fetch', 'downloads the crates Cargo.lock names')],
      beforeAcceptance: [command('check', `cargo check --all-targets${locked}`)],
      afterAcceptance: [command(TEST_STEP, `cargo test${locked}`)],
    });
  }
}

/** A Maven or Gradle build, through its wrapper when the repository has one. */
export class JvmBuild implements StackDetector {
  detect(files: RepositoryFiles): Promise<StackCommands | null> {
    if (files.has('pom.xml')) {
      const maven = files.has('mvnw') ? './mvnw' : 'mvn';
      return Promise.resolve({
        stack: 'Java with Maven',
        setup: [command(INSTALL_STEP, `${maven} -B -q dependency:go-offline`, 'downloads the plugins and dependencies the build names')],
        beforeAcceptance: [],
        afterAcceptance: [command(TEST_STEP, `${maven} -B -o test`)],
      });
    }
    if (files.has('build.gradle') || files.has('build.gradle.kts')) {
      const gradle = files.has('gradlew') ? './gradlew' : 'gradle';
      return Promise.resolve({
        stack: 'JVM with Gradle',
        setup: [command(INSTALL_STEP, `${gradle} --no-daemon dependencies`, 'downloads Gradle and the dependencies the build names')],
        beforeAcceptance: [],
        afterAcceptance: [command(TEST_STEP, `${gradle} --no-daemon --offline test`)],
      });
    }
    return Promise.resolve(null);
  }
}

/** The detectors in the order they are tried: the repository's own front doors first, then its language. */
export const STACK_DETECTORS: readonly StackDetector[] = [
  new FrontDoorScripts(),
  new MiseTasks(),
  new MakefileTargets(),
  new NodePackage(),
  new PythonProject(),
  new GoModule(),
  new CargoPackage(),
  new JvmBuild(),
];

export async function detectStack(files: RepositoryFiles, detectors: readonly StackDetector[] = STACK_DETECTORS): Promise<StackCommands | null> {
  for (const detector of detectors) {
    const commands = await detector.detect(files);
    if (commands !== null) return commands;
  }
  return null;
}
