import { DEFAULT_PROJECT_CONVENTIONS, type ProjectConventions } from '@agent-factory/application';
import { IssueTypology, type CommitKind, type IssueTypeDefinition } from '@agent-factory/domain';
import type { FactoryConfig } from './factory-config.ts';

const DEPLOYMENT_COMMIT_TYPE: CommitKind = 'feat';
const INFRASTRUCTURE_TYPE = 'infra';

function withConfiguredCommit(type: IssueTypeDefinition, config: FactoryConfig): IssueTypeDefinition {
  const { scopes, types, deploymentPaths } = config.conventionalCommits;
  const whenChanged = type.id === INFRASTRUCTURE_TYPE && deploymentPaths.length > 0 ? [{ paths: deploymentPaths, type: DEPLOYMENT_COMMIT_TYPE }] : type.commit.whenChanged;
  return { ...type, commit: { type: types[type.id] ?? type.commit.type, scope: scopes[type.id] ?? type.commit.scope, whenChanged } };
}

/** The conventions of the configured repository: the preset typology with the configured commit scopes and types. */
export function conventionsFromConfig(config: FactoryConfig): ProjectConventions {
  const typology = new IssueTypology(DEFAULT_PROJECT_CONVENTIONS.typology.definitions.map((type) => withConfiguredCommit(type, config)));
  return { ...DEFAULT_PROJECT_CONVENTIONS, typology, defaultScope: config.conventionalCommits.defaultScope };
}
