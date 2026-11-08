import { beforeEach, describe, expect, it } from "vitest";
import { BACKDROP_PATTERNS, HIGHLIGHT_STYLES, SMALL_SCREEN_PX as RENDERER_SMALL_SCREEN_PX, resolveQuality } from "@paved/renderer";
import { DEFAULT_SETTINGS, SETTINGS_KEY, SMALL_SCREEN_PX, autoTier, createSettingsStore, inClaudePane, parseSettings, squareGridSettings, withSoundMutedOnLoad, withMuteToggled, withVolume } from "../src/data/settings";
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

  it("starts from the defaults: quality auto, music at 0.4, sound effects at 0.7, preview and highlight on", () => {
    expect(createSettingsStore().get()).toEqual({ quality: "auto", seasons: "cycle", dayTime: "cycle", ambient: true, musicVolume: 0.4, musicBefore: 0.4, sfxVolume: 0.7, sfxBefore: 0.7, tilePreview: true, placementHighlight: true, squareGrid: true });
    expect(DEFAULT_SETTINGS.quality).toBe("auto");
  });

  it("clamps a stored music volume to 0..1, and a value that is not a number is the default", () => {
    expect(parseSettings(JSON.stringify({ musicVolume: 3 })).musicVolume).toBe(1);
    expect(parseSettings(JSON.stringify({ musicVolume: -1 })).musicVolume).toBe(0);
    expect(parseSettings(JSON.stringify({ musicVolume: "loud" })).musicVolume).toBe(0.4);
    expect(parseSettings(JSON.stringify({ musicVolume: 0.25 })).musicVolume).toBe(0.25);
  });

  it("round-trips under the one versioned key, and a second store reads what the first wrote", () => {
    const a = createSettingsStore();
    a.set({ quality: "high", seasons: "winter", dayTime: "night", ambient: false, musicVolume: 0.7, musicBefore: 0.7, sfxVolume: 0, sfxBefore: 0.5, tilePreview: false, placementHighlight: false, squareGrid: false });
    expect(SETTINGS_KEY).toBe("paved.settings.v1");
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!)).toEqual({ quality: "high", seasons: "winter", dayTime: "night", ambient: false, musicVolume: 0.7, musicBefore: 0.7, sfxVolume: 0, sfxBefore: 0.5, tilePreview: false, placementHighlight: false, squareGrid: false });
    expect(createSettingsStore().get()).toEqual(a.get());
  });

  it("returns the same object while the stored text does not change, and tells its listeners of a change", () => {
    const store = createSettingsStore();
    expect(store.get()).toBe(store.get());
    let calls = 0;
    const stop = store.subscribe(() => calls++);
    store.set({ ...DEFAULT_SETTINGS, musicVolume: 0.5 });
    stop();
    store.set({ ...DEFAULT_SETTINGS, musicVolume: 0.6 });
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
    store.set({ ...DEFAULT_SETTINGS, sfxVolume: 0 });
    expect(store.get().sfxVolume).toBe(0);
  });

  it("reads a bad stored value as the defaults, field by field", () => {
    for (const raw of ["", "not json", "null", "[]", "42", '"high"']) expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ quality: "ultra", sound: "yes", music: "yes", sfxVolume: "loud", tilePreview: 0 }))).toEqual(DEFAULT_SETTINGS);
    localStorage.setItem(SETTINGS_KEY, "{broken");
    expect(createSettingsStore().get()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("the seasons and the day and night (SEASONS-SETTINGS)", () => {
  it("turn by default: Cycle and Cycle", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ seasons: "cycle", dayTime: "cycle" });
    expect(parseSettings("{}")).toMatchObject({ seasons: "cycle", dayTime: "cycle" });
  });

  it("migrate the Day/night cycle switch: off is Summer and Day (the board it drew), on Cycle and Cycle; the new shape never writes it", () => {
    expect(parseSettings(JSON.stringify({ dayNight: false }))).toMatchObject({ seasons: "summer", dayTime: "day" });
    expect(parseSettings(JSON.stringify({ dayNight: true }))).toMatchObject({ seasons: "cycle", dayTime: "cycle" });
    expect(parseSettings(JSON.stringify({ dayNight: "off" }))).toMatchObject({ seasons: "cycle", dayTime: "cycle" });
    expect(parseSettings(JSON.stringify({ dayNight: false }))).not.toHaveProperty("dayNight");
    // A choice stored by the new shape wins over the switch.
    expect(parseSettings(JSON.stringify({ dayNight: false, seasons: "winter", dayTime: "cycle" }))).toMatchObject({ seasons: "winter", dayTime: "cycle" });
  });

  it("keep each choice strict: one the menus do not offer is the default (or the switch's migration)", () => {
    for (const seasons of ["cycle", "summer", "autumn", "winter", "spring"] as const) expect(parseSettings(JSON.stringify({ seasons })).seasons).toBe(seasons);
    for (const dayTime of ["cycle", "day", "night"] as const) expect(parseSettings(JSON.stringify({ dayTime })).dayTime).toBe(dayTime);
    expect(parseSettings(JSON.stringify({ seasons: "monsoon", dayTime: "dusk" }))).toMatchObject({ seasons: "cycle", dayTime: "cycle" });
    expect(parseSettings(JSON.stringify({ seasons: 2, dayTime: null, dayNight: false }))).toMatchObject({ seasons: "summer", dayTime: "day" });
  });
});

