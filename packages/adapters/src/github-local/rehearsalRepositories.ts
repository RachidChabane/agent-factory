import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CommandRunner } from '@agent-factory/application';
import { DEFAULT_REMOTE_NAME } from '../git/constants.ts';
import { GitCli } from '../git/gitCli.ts';
import { RemoteLocalityGuard } from '../git/remoteLocality.ts';
import { BRANCH_REF_PREFIX } from './constants.ts';
import { RehearsalSetupError } from './errors.ts';

const BARE_REPOSITORY_ANSWER = 'true';
const FORCED_REFSPEC_PREFIX = '+';

export interface RehearsalLayout {
  readonly sourceClonePath: string;
  readonly bareRepositoryPath: string;
  readonly workingClonePath: string;
  readonly baseBranch: string;
}

export interface RehearsalSetup {
  readonly bareRepository: 'created' | 'kept';
  readonly workingClone: 'created' | 'kept';
  readonly baseSha: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export class RehearsalRepositories {
  private readonly git: GitCli;
  private readonly guard: RemoteLocalityGuard;

  constructor(runner: CommandRunner, localOnlyEnvironment: Readonly<Record<string, string>>) {
    this.git = new GitCli(runner, localOnlyEnvironment);
    this.guard = new RemoteLocalityGuard(runner, localOnlyEnvironment);
  }

  async initialise(layout: RehearsalLayout): Promise<RehearsalSetup> {
    const bareRepository = await this.prepareBareRepository(layout);
    const workingClone = await this.prepareWorkingClone(layout);
    await this.guard.assertLocalOnly([layout.bareRepositoryPath, layout.workingClonePath]);
    const baseSha = await this.git.runTrimmed(layout.bareRepositoryPath, ['rev-parse', '--verify', `${BRANCH_REF_PREFIX}${layout.baseBranch}`]);
    return { bareRepository, workingClone, baseSha };
  }

  async resetBase(layout: RehearsalLayout): Promise<string> {
    if (!(await exists(layout.bareRepositoryPath))) throw new RehearsalSetupError(`${layout.bareRepositoryPath} does not exist; run the rehearsal init first`);
    await this.assertBareRepository(layout.bareRepositoryPath);
    await this.assertCloneOfBareRepository(layout);
    const baseRef = `${BRANCH_REF_PREFIX}${layout.baseBranch}`;
    const sourceClonePath = resolve(layout.sourceClonePath);
    await this.git.run(sourceClonePath, ['rev-parse', '--verify', baseRef]);
    await this.git.run(layout.bareRepositoryPath, ['fetch', '--quiet', '--no-tags', sourceClonePath, `${FORCED_REFSPEC_PREFIX}${baseRef}:${baseRef}`]);
    await this.git.run(layout.workingClonePath, ['fetch', '--quiet', '--prune', DEFAULT_REMOTE_NAME]);
    await this.git.run(layout.workingClonePath, ['checkout', '--quiet', '-B', layout.baseBranch, `${DEFAULT_REMOTE_NAME}/${layout.baseBranch}`]);
    await this.git.run(layout.workingClonePath, ['reset', '--quiet', '--hard', `${DEFAULT_REMOTE_NAME}/${layout.baseBranch}`]);
    await this.guard.assertLocalOnly([layout.bareRepositoryPath, layout.workingClonePath]);
    return this.git.runTrimmed(layout.bareRepositoryPath, ['rev-parse', '--verify', baseRef]);
  }

  private async assertBareRepository(path: string): Promise<void> {
    const bare = await this.git.runTrimmed(path, ['rev-parse', '--is-bare-repository']);
    if (bare !== BARE_REPOSITORY_ANSWER) throw new RehearsalSetupError(`${path} exists and is not a bare repository`);
  }

  private async assertCloneOfBareRepository(layout: RehearsalLayout): Promise<void> {
    const origin = await this.git
      .runTrimmed(layout.workingClonePath, ['remote', 'get-url', DEFAULT_REMOTE_NAME])
      .catch(() => null);
    if (origin === null || resolve(origin) !== resolve(layout.bareRepositoryPath)) {
      throw new RehearsalSetupError(`${layout.workingClonePath} exists and is not a clone of ${layout.bareRepositoryPath}`);
    }
  }

  private async prepareBareRepository(layout: RehearsalLayout): Promise<RehearsalSetup['bareRepository']> {
    if (await exists(layout.bareRepositoryPath)) {
      await this.assertBareRepository(layout.bareRepositoryPath);
      return 'kept';
    }
    await this.git.run(resolve(layout.sourceClonePath), ['rev-parse', '--verify', `${BRANCH_REF_PREFIX}${layout.baseBranch}`]);
    await this.git.run(resolve(layout.sourceClonePath), ['clone', '--bare', '--no-hardlinks', '--quiet', resolve(layout.sourceClonePath), layout.bareRepositoryPath]);
    await this.git.run(layout.bareRepositoryPath, ['remote', 'remove', DEFAULT_REMOTE_NAME]);
    return 'created';
  }

  private async prepareWorkingClone(layout: RehearsalLayout): Promise<RehearsalSetup['workingClone']> {
    if (await exists(layout.workingClonePath)) {
      await this.assertCloneOfBareRepository(layout);
      await this.git.run(layout.workingClonePath, ['fetch', '--quiet', DEFAULT_REMOTE_NAME]);
      return 'kept';
    }
    await this.git.run(resolve(layout.bareRepositoryPath), ['clone', '--quiet', '--branch', layout.baseBranch, layout.bareRepositoryPath, layout.workingClonePath]);
    return 'created';
  }
}
