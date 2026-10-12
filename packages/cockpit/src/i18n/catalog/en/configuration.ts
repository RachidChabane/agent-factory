import type { MessageCatalog } from '../types.ts';

export const enConfiguration = {
  'configuration.heading': 'Configuration file',
  'configuration.path': 'Path',
  'configuration.copyPath': 'Copy the path',
  'configuration.restart.heading': 'Waiting for a restart',
  'configuration.restart.none': 'No setting waits for a restart.',
  'configuration.restart.hint': 'The file changed these sections, but they apply only once the factory restarts.',
  'configuration.reload.heading': 'Last reload',
  'configuration.reload.notRefused': 'The factory has not refused the file.',
  'configuration.reload.refused': 'Refused at {when} ({age})',
  'configuration.reload.reason': 'Reason',
  'configuration.reload.keptPrevious': 'The factory keeps its previous settings.',

  'configuration.banner.restartLabel': 'Settings waiting for a restart',
  'configuration.banner.restart': 'Restart the factory to apply: {sections}',
  'configuration.banner.refusedLabel': 'Configuration file refused',
  'configuration.banner.refused': 'The configuration file was refused at {when} ({age}): {reason}',
  'configuration.banner.keptPrevious': 'The factory keeps its previous settings.',
  'configuration.banner.open': 'Open the settings',
} as const satisfies MessageCatalog;
