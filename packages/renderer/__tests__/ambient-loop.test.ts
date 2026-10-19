import { describe, expect, it, vi } from "vitest";
import { AmbientLoop } from "../src/core/ambient-loop";
import { AMBIENT_FPS, DEFAULT_AMBIENT_SETTINGS, ambientAllowed, resolveAmbientSettings } from "../src/core/ambient-settings";
import { DEFAULT_RENDERER_SETTINGS, resolveRendererSettings } from "../src/core/settings";

/** Ticks the loop for `ms` at `hz` (the render loop's rAF), returning the steps it took. */
function run(loop: AmbientLoop, hz: number, ms: number, start = 0): number {
  const before = loop.steps;
  for (let t = start; t < start + ms; t += 1000 / hz) loop.tick(t);
  return loop.steps - before;
}

const moving = () => ({ step: vi.fn(() => true) });

describe("the ambient loop (#572): one loop for every ambient effect", () => {
  it("steps at its capped rate whatever the screen's (60 and 120 Hz), and asks for a frame only when an effect moves", () => {
    const loop = new AmbientLoop();
    const effect = moving();
    loop.register(effect);
    loop.setEnabled(true);
    expect(loop.getRate()).toBe(AMBIENT_FPS);
    expect(run(loop, 60, 1000)).toBeGreaterThanOrEqual(29);
    expect(run(loop, 60, 1000, 1000)).toBeLessThanOrEqual(31);
    expect(run(loop, 120, 1000, 2000)).toBeLessThanOrEqual(31);
    loop.setRate(15);
    expect(run(loop, 60, 1000, 3000)).toBeLessThanOrEqual(16);

    const still = new AmbientLoop();
    still.register({ step: () => false });
    still.setEnabled(true);
    expect(still.tick(0)).toBe(false);
    expect(still.steps).toBe(1);
  });

  it("every effect shares the one time uniform, stepped once a tick", () => {
    const loop = new AmbientLoop();
    const a = moving();
    const b = moving();
    loop.register(a);
    const unregister = loop.register(b);
    loop.setEnabled(true);
    loop.tick(0);
    loop.tick(40);
    expect(loop.time.value).toBeCloseTo(0.04);
    expect(a.step).toHaveBeenLastCalledWith(loop.time.value);
    expect(b.step).toHaveBeenCalledTimes(2);
    unregister();
    loop.tick(80);
    expect(b.step).toHaveBeenCalledTimes(2);
    expect(a.step).toHaveBeenCalledTimes(3);
  });

  it("does not step while off, paused (hidden, covered) or with no effect; the time does not jump on resume", () => {
    const loop = new AmbientLoop();
    expect(loop.tick(0)).toBe(false);
    loop.register(moving());
    expect(run(loop, 60, 500)).toBe(0);
    loop.setEnabled(true);
    loop.tick(0);
    loop.setPaused("covered", true);
    expect(loop.running).toBe(false);
    expect(run(loop, 60, 5000, 16)).toBe(0);
    loop.setPaused("covered", false);
    loop.tick(10_000);
    loop.tick(10_040);
    expect(loop.time.value).toBeCloseTo(0.04);
    // A long frame moves the time by 0.1 s at most.
    loop.tick(20_000);
    expect(loop.time.value).toBeCloseTo(0.14);
    loop.setEnabled(false);
    expect(run(loop, 60, 500, 30_000)).toBe(0);
  });

  it("pauses while the document is hidden, and stops following it on dispose", () => {
    const listeners = new Set<() => void>();
    const doc = {
      hidden: true,
      addEventListener: vi.fn((_: string, cb: () => void) => listeners.add(cb)),
      removeEventListener: vi.fn((_: string, cb: () => void) => listeners.delete(cb)),
    };
    const loop = new AmbientLoop();
    loop.register(moving());
    loop.setEnabled(true);
    loop.followVisibility(doc as unknown as Document);
    expect(loop.isPaused("hidden")).toBe(true);
    expect(loop.tick(0)).toBe(false);
    doc.hidden = false;
    for (const cb of listeners) cb();
    expect(loop.tick(100)).toBe(true);
    loop.dispose();
    expect(listeners.size).toBe(0);
    expect(loop.running).toBe(false);
  });
});

describe("the ambient settings: one 'Ambient effects' switch, off on Low and under reduced motion", () => {
  it("is off by default in the renderer (the app turns it on), at about 30 fps", () => {
    expect(DEFAULT_RENDERER_SETTINGS.ambient).toBe(DEFAULT_AMBIENT_SETTINGS);
    expect(DEFAULT_AMBIENT_SETTINGS).toMatchObject({ enabled: false, fps: 30, reducedMotion: "auto" });
    expect(resolveRendererSettings({ ambient: { enabled: true } }).ambient.enabled).toBe(true);
  });

  it("takes the fields given over the base, and keeps the base's for a value out of range", () => {
    const s = resolveAmbientSettings({ fps: 240, particles: { water: { size: -1, opacity: 3, color: "#fff" }, boardCap: 10 } });
    expect(s.fps).toBe(60);
    expect(s.particles.water.size).toBe(DEFAULT_AMBIENT_SETTINGS.particles.water.size);
    expect(s.particles.water.opacity).toBe(1);
    expect(s.particles.water.color).toBe("#fff");
    expect(s.particles.boardCap).toBe(10);
    expect(s.particles.wonder).toEqual(DEFAULT_AMBIENT_SETTINGS.particles.wonder);
    expect(resolveAmbientSettings({ fps: 0 }).fps).toBe(30);
  });

  it("runs only on, above the Low tier, and without reduced motion", () => {
    const on = { enabled: true, reducedMotion: "auto" as const };
    expect(ambientAllowed(on, "medium", false)).toBe(true);
    expect(ambientAllowed(on, "high", false)).toBe(true);
    expect(ambientAllowed(on, "low", false)).toBe(false);
    expect(ambientAllowed(on, "medium", true)).toBe(false);
    expect(ambientAllowed({ ...on, reducedMotion: false }, "medium", true)).toBe(true);
    expect(ambientAllowed({ ...on, reducedMotion: true }, "medium", false)).toBe(false);
    expect(ambientAllowed({ ...on, enabled: false }, "medium", false)).toBe(false);
  });
});
