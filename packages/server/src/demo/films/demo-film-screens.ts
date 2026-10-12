import { BASKET, BASKET_TOTAL_CENTS, dollars } from './demo-basket.ts';
import type { FilmPhase } from './demo-film-request.ts';

export interface ScreenDrawing {
  /** Relative to the output directory. */
  readonly path: string;
  readonly svg: string;
}

export const CART_SCREEN_PATH = 'screens/1-cart.svg';
/** The last screenshot in path order is the final screenshot of the film. */
export const SUMMARY_SCREEN_PATH = 'screens/2-summary.svg';

type TextAnchor = 'start' | 'end';

const WIDTH = 640;
const HEIGHT = 360;
const MARGIN = 24;
const HEADER_HEIGHT = 48;
const HEADER_TEXT_BASELINE = 31;
const TITLE_BASELINE = 96;
const FIRST_ROW_BASELINE = 140;
const ROW_HEIGHT = 36;
const RULE_GAP = 20;
const RULE_WIDTH = 1;
const BUTTON_WIDTH = 180;
const BUTTON_HEIGHT = 36;
const BUTTON_RADIUS = 6;
const BUTTON_BOTTOM_MARGIN = 24;
const BUTTON_TEXT_INSET = 18;
const BUTTON_TEXT_BASELINE = 24;
const HEADER_FONT_SIZE = 20;
const TITLE_FONT_SIZE = 22;
const ROW_FONT_SIZE = 18;
const TOTAL_FONT_SIZE = 20;
const BUTTON_FONT_SIZE = 16;
const INDENT = '  ';
const NEWLINE = '\n';

const COLORS = { page: '#f7f7f5', headerText: '#ffffff', title: '#1f2a44', row: '#333333', rule: '#999999', buttonText: '#ffffff' } as const;
const PHASES: Readonly<Record<FilmPhase, { readonly label: string; readonly accent: string }>> = {
  base: { label: 'Before', accent: '#b04040' },
  head: { label: 'After', accent: '#40b060' },
};

function text(x: number, y: number, size: number, fill: string, content: string, anchor: TextAnchor = 'start'): string {
  return `<text x="${x}" y="${y}" font-family="sans-serif" font-size="${size}" fill="${fill}" text-anchor="${anchor}">${content}</text>`;
}

function basketRows(): readonly string[] {
  return BASKET.flatMap((line, index) => {
    const baseline = FIRST_ROW_BASELINE + index * ROW_HEIGHT;
    return [
      text(MARGIN, baseline, ROW_FONT_SIZE, COLORS.row, line.name),
      text(WIDTH - MARGIN, baseline, ROW_FONT_SIZE, COLORS.row, dollars(line.cents), 'end'),
    ];
  });
}

function totalRow(): readonly string[] {
  const rule = FIRST_ROW_BASELINE + BASKET.length * ROW_HEIGHT - RULE_GAP;
  const baseline = rule + ROW_HEIGHT;
  return [
    `<line x1="${MARGIN}" y1="${rule}" x2="${WIDTH - MARGIN}" y2="${rule}" stroke="${COLORS.rule}" stroke-width="${RULE_WIDTH}"/>`,
    text(MARGIN, baseline, TOTAL_FONT_SIZE, COLORS.title, 'Total'),
    text(WIDTH - MARGIN, baseline, TOTAL_FONT_SIZE, COLORS.title, dollars(BASKET_TOTAL_CENTS), 'end'),
  ];
}

function button(label: string, accent: string): readonly string[] {
  const top = HEIGHT - BUTTON_BOTTOM_MARGIN - BUTTON_HEIGHT;
  return [
    `<rect x="${MARGIN}" y="${top}" width="${BUTTON_WIDTH}" height="${BUTTON_HEIGHT}" rx="${BUTTON_RADIUS}" fill="${accent}"/>`,
    text(MARGIN + BUTTON_TEXT_INSET, top + BUTTON_TEXT_BASELINE, BUTTON_FONT_SIZE, COLORS.buttonText, label),
  ];
}

function screen(phase: FilmPhase, title: string, extra: readonly string[], action: string): string {
  const { label, accent } = PHASES[phase];
  const shapes = [
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${COLORS.page}"/>`,
    `<rect width="${WIDTH}" height="${HEADER_HEIGHT}" fill="${accent}"/>`,
    text(MARGIN, HEADER_TEXT_BASELINE, HEADER_FONT_SIZE, COLORS.headerText, `Storefront - ${label}`),
    text(MARGIN, TITLE_BASELINE, TITLE_FONT_SIZE, COLORS.title, title),
    ...basketRows(),
    ...extra,
    ...button(action, accent),
  ];
  const opening = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="${title}, ${label.toLowerCase()} the change">`;
  return [opening, ...shapes.map((shape) => `${INDENT}${shape}`), '</svg>', ''].join(NEWLINE);
}

/** The screens of the checkout flow in one phase: the cart, then the summary the customer pays from. */
export function drawScreens(phase: FilmPhase): readonly ScreenDrawing[] {
  return [
    { path: CART_SCREEN_PATH, svg: screen(phase, 'Your cart', [], 'Continue to checkout') },
    { path: SUMMARY_SCREEN_PATH, svg: screen(phase, 'Checkout summary', totalRow(), 'Pay now') },
  ];
}
