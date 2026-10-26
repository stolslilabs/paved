import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceSettingsPanel, type DevicePreferences } from "../src/components/containers/device-settings-panel";
import { DeviceSettingsSheet } from "../src/components/containers/device-settings-sheet";
import { GameHud } from "../src/components/containers/game-hud";
import { VolumeSlider, volumeIcon } from "../src/components/elements/volume-slider";
import { closingSounds } from "../src/components/containers/board-sounds";
import { createAudioEngine } from "../src/lib/audio/engine";
import { SFX_NAMES, sfxUrl } from "../src/lib/audio/sfx";
import { DEFAULT_SETTINGS, withVolume } from "../src/data/settings";
import { TRACKS } from "../src/lib/music/tracks";
import { SOUNDS, render as synth, wav } from "../scripts/make-sfx.ts";

// The volume sliders, the settings panel and sheet, the HUD gear, the Web Audio graph (a fake context), the sound files.

/** A `VolumeSlider` on a state of its own, the way the parent keeps one number and the level before the mute. */
function Harness({ start = 0.4 }: { start?: number }) {
  const [s, set] = useState({ ...DEFAULT_SETTINGS, musicVolume: start, musicBefore: start || 0.4 });
  return <VolumeSlider label="Music" value={s.musicVolume} before={s.musicBefore} onChange={(v) => set(withVolume(s, "music", v))} />;
}

