import type { ProjectConventions } from '@agent-factory/application';
import type { BareRepository } from './bare-repository.ts';
import type { ExampleWorld } from './example-world.ts';
import type { FactoryCli } from './factory-cli.ts';
import type { LocalForge } from './local-forge.ts';
import type { StepJournal } from './step-journal.ts';

/** What every stage of the example run works with. */
export interface JourneyCollaborators {
  readonly journal: StepJournal;
  readonly cli: FactoryCli;
  readonly world: ExampleWorld;
  readonly conventions: ProjectConventions;
  readonly forge: LocalForge;
  readonly repository: BareRepository;
}

/** A pull request the factory opened for an issue, with the commit its branch pointed at when it was opened. */
export interface ReviewedPullRequest {
  readonly issue: number;
  readonly number: number;
  readonly branch: string;
  readonly headSha: string;
}
