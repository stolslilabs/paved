import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// jsdom lacks what Radix reads for sizing, pointer capture and scrolling: inert stand-ins, the real thing is the browser's.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

// jsdom has no IntersectionObserver (Motion's `useInView`, the NumberTicker): every observed element is reported in view.
class IntersectionObserverStub {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    queueMicrotask(() => this.callback([{ target, isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], this as unknown as IntersectionObserver));
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.IntersectionObserver ??= IntersectionObserverStub as unknown as typeof IntersectionObserver;

// jsdom has no matchMedia (Embla reads its breakpoints with it, Motion the reduced-motion query): no query matches.
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }) as MediaQueryList;
