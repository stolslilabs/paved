import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSurfaceAdapter } from "../src/core/WebSurfaceAdapter";

/** A ResizeObserver that records what it observes and lets the test fire it. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed: unknown[] = [];
  disconnected = false;
  constructor(private readonly callback: () => void) {
    FakeResizeObserver.instances.push(this);
  }
  observe(target: unknown) {
    this.observed.push(target);
  }
  disconnect() {
    this.disconnected = true;
  }
  fire() {
    if (!this.disconnected) this.callback();
  }
}

/** `matchMedia` for `(resolution: <dpr>dppx)`: a query stops matching, and fires "change", when the ratio changes. */
function fakeScreen(initial: number) {
  const win = { devicePixelRatio: initial, matchMedia: vi.fn() };
  const queries: Array<{ media: string; listeners: Set<() => void> }> = [];
  win.matchMedia.mockImplementation((media: string) => {
    const listeners = new Set<() => void>();
    queries.push({ media, listeners });
    return {
      media,
      addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_type: string, cb: () => void) => listeners.delete(cb),
    };
  });
  const setRatio = (dpr: number) => {
    win.devicePixelRatio = dpr;
    for (const q of [...queries]) if (q.media !== `(resolution: ${dpr}dppx)`) for (const cb of [...q.listeners]) cb();
  };
  const listening = () => queries.filter((q) => q.listeners.size > 0).map((q) => q.media);
  return { win, setRatio, listening };
}

function canvasIn(container: object | null) {
  return { parentElement: container, clientWidth: 300, clientHeight: 200, style: {} } as unknown as HTMLCanvasElement;
}

describe("WebSurfaceAdapter", () => {
  it("makes the canvas fill its container, for every consumer: the renderer sizes only the drawing buffer", () => {
    const canvas = canvasIn({});
    new WebSurfaceAdapter(canvas);
    expect(canvas.style.width).toBe("100%");
    expect(canvas.style.height).toBe("100%");
  });
});

describe("WebSurfaceAdapter.onResize", () => {
  beforeEach(() => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("observes the canvas's container, whose size the canvas follows, and calls back on its changes", () => {
    const { win } = fakeScreen(1);
    vi.stubGlobal("window", win);
    const container = {};
    const cb = vi.fn();
    new WebSurfaceAdapter(canvasIn(container)).onResize(cb);
    const [observer] = FakeResizeObserver.instances;
    expect(observer.observed).toEqual([container]);
    observer.fire();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("observes the canvas itself when it has no container", () => {
    vi.stubGlobal("window", fakeScreen(1).win);
    const canvas = canvasIn(null);
    new WebSurfaceAdapter(canvas).onResize(vi.fn());
    expect(FakeResizeObserver.instances[0].observed).toEqual([canvas]);
  });

  it("calls back when the device pixel ratio changes, every time, listening to the current ratio only", () => {
    const screen = fakeScreen(1);
    vi.stubGlobal("window", screen.win);
    const cb = vi.fn();
    new WebSurfaceAdapter(canvasIn({})).onResize(cb);
    expect(screen.listening()).toEqual(["(resolution: 1dppx)"]);
    screen.setRatio(2);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(screen.listening()).toEqual(["(resolution: 2dppx)"]);
    screen.setRatio(1);
    expect(cb).toHaveBeenCalledTimes(2);
    expect(screen.listening()).toEqual(["(resolution: 1dppx)"]);
  });

  it("stops both on unsubscribe, and a new subscription replaces the old one", () => {
    const screen = fakeScreen(1);
    vi.stubGlobal("window", screen.win);
    const adapter = new WebSurfaceAdapter(canvasIn({}));
    const first = vi.fn();
    adapter.onResize(first);
    const second = vi.fn();
    const stop = adapter.onResize(second);
    expect(FakeResizeObserver.instances[0].disconnected).toBe(true);
    expect(screen.listening()).toEqual(["(resolution: 1dppx)"]);
    screen.setRatio(2);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    stop();
    expect(FakeResizeObserver.instances[1].disconnected).toBe(true);
    expect(screen.listening()).toEqual([]);
  });
});
