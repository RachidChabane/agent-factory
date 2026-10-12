import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SpawnCommandRunner } from '@agent-factory/adapters';
import { referenceSnapshotPath } from '@agent-factory/application';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseAgentFactoryConfig, projectOf, type ProjectConfig } from '../../config/agent-factory-config.ts';
import { gitIn, REAL_GIT_TEST_TIMEOUT_MS } from '../../cli/testing/cli-harness.ts';
import { openReferenceSnapshots, referenceMounts, referenceSnapshotDirectories } from './references.ts';

const TAG = 'v1.0.0';

describe('the reference snapshots of a project', { timeout: REAL_GIT_TEST_TIMEOUT_MS }, () => {
  let home: string;
  let source: string;
  let project: ProjectConfig;

  beforeEach(async () => {
    home = await realpath(await mkdtemp(join(tmpdir(), 'factory-references-')));
    source = join(home, 'design-tokens-source');
    await mkdir(source);
    gitIn(source, 'init', '--quiet', '--initial-branch', 'main');
    await writeFile(join(source, 'tokens.json'), '{"space":4}\n');
    gitIn(source, 'add', '--all');
    gitIn(source, 'commit', '--quiet', '--message', 'seed');
    gitIn(source, 'tag', TAG);
    const text = [
      'version: 1',
      'projects:',
      '  - id: storefront',
      '    name: Storefront',
      '    forge: { kind: github, repository: example-org/storefront }',
      '    commitIdentity: { name: Bot, email: bot@example.invalid }',
      `    references: [{ name: design-tokens, repository: example-org/design-tokens, ref: ${TAG}, source: ${source} }, { name: icons, repository: example-org/icons, ref: v2, source: ${source} }]`,
    ].join('\n');
    project = projectOf(parseAgentFactoryConfig(text, home, join(home, 'config.yaml'), home), 'storefront');
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it('keep to the references directory of the project, canonical, with the layout the sandboxes are told', async () => {
    const snapshots = await openReferenceSnapshots(project, {}, new SpawnCommandRunner());

    expect(snapshots.pathOf(project.references[0] ?? fail('no reference'))).toBe(join(project.directories.references, `design-tokens@${TAG}`));
    expect(referenceSnapshotDirectories(project)).toEqual(project.references.map((reference) => referenceSnapshotPath(project.directories.references, reference)));
    expect(referenceSnapshotDirectories(project)).toContain(snapshots.pathOf(project.references[0] ?? fail('no reference')));
  });

  it('are mounted for the agents of the project once built, with the commit they were built from, and not before', async () => {
    const snapshots = await openReferenceSnapshots(project, {}, new SpawnCommandRunner());
    const mounts = referenceMounts(project, snapshots);
    expect(await mounts()).toEqual([]);

    const built = await snapshots.materialise(project.references[0] ?? fail('no reference'));

    expect(await mounts()).toEqual([
      { name: 'design-tokens', repository: 'example-org/design-tokens', ref: TAG, commit: gitIn(source, 'rev-parse', 'HEAD'), path: built.path },
    ]);
  });

  it('follow a snapshot rebuilt after the mounts were made', async () => {
    const snapshots = await openReferenceSnapshots(project, {}, new SpawnCommandRunner());
    const mounts = referenceMounts(project, snapshots);
    const reference = project.references[0] ?? fail('no reference');
    await snapshots.materialise(reference);
    const first = gitIn(source, 'rev-parse', 'HEAD');
    await writeFile(join(source, 'tokens.json'), '{"space":8}\n');
    gitIn(source, 'commit', '--quiet', '--all', '--message', 'move the tag');
    gitIn(source, 'tag', '--force', TAG);

    expect((await mounts())[0]?.commit).toBe(first);
    await snapshots.materialise(reference);
    expect((await mounts())[0]?.commit).toBe(gitIn(source, 'rev-parse', 'HEAD'));
  });
});

function fail(message: string): never {
  throw new Error(message);
}
