import type { MessageCatalog } from '../types.ts';

export const enKnowledge = {
  'knowledge.title': 'Knowledge',
  'knowledge.description': 'The documents given to the agents as context, one section per source.',
  'knowledge.documents': { one: '{count} document', other: '{count} documents' },
  'knowledge.sources': { one: '{count} source', other: '{count} sources' },
  'knowledge.unread': { one: '{count} source not read', other: '{count} sources not read' },
  'knowledge.none': 'No knowledge source is configured',
  'knowledge.noneDescription': 'This project gives the agents no extra document to read.',

  'knowledge.filter.label': 'Filter the documents',
  'knowledge.filter.placeholder': 'Filter by title or path…',
  'knowledge.filter.result': { one: 'Showing {shown} of {count} document', other: 'Showing {shown} of {count} documents' },

  'knowledge.source.notRead': 'This source has not been read yet',
  'knowledge.source.empty': 'This source holds no document',
  'knowledge.source.noMatch': 'No document of this source matches “{query}”',
  'knowledge.source.table': 'Documents of {location}',
  'knowledge.column.title': 'Title',
  'knowledge.column.path': 'Path',
  'knowledge.column.size': 'Size',
} as const satisfies MessageCatalog;