describe("VolumeSlider", () => {
  it("steps the icon: crossed at 0, one wave below a half, two from a half", () => {
    expect([0, 0.2, 0.49, 0.5, 1].map(volumeIcon)).toEqual(["volume-xmark", "volume-low", "volume-low", "volume-high", "volume-high"]);
  });

  it("mutes on the icon and brings back the level before the mute", async () => {
    render(<Harness start={0.4} />);
    const button = screen.getByRole("button", { name: "Mute music" });
    const slider = screen.getByRole("slider", { name: "Music volume" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(slider).toHaveAttribute("aria-valuenow", "40");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(slider).toHaveAttribute("aria-valuetext", "Muted");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
    await vi.waitFor(() => expect(slider).toHaveAttribute("aria-valuenow", "40"));
  });

  it("mutes when dragged to 0 and unmutes when dragged up from 0, by the keyboard too", async () => {
    render(<Harness start={0.02} />);
    const slider = screen.getByRole("slider", { name: "Music volume" });
    const button = screen.getByRole("button", { name: "Mute music" });
    slider.focus();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(button).toHaveAttribute("aria-pressed", "true");
    await userEvent.keyboard("{ArrowRight}");
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(slider).toHaveAttribute("aria-valuenow", "1");
  });

  it("has a 44 px icon button", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Mute music" }).className).toContain("size-11");
  });
});

const PREFS: DevicePreferences = { quality: "auto", dayNight: true, ambient: true, musicVolume: 0.4, musicBefore: 0.4, sfxVolume: 0.7, sfxBefore: 0.7, tilePreview: true, placementHighlight: true, squareGrid: true };

describe("DeviceSettingsPanel", () => {
  it("has Visuals, Sound and Gameplay, and not the account, the theme or the referral", () => {
    render(<DeviceSettingsPanel preferences={PREFS} />);
    for (const name of ["Visuals", "Sound", "Gameplay"]) expect(screen.getByRole("region", { name })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Day\/night cycle/ })).toBeChecked();
    expect(screen.queryByRole("region", { name: "Account" })).toBeNull();
    expect(screen.queryByText("Theme")).toBeNull();
  });

  it("reports a channel and its volume", async () => {
    const onVolumeChange = vi.fn();
    const onChange = vi.fn();
    render(<DeviceSettingsPanel preferences={PREFS} onVolumeChange={onVolumeChange} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Mute sound effects" }));
    expect(onVolumeChange).toHaveBeenCalledWith("sfx", 0);
    await userEvent.click(screen.getByRole("switch", { name: /Day\/night cycle/ }));
    expect(onChange).toHaveBeenCalledWith("dayNight", false);
  });

  it("unmutes to the level before the mute", async () => {
    const onVolumeChange = vi.fn();
    render(<DeviceSettingsPanel preferences={{ ...PREFS, musicVolume: 0, musicBefore: 0.55 }} onVolumeChange={onVolumeChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Mute music" }));
    expect(onVolumeChange).toHaveBeenCalledWith("music", 0.55);
  });
});

describe("DeviceSettingsSheet", () => {
  it("opens the panel in a dialog, bottom or side", async () => {
    const { rerender } = render(<DeviceSettingsSheet open onOpenChange={() => {}} preferences={PREFS} side="bottom" />);
    expect(await screen.findByRole("dialog", { name: "Settings" })).toHaveAttribute("data-side", "bottom");
    expect(screen.getByRole("slider", { name: "Music volume" })).toBeInTheDocument();
    rerender(<DeviceSettingsSheet open onOpenChange={() => {}} preferences={PREFS} side="right" />);
    expect(await screen.findByRole("dialog", { name: "Settings" })).toHaveAttribute("data-side", "right");
  });
});

describe("GameHud gear", () => {
  const hud = { title: "Training", score: 0, remaining: 10, now: 0 };
  it("is there only when the board gives it a handler, and calls it", async () => {
    const onSettings = vi.fn();
    const { rerender } = render(<GameHud {...hud} />);
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
    rerender(<GameHud {...hud} onSettings={onSettings} />);
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(onSettings).toHaveBeenCalledOnce();
  });
});

/** The parts of Web Audio the engine touches, recording what it does. */
function fakeContext() {
  const gains: { gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn> }; connect: ReturnType<typeof vi.fn> }[] = [];
  const starts: number[] = [];
  const stops: number[] = [];
  const ctx = {
    state: "suspended" as string,
    currentTime: 0,
    destination: {},
    createGain: () => {
      const g = { gain: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn() };
      gains.push(g);
      return g;
    },
    createMediaElementSource: () => ({ connect: vi.fn() }),
    createBufferSource: () => ({ buffer: null, connect: vi.fn(), start: () => void starts.push(1), stop: () => void stops.push(1), onended: null as (() => void) | null }),
    decodeAudioData: vi.fn(async () => ({ duration: 0.1 }) as unknown as AudioBuffer),
    resume: vi.fn(async () => void (ctx.state = "running")),
    suspend: vi.fn(async () => void (ctx.state = "suspended")),
    close: vi.fn(async () => {}),
  };
  return { ctx, gains, starts, stops };
}

class FakeAudio extends EventTarget {
  preload = "";
  loop = true;
  volume = 1;
  currentTime = 0;
  duration = NaN;
  paused = true;
  ended = false;
  src = "";
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  load() {}
  removeAttribute() {
    this.src = "";
  }
}

describe("the audio engine", () => {
  const make = (musicVolume = 0.4, sfxVolume = 0.7) => {
    const f = fakeContext();
    const fetchSound = vi.fn(async () => new ArrayBuffer(8));
    const engine = createAudioEngine({ tracks: TRACKS, musicVolume, sfxVolume, createContext: () => f.ctx as unknown as AudioContext, createAudio: () => new FakeAudio() as unknown as HTMLAudioElement, fetchSound });
    return { ...f, engine, fetchSound };
  };
  const setVisibility = (state: "hidden" | "visible") => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    document.dispatchEvent(new Event("visibilitychange"));
  };
  afterEach(() => setVisibility("visible"));

  it("sets the two gains from the volumes, and moves them without a click", () => {
    const { gains, engine } = make(0.4, 0.7);
    // master, music, sfx are the first three gains made.
    expect([gains[1]!.gain.value, gains[2]!.gain.value]).toEqual([0.4, 0.7]);
    engine.setMusicVolume(0.9);
    engine.setSfxVolume(0);
    expect(gains[1]!.gain.setTargetAtTime).toHaveBeenCalledWith(0.9, 0, expect.any(Number));
    expect(gains[2]!.gain.setTargetAtTime).toHaveBeenCalledWith(0, 0, expect.any(Number));
    engine.destroy();
  });

  it("fetches no sound and starts no context before the first gesture, then loads the set", async () => {
    const { ctx, engine, fetchSound } = make();
    expect(fetchSound).not.toHaveBeenCalled();
    expect(ctx.resume).not.toHaveBeenCalled();
    act(() => void document.dispatchEvent(new Event("pointerdown")));
    expect(ctx.resume).toHaveBeenCalled();
    expect(fetchSound.mock.calls.map((c) => c[0])).toEqual(SFX_NAMES.map(sfxUrl));
    await vi.waitFor(() => expect(engine.loaded()).toHaveLength(SFX_NAMES.length));
    engine.destroy();
  });

  it("plays a sound once it is loaded, not while muted, and not twice within a few ms", async () => {
    const { engine, starts } = make();
    engine.play("tap");
    expect(starts).toHaveLength(0);
    act(() => void document.dispatchEvent(new Event("pointerdown")));
    await vi.waitFor(() => expect(engine.loaded()).toHaveLength(SFX_NAMES.length));
    engine.play("tap");
    engine.play("tap");
    expect(starts).toHaveLength(1);
    engine.setSfxVolume(0);
    engine.play("place");
    expect(starts).toHaveLength(1);
    engine.destroy();
  });

  it("keeps the context running in a hidden tab while the music plays (#712), and suspends it there when nothing plays", async () => {
    const { ctx, engine } = make();
    act(() => void document.dispatchEvent(new Event("pointerdown")));
    expect(engine.music.getState().playing).toBe(true);
    setVisibility("hidden");
    expect(ctx.suspend).not.toHaveBeenCalled();
    expect(ctx.state).toBe("running");
    expect(engine.music.getState().playing).toBe(true);
    // The music off in the hidden tab: nothing sounds there, the context is suspended.
    engine.setMusicVolume(0);
    expect(ctx.suspend).toHaveBeenCalledOnce();
    // On again (the lock screen's play): the context wakes, still hidden.
    engine.music.resume();
    engine.setMusicVolume(0.4);
    await vi.waitFor(() => expect(ctx.state).toBe("running"));
    expect(engine.music.getState().playing).toBe(true);
    engine.setMusicVolume(0);
    setVisibility("visible");
    await vi.waitFor(() => expect(ctx.state).toBe("running"));
    engine.destroy();
  });

  it("suspends the context of a hidden tab whose music is off, and wakes it when the tab shows", async () => {
    const { ctx, engine } = make(0);
    act(() => void document.dispatchEvent(new Event("pointerdown")));
    setVisibility("hidden");
    expect(ctx.suspend).toHaveBeenCalled();
    expect(ctx.state).toBe("suspended");
    setVisibility("visible");
    await vi.waitFor(() => expect(ctx.state).toBe("running"));
    engine.destroy();
  });

  it("plays no sound effect in a hidden tab, even with the context running for the music", async () => {
    const { ctx, engine, starts } = make();
    act(() => void document.dispatchEvent(new Event("pointerdown")));
    await vi.waitFor(() => expect(engine.loaded()).toHaveLength(SFX_NAMES.length));
    setVisibility("hidden");
    expect(ctx.state).toBe("running");
    engine.play("tap");
    expect(starts).toHaveLength(0);
    setVisibility("visible");
    engine.play("tap");
    expect(starts).toHaveLength(1);
    engine.destroy();
  });

  it("cuts an effect that is sounding when the tab is hidden, while the music plays on", async () => {
    const { ctx, engine, starts, stops } = make();
    act(() => void document.dispatchEvent(new Event("pointerdown")));
    await vi.waitFor(() => expect(engine.loaded()).toHaveLength(SFX_NAMES.length));
    engine.play("tap");
    expect(starts).toHaveLength(1);
    setVisibility("hidden");
    expect(stops).toHaveLength(1);
    expect(ctx.state).toBe("running");
    engine.destroy();
  });

  it("falls back to the music alone where there is no Web Audio", () => {
    const engine = createAudioEngine({ tracks: TRACKS, musicVolume: 0.4, sfxVolume: 0.7, createContext: () => { throw new Error("no Web Audio"); }, createAudio: () => new FakeAudio() as unknown as HTMLAudioElement });
    expect(() => engine.play("tap")).not.toThrow();
    expect(engine.loaded()).toEqual([]);
    engine.destroy();
  });
});

describe("the sound files", () => {
  it("are the named set, small, and what the script writes", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = join(import.meta.dirname, "../public/sfx");
    expect(readdirSync(dir).sort()).toEqual(SFX_NAMES.map((n) => `${n}.wav`).sort());
    expect(Object.keys(SOUNDS).sort()).toEqual([...SFX_NAMES].sort());
    let total = 0;
    for (const n of SFX_NAMES) {
      const size = statSync(join(dir, `${n}.wav`)).size;
      expect(size, n).toBeLessThan(50_000);
      total += size;
      expect(readFileSync(join(dir, `${n}.wav`)).subarray(0, 4).toString()).toBe("RIFF");
    }
    expect(total).toBeLessThan(300_000);
    expect(wav(synth(SOUNDS.tap!.notes, SOUNDS.tap!.length)).length).toBe(statSync(join(dir, "tap.wav")).size);
  });
});

describe("closingSounds", () => {
  it("is one sound per category closed", () => {
    expect(closingSounds([])).toEqual([]);
    expect(closingSounds([{ category: 3, size: 2, points: 4 }, { category: 3, size: 3, points: 6 }]).length).toBe(1);
  });
});
