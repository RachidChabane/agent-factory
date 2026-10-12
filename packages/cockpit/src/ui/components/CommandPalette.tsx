import type { KeyboardEvent, ReactNode } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import { Kbd } from './Kbd.tsx';

export interface PaletteItem {
  readonly id: string;
  readonly group: string;
  readonly label: string;
  readonly hint?: string | undefined;
  readonly icon?: ReactNode | undefined;
  readonly keywords?: string | undefined;
  readonly perform: () => void;
}

export const PALETTE_RESULT_LIMIT = 60;

export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr-FR');
}

export function filterPaletteItems(items: readonly PaletteItem[], query: string): readonly PaletteItem[] {
  const terms = normalizeSearch(query).split(/\s+/).filter((term) => term.length > 0);
  if (terms.length === 0) return items.slice(0, PALETTE_RESULT_LIMIT);
  const scored = items
    .map((item) => {
      const label = normalizeSearch(item.label);
      const haystack = `${label} ${normalizeSearch(item.hint ?? '')} ${normalizeSearch(item.keywords ?? '')} ${normalizeSearch(item.group)}`;
      if (!terms.every((term) => haystack.includes(term))) return null;
      const score = terms.reduce((sum, term) => sum + (label.startsWith(term) ? 3 : label.includes(term) ? 2 : 1), 0);
      return { item, score };
    })
    .filter((entry): entry is { item: PaletteItem; score: number } => entry !== null);
  return scored
    .sort((left, right) => right.score - left.score)
    .slice(0, PALETTE_RESULT_LIMIT)
    .map((entry) => entry.item);
}

interface CommandPaletteProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly items: readonly PaletteItem[];
  readonly placeholder?: string | undefined;
}

function groupItems(items: readonly PaletteItem[]): readonly { readonly group: string; readonly items: readonly PaletteItem[] }[] {
  const groups = new Map<string, PaletteItem[]>();
  for (const item of items) groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  return [...groups.entries()].map(([group, groupItemsList]) => ({ group, items: groupItemsList }));
}

export function CommandPalette({ open, onClose, items, placeholder = 'Rechercher ou lancer une action…' }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = useMemo(() => filterPaletteItems(items, query), [items, query]);
  const grouped = useMemo(() => groupItems(results), [results]);
  const ordered = useMemo(() => grouped.flatMap((group) => group.items), [grouped]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      dialog.showModal();
      setQuery('');
      setActiveIndex(0);
      inputRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    document.getElementById(`${listId}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, listId]);

  const perform = (item: PaletteItem | undefined) => {
    if (item === undefined) return;
    onClose();
    item.perform();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (ordered.length === 0 ? 0 : (current + 1) % ordered.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (ordered.length === 0 ? 0 : (current - 1 + ordered.length) % ordered.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      perform(ordered[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  let position = -1;
  return (
    <dialog
      ref={dialogRef}
      className="ds-palette"
      aria-label="Palette de commandes"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open ? (
        <div className="ds-palette__panel">
          <div className="ds-palette__search">
            <Search size={16} aria-hidden="true" />
            <input
              ref={inputRef}
              className="ds-palette__input"
              value={query}
              placeholder={placeholder}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={ordered.length === 0 ? undefined : `${listId}-option-${activeIndex}`}
              aria-autocomplete="list"
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setActiveIndex(0);
              }}
              onKeyDown={onKeyDown}
            />
            <Kbd>Échap</Kbd>
          </div>
          <div className="ds-palette__results" id={listId} role="listbox" aria-label="Résultats">
            {ordered.length === 0 ? <p className="ds-palette__empty">Aucun résultat pour « {query} »</p> : null}
            {grouped.map((group) => (
              <div key={group.group} role="group" aria-label={group.group} className="ds-palette__group">
                <p className="ds-palette__group-title small-caps" aria-hidden="true">
                  {group.group}
                </p>
                {group.items.map((item) => {
                  position += 1;
                  const index = position;
                  const active = index === activeIndex;
                  return (
                    <div
                      key={item.id}
                      id={`${listId}-option-${index}`}
                      role="option"
                      aria-selected={active}
                      className={`ds-palette__option${active ? ' is-active' : ''}`}
                      onPointerMove={() => setActiveIndex(index)}
                      onClick={() => perform(item)}
                    >
                      <span className="ds-palette__icon" aria-hidden="true">
                        {item.icon}
                      </span>
                      <span className="ds-palette__label truncate">{item.label}</span>
                      {item.hint === undefined ? null : <span className="ds-palette__hint truncate">{item.hint}</span>}
                      {active ? <CornerDownLeft size={14} className="ds-palette__enter" aria-hidden="true" /> : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <footer className="ds-palette__footer">
            <span>
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> naviguer
            </span>
            <span>
              <Kbd>↵</Kbd> ouvrir
            </span>
            <span>
              <Kbd>⌘K</Kbd> basculer
            </span>
          </footer>
        </div>
      ) : null}
    </dialog>
  );
}
