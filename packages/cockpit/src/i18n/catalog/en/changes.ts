import type { MessageCatalog } from '../types.ts';

export const enChanges = {
  'changes.title': 'Changes',
  'changes.description': 'Everything that changed since {since}, project by project.',

  'changes.since.label': 'Period',
  'changes.since.choice.24h': '24 h',
  'changes.since.choice.3d': '3 days',
  'changes.since.choice.7d': '7 days',
  'changes.since.choice.custom': 'Custom',
  'changes.since.field': 'Since',
  'changes.since.markSeen': 'Mark as seen',
  'changes.since.seen': 'Last seen: {when}',
  'changes.since.neverSeen': 'Never marked as seen',
  'changes.since.markedSeen': 'Marked as seen',
  'changes.since.notKept': 'This browser would not remember it',

  'changes.summary.label': 'Summary of the period',
  'changes.summary.merged': 'Pull requests merged',
  'changes.summary.awaiting': 'Waiting for you',
  'changes.summary.deployments': 'Deployments',
  'changes.summary.failed': 'Failed deployments',

  'changes.awaiting.title': 'Waiting for you',
  'changes.awaiting.description': 'Whatever the period: the decisions and merges that only you can give.',
  'changes.awaiting.empty': 'Nothing waits for your decision',

  'changes.project.open': 'Open {project}',
  'changes.project.quiet': 'Nothing changed in {project} during this period.',

  'changes.pullRequests.lane': 'Pull requests of the period',
  'changes.pullRequests.title': 'Pull requests',
  'changes.pullRequests.empty': 'No pull request moved during this period',
  'changes.pullRequests.films': 'Films',
  'changes.event.opened': 'Opened',
  'changes.event.updated': 'New version',
  'changes.event.merged': 'Merged',
  'changes.event.closed': 'Closed',
  'changes.issue': 'Issue #{number}',

  'changes.environment.lane': 'Lane of {environment}',
  'changes.environment.production': 'Production',
  'changes.environment.noSource': 'No deployment source configured',
  'changes.environment.notRead': 'Deployments not read yet',
  'changes.environment.noCurrent': 'Nothing deployed yet',
  'changes.environment.none': 'No deployment during this period',
  'changes.environment.repeated': '×{count}',
  'changes.environment.pending': 'Commits waiting for {environment}',
} as const satisfies MessageCatalog;
