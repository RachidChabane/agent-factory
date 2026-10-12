import { describe, expect, it } from 'vitest';
import { BASKET } from './demo-basket.ts';
import { CART_SCREEN_PATH, drawScreens, SUMMARY_SCREEN_PATH } from './demo-film-screens.ts';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const EXTERNAL_REFERENCE = /https?:|<script|<image|href=/;

describe('drawScreens', () => {
  it('draws the cart and then the summary, which is the last screenshot in path order', () => {
    const paths = drawScreens('base').map((drawing) => drawing.path);
    expect(paths).toEqual([CART_SCREEN_PATH, SUMMARY_SCREEN_PATH]);
    expect([...paths].sort((left, right) => left.localeCompare(right)).at(-1)).toBe(SUMMARY_SCREEN_PATH);
  });

  it('draws standalone SVG files that refer to nothing outside themselves', () => {
    for (const drawing of [...drawScreens('base'), ...drawScreens('head')]) {
      expect(drawing.svg.startsWith(`<svg xmlns="${SVG_NAMESPACE}"`), drawing.path).toBe(true);
      expect(drawing.svg.trimEnd().endsWith('</svg>'), drawing.path).toBe(true);
      expect(drawing.svg.replaceAll(SVG_NAMESPACE, ''), drawing.path).not.toMatch(EXTERNAL_REFERENCE);
    }
  });

  it('lists the basket on both screens and adds the total on the summary only', () => {
    const [cart, summary] = drawScreens('head');
    for (const line of BASKET) {
      expect(cart?.svg).toContain(line.name);
      expect(summary?.svg).toContain(line.name);
    }
    expect(cart?.svg).not.toContain('Total');
    expect(summary?.svg).toContain('$59.97');
  });

  it('tells the phases apart by their label and their colour', () => {
    const before = drawScreens('base').map((drawing) => drawing.svg);
    const after = drawScreens('head').map((drawing) => drawing.svg);
    before.forEach((svg, index) => {
      expect(svg).toContain('Storefront - Before');
      expect(after[index]).toContain('Storefront - After');
      expect(after[index]).not.toBe(svg);
    });
  });
});
