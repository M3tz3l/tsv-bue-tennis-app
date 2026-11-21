import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

class ResizeObserverMock implements ResizeObserver {
  observe(_target: Element, _options?: ResizeObserverOptions): void {}
  unobserve(_target: Element): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = globalThis.ResizeObserver ?? ResizeObserverMock;

// jsdom has no layout, but ProseMirror asks for element/range rectangles when
// typing. Returning an empty list lets it fall back to getBoundingClientRect.
const emptyRect = () =>
  ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }) as DOMRect;

if (!Element.prototype.getClientRects) {
  Element.prototype.getClientRects = () => [] as unknown as DOMRectList;
}
if (!Element.prototype.getBoundingClientRect) {
  Element.prototype.getBoundingClientRect = emptyRect;
}
if (typeof Range !== 'undefined') {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = emptyRect;
  }
}
if (!document.elementFromPoint) {
  document.elementFromPoint = () => null;
}

afterEach(() => {
  cleanup();
});
