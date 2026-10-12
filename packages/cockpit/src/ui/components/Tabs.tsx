import type { KeyboardEvent, ReactNode } from 'react';
import { useId, useRef } from 'react';

export interface TabItem<T extends string> {
  readonly id: T;
  readonly label: string;
  /** The full name of the item for assistive technology, when the visible label is short. */
  readonly accessibleLabel?: string | undefined;
  readonly count?: number | undefined;
  readonly icon?: ReactNode | undefined;
}

const NEXT_KEYS: readonly string[] = ['ArrowRight', 'ArrowDown'];
const PREVIOUS_KEYS: readonly string[] = ['ArrowLeft', 'ArrowUp'];

export function nextIndex(current: number, length: number, key: string): number | null {
  if (NEXT_KEYS.includes(key)) return (current + 1) % length;
  if (PREVIOUS_KEYS.includes(key)) return (current - 1 + length) % length;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return null;
}

interface TabsProps<T extends string> {
  readonly label: string;
  readonly items: readonly TabItem<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly idPrefix?: string | undefined;
}

export function tabPanelId(prefix: string, id: string): string {
  return `${prefix}-panel-${id}`;
}

export function tabId(prefix: string, id: string): string {
  return `${prefix}-tab-${id}`;
}

export function Tabs<T extends string>({ label, items, value, onChange, idPrefix }: TabsProps<T>) {
  const generated = useId();
  const prefix = idPrefix ?? generated;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = items.findIndex((item) => item.id === value);
    const target = nextIndex(current, items.length, event.key);
    const item = target === null ? undefined : items[target];
    if (target === null || item === undefined) return;
    event.preventDefault();
    onChange(item.id);
    refs.current[target]?.focus();
  };
  return (
    <div className="ds-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item, index) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={tabId(prefix, item.id)}
            aria-selected={selected}
            aria-controls={tabPanelId(prefix, item.id)}
            tabIndex={selected ? 0 : -1}
            className={`ds-tab${selected ? ' is-selected' : ''}`}
            onClick={() => onChange(item.id)}
          >
            {item.icon}
            {item.label}
            {item.count === undefined ? null : <span className="ds-tab__count num">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  readonly label: string;
  readonly items: readonly TabItem<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly size?: 'sm' | 'md' | undefined;
}

export function Segmented<T extends string>({ label, items, value, onChange, size = 'md' }: SegmentedProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = items.findIndex((item) => item.id === value);
    const target = nextIndex(current, items.length, event.key);
    const item = target === null ? undefined : items[target];
    if (target === null || item === undefined) return;
    event.preventDefault();
    onChange(item.id);
    refs.current[target]?.focus();
  };
  return (
    <div className={`ds-segmented ds-segmented--${size}`} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item, index) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={item.accessibleLabel}
            title={item.accessibleLabel}
            tabIndex={selected ? 0 : -1}
            className={`ds-segmented__item${selected ? ' is-selected' : ''}`}
            onClick={() => onChange(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.count === undefined ? null : <span className="ds-segmented__count num">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
