import { beforeEach, describe, expect, it } from "vitest";
import { SMALL_SCREEN_PX as RENDERER_SMALL_SCREEN_PX, resolveQuality } from "@paved/renderer";
import { DEFAULT_SETTINGS, SETTINGS_KEY, SMALL_SCREEN_PX, autoTier, createSettingsStore, parseSettings } from "../src/data/settings";
import { THEME_KEY, deviceTheme } from "../src/data/skins";

// The device stores (P11a): the settings under one versioned key and the theme's, each with an in-memory twin.

/** A storage whose every call throws: private mode, blocked site data. */
const off = () => ({
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
});

describe("the device settings store", () => {
  beforeEach(() => localStorage.clear());

  it("starts from the mockups' defaults: quality auto, sound on, music off, preview and highlight on", () => {
    expect(createSettingsStore().get()).toEqual({ quality: "auto", dayNight: true, sound: true, music: false, tilePreview: true, placementHighlight: true });
    expect(DEFAULT_SETTINGS.quality).toBe("auto");
  });

  it("round-trips under the one versioned key, and a second store reads what the first wrote", () => {
    const a = createSettingsStore();
    a.set({ quality: "high", dayNight: false, sound: false, music: true, tilePreview: false, placementHighlight: false });
    expect(SETTINGS_KEY).toBe("paved.settings.v1");
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!)).toEqual({ quality: "high", dayNight: false, sound: false, music: true, tilePreview: false, placementHighlight: false });
    expect(createSettingsStore().get()).toEqual(a.get());
  });

  it("returns the same object while the stored text does not change, and tells its listeners of a change", () => {
    const store = createSettingsStore();
    expect(store.get()).toBe(store.get());
    let calls = 0;
    const stop = store.subscribe(() => calls++);
    store.set({ ...DEFAULT_SETTINGS, music: true });
    stop();
    store.set({ ...DEFAULT_SETTINGS, music: false });
    expect(calls).toBe(1);
  });

  it("keeps the choice for the visit when storage is off, and does not throw", () => {
    const store = createSettingsStore(off);
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    store.set({ ...DEFAULT_SETTINGS, quality: "low" });
    expect(store.get().quality).toBe("low");
  });

  it("clears its in-memory twin after a later successful write: storage is the truth again", () => {
    let failing = true;
    const mem = new Map<string, string>();
    const flaky = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (failing) throw new Error("full");
        mem.set(k, v);
      },
    };
    const store = createSettingsStore(() => flaky);
    store.set({ ...DEFAULT_SETTINGS, quality: "low" });
    expect(store.get().quality).toBe("low");
    expect(mem.size).toBe(0);
    // Storage recovers: the next write is stored, and a second tab's later change is read, not shadowed by the twin.
    failing = false;
    store.set({ ...DEFAULT_SETTINGS, quality: "high" });
    expect(store.get().quality).toBe("high");
    mem.set(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, quality: "medium" }));
    expect(store.get().quality).toBe("medium");
  });

  it("keeps the choice when there is no storage at all", () => {
    const store = createSettingsStore(() => null);
    store.set({ ...DEFAULT_SETTINGS, sound: false });
    expect(store.get().sound).toBe(false);
  });

  it("reads a bad stored value as the defaults, field by field", () => {
    for (const raw of ["", "not json", "null", "[]", "42", '"high"']) expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ quality: "ultra", sound: "yes", music: true, tilePreview: 0 }))).toEqual({ ...DEFAULT_SETTINGS, music: true });
    localStorage.setItem(SETTINGS_KEY, "{broken");
    expect(createSettingsStore().get()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("the device theme store (the viewer's skins switch)", () => {
  beforeEach(() => {
    localStorage.clear();
    deviceTheme.reset();
  });

  it("shows the skins until the viewer opts out: nothing stored is forest", () => {
    expect(deviceTheme.get()).toBe("forest");
  });

  it("keeps the values stored before P11a readable: default is the opt-out, forest the skins", () => {
    localStorage.setItem(THEME_KEY, "default");
    expect(deviceTheme.get()).toBe("default");
    localStorage.setItem(THEME_KEY, "forest");
    expect(deviceTheme.get()).toBe("forest");
  });

  it("reads a value it does not know as nothing stored", () => {
    localStorage.setItem(THEME_KEY, "volcano");
    expect(deviceTheme.get()).toBe("forest");
  });
});

describe("the renderer's constants repeated here (the settings chunk keeps three.js out)", () => {
  it("agree with the renderer's: the small screen and what auto resolves to", () => {
    expect(SMALL_SCREEN_PX).toBe(RENDERER_SMALL_SCREEN_PX);
    for (const coarseOrSmall of [false, true]) expect(autoTier(coarseOrSmall)).toBe(resolveQuality("auto", coarseOrSmall));
  });
});
