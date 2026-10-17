import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MusicPlayerControls, formatTime } from "../src/components/containers/music-player";
import { MusicProvider, useMusic } from "../src/components/containers/music-provider";
import { CROSSFADE_S, createMusicPlayer } from "../src/lib/music/player";
import { TRACKS, createShuffle, trackTitle } from "../src/lib/music/tracks";

// The music player (P-81): nothing loads before a gesture, `preload` is "none", no immediate repeat, a crossfade on the
// elements' volumes, a hidden tab pauses; and no track is ever imported into the bundle.

/** A media element as far as the player uses one: no network, a clock the test moves. */
class FakeAudio extends EventTarget {
  preload = "";
  loop = true;
  volume = 1;
  currentTime = 0;
  duration = NaN;
  paused = true;
  ended = false;
  src = "";
  plays = 0;
  play() {
    this.paused = false;
    this.plays++;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  load() {}
  removeAttribute(name: string) {
    if (name === "src") this.src = "";
  }
}
const asAudio = (a: FakeAudio) => a as unknown as HTMLAudioElement;

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
  document.dispatchEvent(new Event("visibilitychange"));
};

function make(options: { enabled?: boolean; volume?: number; random?: () => number } = {}) {
  const made: FakeAudio[] = [];
  const player = createMusicPlayer({ tracks: TRACKS, enabled: options.enabled ?? true, volume: options.volume ?? 0.4, random: options.random, createAudio: () => asAudio(made[made.push(new FakeAudio()) - 1]!) });
  return { player, a: made[0]!, b: made[1]! };
}

