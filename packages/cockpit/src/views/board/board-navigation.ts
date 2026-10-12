import type { BoardColumnId } from '../../model/board.ts';

export interface CardPosition {
  readonly column: number;
  readonly row: number;
}

const COLUMN_STEPS: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1 };
const ROW_STEPS: Readonly<Record<string, number>> = { ArrowUp: -1, ArrowDown: 1 };

export function nextCardPosition(position: CardPosition, key: string, columnLengths: readonly number[]): CardPosition | null {
  const rowStep = ROW_STEPS[key];
  if (rowStep !== undefined) {
    const length = columnLengths[position.column] ?? 0;
    const row = position.row + rowStep;
    return row >= 0 && row < length ? { column: position.column, row } : null;
  }
  const columnStep = COLUMN_STEPS[key];
  if (columnStep === undefined) return null;
  for (let column = position.column + columnStep; column >= 0 && column < columnLengths.length; column += columnStep) {
    const length = columnLengths[column] ?? 0;
    if (length > 0) return { column, row: Math.min(position.row, length - 1) };
  }
  return null;
}

export function cardRefKey(column: BoardColumnId, row: number): string {
  return `${column}:${row}`;
}
