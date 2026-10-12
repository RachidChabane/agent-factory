import type { TwinOf } from '../types.ts';
import type { enReadings } from '../en/readings.ts';

export const frReadings = {
  'reading.read': 'Relevé {age}',
  'reading.checked': 'Vérifié {age}',
  'reading.sampled': 'Mesuré {age}',
  'reading.never': 'Pas encore relevé',
  'reading.neverChecked': 'Jamais vérifié',
  'reading.stale': 'Périmé',
  'reading.staleHint': 'Relevé il y a plus de {after} : il n’est peut-être plus à jour.',
  'reading.failed': 'Le dernier relevé a échoué : {error}',
  'reading.failedKept': 'Le dernier relevé a échoué ({error}). Voici la valeur relevée {age}.',
  'reading.failedNoValue': 'Relevé impossible',
  'reading.error': 'Erreur de relevé',
} as const satisfies TwinOf<typeof enReadings>;
