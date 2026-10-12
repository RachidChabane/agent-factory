import type { TwinOf } from '../types.ts';
import type { enConfiguration } from '../en/configuration.ts';

export const frConfiguration = {
  'configuration.heading': 'Fichier de configuration',
  'configuration.path': 'Chemin',
  'configuration.copyPath': 'Copier le chemin',
  'configuration.restart.heading': 'En attente d’un redémarrage',
  'configuration.restart.none': 'Aucun réglage n’attend un redémarrage.',
  'configuration.restart.hint': 'Le fichier a modifié ces sections, mais elles ne s’appliquent qu’au redémarrage de l’usine.',
  'configuration.reload.heading': 'Dernier rechargement',
  'configuration.reload.notRefused': 'L’usine n’a pas refusé le fichier.',
  'configuration.reload.refused': 'Refusé le {when} ({age})',
  'configuration.reload.reason': 'Raison',
  'configuration.reload.keptPrevious': 'L’usine conserve ses réglages précédents.',

  'configuration.banner.restartLabel': 'Réglages en attente d’un redémarrage',
  'configuration.banner.restart': 'Redémarrez l’usine pour appliquer : {sections}',
  'configuration.banner.refusedLabel': 'Fichier de configuration refusé',
  'configuration.banner.refused': 'Le fichier de configuration a été refusé le {when} ({age}) : {reason}',
  'configuration.banner.keptPrevious': 'L’usine conserve ses réglages précédents.',
  'configuration.banner.open': 'Ouvrir les réglages',
} as const satisfies TwinOf<typeof enConfiguration>;
