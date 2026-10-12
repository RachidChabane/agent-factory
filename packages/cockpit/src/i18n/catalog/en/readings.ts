import type { MessageCatalog } from '../types.ts';

export const enReadings = {
  'reading.read': 'Read {age}',
  'reading.checked': 'Checked {age}',
  'reading.sampled': 'Sampled {age}',
  'reading.never': 'Not read yet',
  'reading.neverChecked': 'Never checked',
  'reading.stale': 'Stale',
  'reading.staleHint': 'Read more than {after} ago, so it may no longer be current.',
  'reading.failed': 'The last read failed: {error}',
  'reading.failedKept': 'The last read failed ({error}). This is the value read {age}.',
  'reading.failedNoValue': 'Could not be read',
  'reading.error': 'Read error',
} as const satisfies MessageCatalog;
