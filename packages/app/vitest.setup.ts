import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";
import { queryClient } from "./src/lib/query-client";

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

// A failed read is retried once (`retry: 1`) after the cache's default 1 s, in real time: every test of a failing read waited that
// second (1.1 to 1.4 s each, the retry included). The retry stays, without the wait; the app's own defaults are untouched.
queryClient.setDefaultOptions({ ...queryClient.getDefaultOptions(), queries: { ...queryClient.getDefaultOptions().queries, retryDelay: 0 } });

// `findBy` and `waitFor` wait 1 s by default: under heavy load a render that takes 0.1 s took more than that, and the
// lookup failed with the element absent (purchase-route and wallet-claims). They return as soon as the element is there, so a longer ceiling costs a passing test nothing.
configure({ asyncUtilTimeout: 5000 });
