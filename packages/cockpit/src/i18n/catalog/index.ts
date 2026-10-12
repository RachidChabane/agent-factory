import type { Locale } from '../locale.ts';
import { en } from './en/index.ts';
import { fr } from './fr/index.ts';
import type { MessageCatalog } from './types.ts';

export type Catalog = typeof en;
export type MessageKey = keyof Catalog & string;

export const CATALOGS: Readonly<Record<Locale, MessageCatalog>> = { en, fr };