beforeEach(() => {
  vi.useFakeTimers();
  setHidden(false);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("no audio before a gesture", () => {
  it("makes two elements with preload none and no source, and plays nothing", () => {
    const { player, a, b } = make();
    for (const el of [a, b]) {
      expect(el.preload).toBe("none");
      expect(el.src).toBe("");
      expect(el.plays).toBe(0);
    }
    vi.advanceTimersByTime(5000);
    expect(player.getState()).toMatchObject({ unlocked: false, playing: false, title: null });
    expect(a.src + b.src).toBe("");
    player.destroy();
  });

  it("keeps quiet when the setting turns on before any gesture, and starts at the first gesture", () => {
    const { player, a, b } = make({ enabled: false });
    player.setEnabled(true);
    expect(a.plays + b.plays).toBe(0);
    document.dispatchEvent(new Event("pointerdown"));
    expect(player.getState().unlocked).toBe(true);
    expect(a.plays).toBe(1);
    expect(a.src).toMatch(/^\/music\/\d\d-[a-z-]+\.m4a$/);
    expect(b.src).toBe("");
    expect(a.volume).toBeCloseTo(0.4);
    expect(player.getState().playing).toBe(true);
    player.destroy();
  });

  it("a gesture with music off loads nothing; turning it on then plays", () => {
    const { player, a } = make({ enabled: false });
    document.dispatchEvent(new Event("keydown"));
    expect(a.src).toBe("");
    player.setEnabled(true);
    expect(a.plays).toBe(1);
    player.setEnabled(false);
    expect(a.paused).toBe(true);
    player.destroy();
  });
});

describe("the playlist", () => {
  it("never repeats a track at once, across passes, even with a random that always picks the same", () => {
    for (const random of [() => 0, () => 0.999999, Math.random]) {
      const next = createShuffle(TRACKS.length, random);
      const picks = Array.from({ length: TRACKS.length * 6 }, next);
      for (let i = 1; i < picks.length; i++) expect(picks[i]).not.toBe(picks[i - 1]);
      for (let pass = 0; pass < 6; pass++) expect(new Set(picks.slice(pass * TRACKS.length, (pass + 1) * TRACKS.length)).size).toBe(TRACKS.length);
    }
  });

  it("has the 16 tracks, under /music/, and reads a title from the file name", () => {
    expect(TRACKS).toHaveLength(16);
    expect(trackTitle("/music/09-whispers-of-the-court.m4a")).toBe("Whispers of the Court");
    expect(trackTitle("/music/00-endless-kingdom.m4a")).toBe("Endless Kingdom");
    expect(trackTitle("/music/01-a-kingdom-awakens.m4a")).toBe("A Kingdom Awakens");
  });

  it("every listed file is in public/music/", () => {
    const files = new Set(readdirSync(join(__dirname, "../public/music")));
    for (const t of TRACKS) expect(files.has(t.replace("/music/", "")), t).toBe(true);
  });
});

describe("the crossfade", () => {
  it("starts the next track CROSSFADE_S before the end, falls and rises on the volumes, and swaps", () => {
    const { player, a, b } = make({ volume: 0.5 });
    document.dispatchEvent(new Event("click"));
    a.duration = 100;
    a.currentTime = 100 - CROSSFADE_S - 1;
    vi.advanceTimersByTime(100);
    expect(b.plays).toBe(0);
    const first = a.src;

    a.currentTime = 99; // 1 s left: half way
    vi.advanceTimersByTime(100);
    expect(b.plays).toBe(1);
    expect(b.src).not.toBe("");
    expect(b.src).not.toBe(first);
    expect(a.volume).toBeCloseTo(0.25);
    expect(b.volume).toBeCloseTo(0.25);

    a.currentTime = 100;
    vi.advanceTimersByTime(100);
    expect(a.paused).toBe(true);
    expect(a.src).toBe("");
    expect(b.volume).toBeCloseTo(0.5);
    expect(player.getState().title).toBe(trackTitle(b.src));
    player.destroy();
  });

  it("skip jumps to the last seconds of the track and crossfades", () => {
    const { player, a, b } = make();
    document.dispatchEvent(new Event("click"));
    a.duration = 200;
    a.currentTime = 10;
    player.skip();
    expect(a.currentTime).toBe(200 - CROSSFADE_S);
    expect(b.plays).toBe(1);
    player.destroy();
  });

  it("skip before the metadata loads cuts to the next track, and a second skip still works", () => {
    const { player, a, b } = make({ volume: 0.4 });
    document.dispatchEvent(new Event("click"));
    expect(Number.isNaN(a.duration)).toBe(true);
    const first = a.src;
    player.skip();
    // The incoming track is the current one, at the set volume; the outgoing one is silent.
    expect(b.src).not.toBe("");
    expect(b.src).not.toBe(first);
    expect(a.src).toBe("");
    expect(b.volume).toBeCloseTo(0.4);
    expect(player.getState().title).toBe(trackTitle(b.src));
    const second = b.src;
    player.skip();
    expect(a.src).not.toBe("");
    expect(a.src).not.toBe(second);
    expect(a.volume).toBeCloseTo(0.4);
    expect(player.getState().title).toBe(trackTitle(a.src));
    player.destroy();
  });

  it("follows the volume setting", () => {
    const { player, a } = make({ volume: 0.4 });
    document.dispatchEvent(new Event("click"));
    player.setVolume(0.9);
    expect(a.volume).toBeCloseTo(0.9);
    player.setVolume(7);
    expect(player.getState().volume).toBe(1);
    player.destroy();
  });
});

describe("a hidden tab", () => {
  it("pauses both elements and resumes them when the tab is visible again", () => {
    const { player, a, b } = make();
    document.dispatchEvent(new Event("click"));
    a.duration = 100;
    a.currentTime = 99; // mid-fade: both are playing
    vi.advanceTimersByTime(100);
    expect([a.paused, b.paused]).toEqual([false, false]);

    setHidden(true);
    expect([a.paused, b.paused]).toEqual([true, true]);
    expect(player.getState().playing).toBe(false);
    const plays = a.plays;
    vi.advanceTimersByTime(5000);
    expect(a.plays).toBe(plays);

    setHidden(false);
    expect([a.paused, b.paused]).toEqual([false, false]);
    expect(player.getState().playing).toBe(true);
    player.destroy();
  });

  it("does not play on becoming visible when the music is off", () => {
    const { player, a } = make({ enabled: false });
    document.dispatchEvent(new Event("click"));
    setHidden(true);
    setHidden(false);
    expect(a.plays).toBe(0);
    player.destroy();
  });

  it("starts paused when the page opens in a hidden tab, and plays when it shows", () => {
    setHidden(true);
    const { player, a } = make();
    document.dispatchEvent(new Event("click"));
    expect(a.plays).toBe(0);
    setHidden(false);
    expect(a.plays).toBe(1);
    player.destroy();
  });
});

describe("the provider and the player", () => {
  function Probe() {
    const m = useMusic();
    return <span data-testid="state">{`${m.unlocked}|${m.playing}|${m.title ?? ""}`}</span>;
  }

  it("loads its player lazily, requests nothing at first, and plays the first track after a click", async () => {
    vi.useRealTimers();
    const played: string[] = [];
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
      played.push(this.getAttribute("src") ?? this.src);
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    const created = vi.spyOn(document, "createElement");
    render(
      <MusicProvider enabled volume={0.4}>
        <Probe />
      </MusicProvider>,
    );
    await waitFor(() => expect(created.mock.calls.filter(([tag]) => tag === "audio")).toHaveLength(2));
    const audios = created.mock.results.filter((r, i) => created.mock.calls[i]![0] === "audio").map((r) => r.value as HTMLAudioElement);
    for (const a of audios) {
      expect(a.preload).toBe("none");
      expect(a.getAttribute("src")).toBeNull();
    }
    expect(played).toEqual([]);
    expect(screen.getByTestId("state")).toHaveTextContent("false|false|");

    await userEvent.click(document.body);
    await waitFor(() => expect(played).toHaveLength(1));
    expect(played[0]).toMatch(/\/music\/\d\d-.*\.m4a$/);
    expect(screen.getByTestId("state").textContent).toMatch(/^true\|/);
    vi.restoreAllMocks();
  });

  it("the controls show the title and the time, and report the switch, the volume and the skip", async () => {
    vi.useRealTimers();
    const onEnabledChange = vi.fn();
    const onSkip = vi.fn();
    render(<MusicPlayerControls title="Market Day" position={65} duration={183} enabled playing volume={0.4} onEnabledChange={onEnabledChange} onSkip={onSkip} />);
    expect(screen.getByTestId("music-title")).toHaveTextContent("Market Day");
    expect(screen.getByTestId("music-time")).toHaveTextContent("1:05 / 3:03");
    await userEvent.click(screen.getByRole("button", { name: "Turn music off" }));
    expect(onEnabledChange).toHaveBeenCalledWith(false);
    await userEvent.click(screen.getByRole("button", { name: "Next track" }));
    expect(onSkip).toHaveBeenCalled();
    expect(formatTime(0)).toBe("0:00");
    act(() => {});
  });
});

describe("the bundle", () => {
  const SRC = join(__dirname, "../src");
  const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : [join(dir, n)]));

  it("imports no .m4a (or any music file) anywhere in the source", () => {
    for (const f of files(SRC).filter((f) => /\.(tsx?|css)$/.test(f))) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/\b(import|from|require|new URL)\s*\(?\s*["'`][^"'`]*\.(m4a|mp3|ogg|wav|aac)\b/);
    }
  });

  it("names the tracks by URL only, in one file", () => {
    const naming = files(SRC).filter((f) => /\.m4a/.test(readFileSync(f, "utf8")));
    expect(naming.map((f) => f.replace(SRC, ""))).toEqual(expect.arrayContaining(["/lib/music/tracks.ts"]));
  });
});
