import { enCommon } from './common.ts';
import { enVocabulary } from './vocabulary.ts';
import { enReadings } from './readings.ts';
import { enWidgets } from './widgets.ts';
import { enShell } from './shell.ts';
import { enBoard } from './board.ts';
import { enChanges } from './changes.ts';
import { enCommands } from './commands.ts';
import { enRequests } from './requests.ts';
import { enIssues } from './issues.ts';
import { enPullRequests } from './pull-requests.ts';
import { enDelivery } from './delivery.ts';
import { enReleases } from './releases.ts';
import { enAudits } from './audits.ts';
import { enKnowledge } from './knowledge.ts';
import { enSettings } from './settings.ts';
import { enConfiguration } from './configuration.ts';
import { enRuns } from './runs.ts';
import { enUsage } from './usage.ts';

export const enFragments = {
  common: enCommon,
  vocabulary: enVocabulary,
  readings: enReadings,
  widgets: enWidgets,
  shell: enShell,
  board: enBoard,
  changes: enChanges,
  commands: enCommands,
  requests: enRequests,
  issues: enIssues,
  pullRequests: enPullRequests,
  delivery: enDelivery,
  releases: enReleases,
  audits: enAudits,
  knowledge: enKnowledge,
  settings: enSettings,
  configuration: enConfiguration,
  runs: enRuns,
  usage: enUsage,
} as const;

export const en = {
  ...enCommon,
  ...enVocabulary,
  ...enReadings,
  ...enWidgets,
  ...enShell,
  ...enBoard,
  ...enChanges,
  ...enCommands,
  ...enRequests,
  ...enIssues,
  ...enPullRequests,
  ...enDelivery,
  ...enReleases,
  ...enAudits,
  ...enKnowledge,
  ...enSettings,
  ...enConfiguration,
  ...enRuns,
  ...enUsage,
} as const;
