import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSurfaceAdapter } from "../src/core/WebSurfaceAdapter";
import { NativeSurfaceAdapter, type NativeSurfaceHost } from "../src/core/NativeSurfaceAdapter";

/** What `maxPixelRatio: "auto"` reads of the device through the surface: the pointer, and the window's or screen's size. */

const canvas = () => ({ parentElement: null, clientWidth: 1440, clientHeight: 300, style: {} }) as unknown as HTMLCanvasElement;

function host(viewport?: { width: number; height: number }): NativeSurfaceHost {
  return {
    getSize: () => ({ width: 390, height: 500 }),
    getDevicePixelRatio: () => 3,
    ...(viewport ? { getViewportSize: () => viewport } : {}),
    onResize: () => () => undefined,
    setInputHandler: () => undefined,
  };
}

describe("WebSurfaceAdapter: the device", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("has a coarse pointer when `(pointer: coarse)` matches, and not otherwise", () => {
    const matchMedia = vi.fn((media: string) => ({ matches: media === "(pointer: coarse)" }));
    vi.stubGlobal("window", { matchMedia });
    expect(new WebSurfaceAdapter(canvas()).hasCoarsePointer()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith("(pointer: coarse)");

    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    expect(new WebSurfaceAdapter(canvas()).hasCoarsePointer()).toBe(false);
  });

  it("has no coarse pointer where there is no matchMedia", () => {
    vi.stubGlobal("window", {});
    expect(new WebSurfaceAdapter(canvas()).hasCoarsePointer()).toBe(false);
  });

  it("gives the window's size as the viewport, not the canvas's", () => {
    vi.stubGlobal("window", { innerWidth: 1440, innerHeight: 900 });
    const surface = new WebSurfaceAdapter(canvas());
    expect(surface.getViewportSize()).toEqual({ width: 1440, height: 900 });
    expect(surface.getSize()).toEqual({ width: 1440, height: 300 });
  });
});

describe("WebSurfaceAdapter.onResize: the window", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls back when the window is resized, even if the board's container keeps its size, until unsubscribed", () => {
    const listeners = new Set<() => void>();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("window", {
      devicePixelRatio: 2,
      addEventListener: (type: string, cb: () => void) => type === "resize" && listeners.add(cb),
      removeEventListener: (type: string, cb: () => void) => type === "resize" && listeners.delete(cb),
    });
    const cb = vi.fn();
    const stop = new WebSurfaceAdapter(canvas()).onResize(cb);
    for (const l of listeners) l();
    expect(cb).toHaveBeenCalledTimes(1);
    stop();
    expect(listeners.size).toBe(0);
  });
});

describe("NativeSurfaceAdapter: the device", () => {
  it("always has a coarse pointer: React Native runs on touch screens", () => {
    expect(new NativeSurfaceAdapter(host()).hasCoarsePointer()).toBe(true);
  });

  it("gives the host's screen as the viewport, or the surface's size when the host has none", () => {
    expect(new NativeSurfaceAdapter(host({ width: 390, height: 844 })).getViewportSize()).toEqual({ width: 390, height: 844 });
    expect(new NativeSurfaceAdapter(host()).getViewportSize()).toEqual({ width: 390, height: 500 });
  });
});
