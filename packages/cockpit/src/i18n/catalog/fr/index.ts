import type { en } from '../en/index.ts';
import type { TwinOf } from '../types.ts';
import { frCommon } from './common.ts';
import { frVocabulary } from './vocabulary.ts';
import { frReadings } from './readings.ts';
import { frWidgets } from './widgets.ts';
import { frShell } from './shell.ts';
import { frBoard } from './board.ts';
import { frChanges } from './changes.ts';
import { frCommands } from './commands.ts';
import { frRequests } from './requests.ts';
import { frIssues } from './issues.ts';
import { frPullRequests } from './pull-requests.ts';
import { frDelivery } from './delivery.ts';
import { frReleases } from './releases.ts';
import { frAudits } from './audits.ts';
import { frKnowledge } from './knowledge.ts';
import { frSettings } from './settings.ts';
import { frConfiguration } from './configuration.ts';
import { frRuns } from './runs.ts';
import { frUsage } from './usage.ts';
import { frAutonomy } from './autonomy.ts';

export const frFragments = {
  common: frCommon,
  vocabulary: frVocabulary,
  readings: frReadings,
  widgets: frWidgets,
  shell: frShell,
  board: frBoard,
  changes: frChanges,
  commands: frCommands,
  requests: frRequests,
  issues: frIssues,
  pullRequests: frPullRequests,
  delivery: frDelivery,
  releases: frReleases,
  audits: frAudits,
  knowledge: frKnowledge,
  settings: frSettings,
  configuration: frConfiguration,
  runs: frRuns,
  usage: frUsage,
  autonomy: frAutonomy,
} as const;

export const fr = {
  ...frCommon,
  ...frVocabulary,
  ...frReadings,
  ...frWidgets,
  ...frShell,
  ...frBoard,
  ...frChanges,
  ...frCommands,
  ...frRequests,
  ...frIssues,
  ...frPullRequests,
  ...frDelivery,
  ...frReleases,
  ...frAudits,
  ...frKnowledge,
  ...frSettings,
  ...frConfiguration,
  ...frRuns,
  ...frUsage,
  ...frAutonomy,
} as const satisfies TwinOf<typeof en>;
