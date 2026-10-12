import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

class InertObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}

for (const name of ['ResizeObserver', 'IntersectionObserver'] as const) {
  if (!(name in window)) Object.defineProperty(window, name, { configurable: true, value: InertObserver });
}

if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => undefined;
}

if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: vi.fn(() => Promise.resolve()) },
});

const VIRTUAL_VIEWPORT_RECT = { x: 0, y: 0, width: 900, height: 640 };
const VIRTUAL_ITEM_RECT = { x: 0, y: 0, width: 900, height: 32 };
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function getBoundingClientRect(this: Element): DOMRect {
  if (this instanceof HTMLElement && this.dataset['virtualViewport'] !== undefined) return DOMRect.fromRect(VIRTUAL_VIEWPORT_RECT);
  if (this instanceof HTMLElement && this.dataset['index'] !== undefined) return DOMRect.fromRect(VIRTUAL_ITEM_RECT);
  return originalGetBoundingClientRect.call(this);
};

function virtualSize(element: HTMLElement, dimension: 'width' | 'height'): number {
  if (element.dataset['virtualViewport'] !== undefined) return VIRTUAL_VIEWPORT_RECT[dimension];
  if (element.dataset['index'] !== undefined) return VIRTUAL_ITEM_RECT[dimension];
  return 0;
}

Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get(this: HTMLElement) {
    return virtualSize(this, 'height');
  },
});
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  get(this: HTMLElement) {
    return virtualSize(this, 'width');
  },
});
