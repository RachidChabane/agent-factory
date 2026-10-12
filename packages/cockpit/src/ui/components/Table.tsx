import type { KeyboardEvent, ReactNode } from 'react';
import { useRef } from 'react';

export interface TableColumn<T> {
  readonly id: string;
  readonly header: ReactNode;
  readonly cell: (row: T) => ReactNode;
  readonly width?: string | undefined;
  readonly align?: 'start' | 'end' | undefined;
  readonly hideOnMobile?: boolean | undefined;
  readonly primary?: boolean | undefined;
}

interface DataTableProps<T> {
  readonly label: string;
  readonly rows: readonly T[];
  readonly columns: readonly TableColumn<T>[];
  readonly rowKey: (row: T) => string;
  readonly onActivate?: ((row: T) => void) | undefined;
  readonly activeKey?: string | null | undefined;
  readonly empty?: ReactNode | undefined;
  readonly dense?: boolean | undefined;
}

const NAVIGATION_STEP: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1, j: 1, k: -1 };

export function DataTable<T>({ label, rows, columns, rowKey, onActivate, activeKey, empty, dense = false }: DataTableProps<T>) {
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const focusRow = (index: number) => {
    const bounded = Math.min(rows.length - 1, Math.max(0, index));
    rowRefs.current[bounded]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, index: number, row: T) => {
    if (event.target !== event.currentTarget) return;
    const step = NAVIGATION_STEP[event.key];
    if (step !== undefined) {
      event.preventDefault();
      focusRow(index + step);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusRow(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusRow(rows.length - 1);
    } else if (event.key === 'Enter' && onActivate !== undefined) {
      event.preventDefault();
      onActivate(row);
    }
  };
  if (rows.length === 0 && empty !== undefined) return <>{empty}</>;
  return (
    <div className="ds-table-wrap">
      <table className={`ds-table${dense ? ' ds-table--dense' : ''}`} aria-label={label}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                style={column.width === undefined ? undefined : { width: column.width }}
                className={[column.align === 'end' ? 'is-end' : null, column.hideOnMobile ? 'hide-mobile' : null].filter(Boolean).join(' ')}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const key = rowKey(row);
            const interactive = onActivate !== undefined;
            return (
              <tr
                key={key}
                ref={(element) => {
                  rowRefs.current[index] = element;
                }}
                tabIndex={interactive ? (index === 0 || key === activeKey ? 0 : -1) : undefined}
                aria-selected={activeKey === undefined ? undefined : key === activeKey}
                className={[interactive ? 'is-interactive' : null, key === activeKey ? 'is-active' : null].filter(Boolean).join(' ')}
                onClick={interactive ? () => onActivate(row) : undefined}
                onKeyDown={interactive ? (event) => onKeyDown(event, index, row) : undefined}
              >
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={[
                      column.align === 'end' ? 'is-end' : null,
                      column.hideOnMobile ? 'hide-mobile' : null,
                      column.primary ? 'is-primary' : null,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
