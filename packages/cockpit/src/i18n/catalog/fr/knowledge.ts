import type { TwinOf } from '../types.ts';
import type { enKnowledge } from '../en/knowledge.ts';

export const frKnowledge = {
  'knowledge.title': 'Connaissances',
  'knowledge.description': 'Les documents confiés aux agents comme contexte, une section par source.',
  'knowledge.documents': { one: '{count} document', other: '{count} documents' },
  'knowledge.sources': { one: '{count} source', other: '{count} sources' },
  'knowledge.unread': { one: '{count} source non relevée', other: '{count} sources non relevées' },
  'knowledge.none': 'Aucune source de connaissances n’est configurée',
  'knowledge.noneDescription': 'Ce projet ne donne aucun document supplémentaire à lire aux agents.',

  'knowledge.filter.label': 'Filtrer les documents',
  'knowledge.filter.placeholder': 'Filtrer par titre ou chemin…',
  'knowledge.filter.result': { one: '{shown} sur {count} document affiché', other: '{shown} sur {count} documents affichés' },

  'knowledge.source.notRead': 'Cette source n’a pas encore été relevée',
  'knowledge.source.empty': 'Cette source ne contient aucun document',
  'knowledge.source.noMatch': 'Aucun document de cette source ne correspond à « {query} »',
  'knowledge.source.table': 'Documents de {location}',
  'knowledge.column.title': 'Titre',
  'knowledge.column.path': 'Chemin',
  'knowledge.column.size': 'Taille',
} as const satisfies TwinOf<typeof enKnowledge>;