describe("the ambient effects (#572)", () => {
  it("are on by default, and on for a store written before the setting existed", () => {
    expect(DEFAULT_SETTINGS.ambient).toBe(true);
    expect(parseSettings(JSON.stringify({ quality: "low", dayNight: false })).ambient).toBe(true);
    expect(parseSettings(JSON.stringify({ ambient: false })).ambient).toBe(false);
    expect(parseSettings(JSON.stringify({ ambient: "no" })).ambient).toBe(true);
  });
});

describe("the volumes", () => {
  it("clamps each volume to 0..1 and reads a value that is not a number as the default", () => {
    expect(parseSettings(JSON.stringify({ musicVolume: 3, sfxVolume: -1 }))).toMatchObject({ musicVolume: 1, sfxVolume: 0 });
    expect(parseSettings(JSON.stringify({ musicVolume: "loud", sfxVolume: null }))).toMatchObject({ musicVolume: 0.4, sfxVolume: 0.7 });
    expect(parseSettings(JSON.stringify({ musicVolume: 0.25 }))).toMatchObject({ musicVolume: 0.25, musicBefore: 0.25 });
  });

  it("migrates the first shape: a switch that was off is a mute that remembers the level, one that was on changes nothing", () => {
    expect(parseSettings(JSON.stringify({ sound: false, music: true, musicVolume: 0.8 }))).toMatchObject({ sfxVolume: 0, sfxBefore: 0.7, musicVolume: 0.8, musicBefore: 0.8 });
    expect(parseSettings(JSON.stringify({ sound: true, music: false, musicVolume: 0.6 }))).toMatchObject({ sfxVolume: 0.7, musicVolume: 0, musicBefore: 0.6 });
    expect(parseSettings(JSON.stringify({ music: false }))).toMatchObject({ musicVolume: 0, musicBefore: 0.4 });
    expect(parseSettings(JSON.stringify({ quality: "low", dayNight: false, sound: true, music: true, musicVolume: 0.4, tilePreview: true, placementHighlight: false }))).toEqual({ ...DEFAULT_SETTINGS, quality: "low", seasons: "summer", dayTime: "day", placementHighlight: false });
  });

  it("writes only the new shape, so a migrated store reads back the same", () => {
    localStorage.clear();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ sound: false, music: false, musicVolume: 0.9 }));
    const store = createSettingsStore();
    const migrated = store.get();
    store.set(withVolume(migrated, "music", 0.5));
    const written = JSON.parse(localStorage.getItem(SETTINGS_KEY)!);
    expect(written).not.toHaveProperty("sound");
    expect(written).not.toHaveProperty("music");
    expect(createSettingsStore().get()).toMatchObject({ musicVolume: 0.5, sfxVolume: 0, sfxBefore: 0.7 });
  });

  it("keeps the level before a mute: dragging to 0 mutes, the toggle brings the level back", () => {
    let s = withVolume(DEFAULT_SETTINGS, "sfx", 0.3);
    expect(s).toMatchObject({ sfxVolume: 0.3, sfxBefore: 0.3 });
    s = withMuteToggled(s, "sfx");
    expect(s).toMatchObject({ sfxVolume: 0, sfxBefore: 0.3 });
    expect(withMuteToggled(s, "sfx")).toMatchObject({ sfxVolume: 0.3, sfxBefore: 0.3 });
    expect(withVolume(s, "sfx", 0)).toMatchObject({ sfxVolume: 0, sfxBefore: 0.3 });
    expect(withVolume(s, "sfx", 0.8)).toMatchObject({ sfxVolume: 0.8, sfxBefore: 0.8 });
    expect(withVolume(s, "sfx", Number.NaN)).toMatchObject({ sfxVolume: 0, sfxBefore: 0.3 });
  });
});

