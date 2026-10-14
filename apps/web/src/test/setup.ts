import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom has no viewport scrolling. Verify motion in the browser.
Element.prototype.scrollIntoView = vi.fn();

// jsdom has no layout observer. Scrolling is verified in a real browser.
globalThis.ResizeObserver = class {
  observe = vi.fn<() => void>();
  unobserve = vi.fn<() => void>();
  disconnect = vi.fn<() => void>();
};
