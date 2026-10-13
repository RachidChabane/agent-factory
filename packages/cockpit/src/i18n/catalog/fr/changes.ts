import type { enChanges } from '../en/changes.ts';
import type { TwinOf } from '../types.ts';

export const frChanges = {
  'changes.title': 'Changements',
  'changes.description': 'Tout ce qui a changé depuis le {since}, projet par projet.',

  'changes.since.label': 'Période',
  'changes.since.choice.24h': '24 h',
  'changes.since.choice.3d': '3 jours',
  'changes.since.choice.7d': '7 jours',
  'changes.since.choice.custom': 'Personnalisé',
  'changes.since.field': 'Depuis',
  'changes.since.markSeen': 'Marquer comme vu',
  'changes.since.seen': 'Dernier « vu » : {when}',
  'changes.since.neverSeen': 'Jamais marqué comme vu',
  'changes.since.markedSeen': 'Marqué comme vu',
  'changes.since.notKept': 'Ce navigateur ne le mémorisera pas',

  'changes.summary.label': 'Synthèse de la période',
  'changes.summary.merged': 'Pull requests mergées',
  'changes.summary.awaiting': 'En attente de vous',
  'changes.summary.deployments': 'Déploiements',
  'changes.summary.failed': 'Déploiements en échec',

  'changes.awaiting.title': 'En attente de vous',
  'changes.awaiting.description': 'Quelle que soit la période : les décisions et les merges que vous seul pouvez donner.',
  'changes.awaiting.empty': 'Rien n’attend votre décision',

  'changes.project.open': 'Ouvrir {project}',
  'changes.project.quiet': 'Rien n’a changé dans {project} sur la période.',

  'changes.pullRequests.lane': 'Pull requests de la période',
  'changes.pullRequests.title': 'Pull requests',
  'changes.pullRequests.empty': 'Aucune pull request n’a bougé sur la période',
  'changes.pullRequests.films': 'Films',
  'changes.event.opened': 'Ouverte',
  'changes.event.updated': 'Nouvelle version',
  'changes.event.merged': 'Mergée',
  'changes.event.closed': 'Fermée',
  'changes.issue': 'Issue n° {number}',

  'changes.environment.lane': 'Voie de {environment}',
  'changes.environment.production': 'Production',
  'changes.environment.noSource': 'Aucune source de déploiement configurée',
  'changes.environment.notRead': 'Déploiements pas encore relevés',
  'changes.environment.noCurrent': 'Rien n’est encore déployé',
  'changes.environment.none': 'Aucun déploiement sur la période',
  'changes.environment.repeated': '×{count}',
  'changes.environment.pending': 'Commits en attente pour {environment}',
} as const satisfies TwinOf<typeof enChanges>;