describe("an agent's preview: the music and the effects muted on each load in the Claude app's pane (AGENT-PREVIEW-MUTE)", () => {
  beforeEach(() => localStorage.clear());

  it("knows the Claude desktop app's pane by its user agent, and nothing else", () => {
    expect(inClaudePane("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Claude/4.23118.0 Chrome/152.0.7977.167 Safari/537.36")).toBe(true);
    expect(inClaudePane("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.8078.80 Safari/537.36")).toBe(false);
    expect(inClaudePane("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(inClaudePane("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/152.0.0.0 Safari/537.36")).toBe(false);
    expect(inClaudePane("")).toBe(false);
  });

  it("reads the music and the effects muted, the levels before them kept, and writes nothing on the load", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, musicVolume: 0.6, musicBefore: 0.6, sfxVolume: 0.5, sfxBefore: 0.5, quality: "high" }));
    const store = withSoundMutedOnLoad(createSettingsStore());
    expect(store.get()).toEqual({ ...DEFAULT_SETTINGS, musicVolume: 0, musicBefore: 0.6, sfxVolume: 0, sfxBefore: 0.5, quality: "high" });
    expect(store.get()).toBe(store.get());
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!)).toMatchObject({ musicVolume: 0.6, sfxVolume: 0.5 });
    // A device with no saved setting starts muted too, the default levels before the mutes.
    localStorage.clear();
    expect(withSoundMutedOnLoad(createSettingsStore()).get()).toMatchObject({ musicVolume: 0, musicBefore: 0.4, sfxVolume: 0, sfxBefore: 0.7 });
  });

  it("plays a channel again for the visit once its slider or the player turns it on, and a load mutes it again", () => {
    const store = withSoundMutedOnLoad(createSettingsStore());
    store.set(withMuteToggled(store.get(), "music"));
    expect(store.get()).toMatchObject({ musicVolume: 0.4, musicBefore: 0.4, sfxVolume: 0, sfxBefore: 0.7 });
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!)).toMatchObject({ musicVolume: 0.4, sfxVolume: 0 });
    expect(withSoundMutedOnLoad(createSettingsStore()).get()).toMatchObject({ musicVolume: 0, sfxVolume: 0 });
  });

  it("writes the mutes as they read when another setting changes, and reads stored mutes as they are", () => {
    const store = withSoundMutedOnLoad(createSettingsStore());
    store.set({ ...store.get(), quality: "low" });
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!)).toMatchObject({ quality: "low", musicVolume: 0, musicBefore: 0.4, sfxVolume: 0, sfxBefore: 0.7 });
    const muted = createSettingsStore();
    expect(withSoundMutedOnLoad(muted).get()).toEqual(muted.get());
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

describe("the square grid's highlight style and backdrop pattern a page asks for (?filler=, ?void=)", () => {
  it("takes a style or a pattern the renderer knows, only while the grid is on; any other page draws the defaults", () => {
    expect(squareGridSettings(true, "")).toEqual({ enabled: true });
    expect(squareGridSettings(true, "?filler=frame")).toEqual({ enabled: true, highlight: { style: "frame" } });
    expect(squareGridSettings(true, "?void=cobbles&filler=diamond")).toEqual({ enabled: true, highlight: { style: "diamond" }, backdrop: { pattern: "cobbles" } });
    expect(squareGridSettings(true, "?filler=nope&void=nope&voxels=0")).toEqual({ enabled: true });
    expect(squareGridSettings(true, "?void=voxels&voxels=20")).toEqual({ enabled: true, backdrop: { pattern: "voxels", voxels: 20 } });
    expect(squareGridSettings(true, "?voxels=81")).toEqual({ enabled: true });
    expect(squareGridSettings(false, "?filler=frame&void=voxels")).toEqual({ enabled: false });
    // The lists repeated here are the renderer's.
    for (const style of HIGHLIGHT_STYLES) expect(squareGridSettings(true, `?filler=${style}`)).toEqual({ enabled: true, highlight: { style } });
    for (const pattern of BACKDROP_PATTERNS) expect(squareGridSettings(true, `?void=${pattern}`)).toEqual({ enabled: true, backdrop: { pattern } });
  });
});
