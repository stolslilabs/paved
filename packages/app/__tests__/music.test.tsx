import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MusicPlayer, formatTime, musicStatus, usePreloadedArt } from "../src/components/containers/music-player";
import { AudioProvider, useMusic } from "../src/components/containers/audio-provider";
import { ALBUM, bindMediaSession, type SessionLike } from "../src/lib/music/media-session";
import { CROSSFADE_S, HISTORY, createMusicPlayer } from "../src/lib/music/player";
import { ART_SIZES, TRACK_LIST, artOf, titleOf, trackTitle } from "../src/lib/music/track-info";
import { FILES, TRACKS, createShuffle } from "../src/lib/music/tracks";
import { expected, imageSize, sources, webpSize } from "../scripts/compress-music-art.ts";

// The music player (P-81): nothing loads before a gesture, `preload` is "none", no immediate repeat, a crossfade on the
// elements' volumes, a hidden tab plays on (#712); previous, pause and resume, the Media Session (#569); and no track or image is ever
// imported into the bundle, and no original image ships.

/** A media element as far as the player uses one: no network, a clock the test moves. */
class FakeAudio extends EventTarget {
  preload = "";
  loop = true;
  volume = 1;
  currentTime = 0;
  duration = NaN;
  paused = true;
  ended = false;
  readyState = 4;
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

  it("lists the same files, in the same order, in the playlist and with the titles", () => {
    expect(TRACK_LIST.map(([file]) => file)).toEqual([...FILES]);
  });

  it("carries the album's titles, apostrophes included; trackTitle is only the fallback", () => {
    expect(titleOf("/music/04-the-rivers-path.m4a")).toBe("The River's Path");
    expect(titleOf("/music/14-the-craftsmans-rhythm.m4a")).toBe("The Craftsman's Rhythm");
    expect(titleOf("/music/99-a-new-song.m4a")).toBe("A New Song");
    // Each title is the one its source image is named with (`01 - A Kingdom Awakens.jpeg`).
    for (const { file, track } of sources()) {
      const named = /^\d\d - (.+)\.jpe?g$/.exec(file)?.[1];
      if (named) expect(titleOf(`/music/${track}.m4a`), file).toBe(named);
    }
  });

  it("every listed file is in public/music/", () => {
    const files = new Set(readdirSync(join(__dirname, "../public/music")));
    for (const t of TRACKS) expect(files.has(t.replace("/music/", "")), t).toBe(true);
  });
});

/** One tick of the player and some. */
const TICK = 60;

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
    expect(player.getState().title).toBe(titleOf(b.src));
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
    expect(player.getState().title).toBe(titleOf(b.src));
    const second = b.src;
    player.skip();
    expect(a.src).not.toBe("");
    expect(a.src).not.toBe(second);
    expect(a.volume).toBeCloseTo(0.4);
    expect(player.getState().title).toBe(titleOf(a.src));
    player.destroy();
  });

  it("on Next the state switches at once to the new track at 0:00, and never runs out the old one across the fade (#580)", () => {
    const { player, a, b } = make({ volume: 0.5 });
    document.dispatchEvent(new Event("click"));
    a.duration = 200;
    a.currentTime = 80;
    vi.advanceTimersByTime(100);
    const first = player.getState();
    // The next track is named ahead (its image can load before Next), and Next goes to that one.
    expect(first.nextTrack).not.toBeNull();
    expect(first.previousTrack).toBeNull();
    const coming = first.nextTrack!;
    const seen: { index: number | null; track: string | null; position: number; duration: number }[] = [];
    const unsubscribe = player.subscribe(() => {
      const s = player.getState();
      seen.push({ index: s.index, track: s.track, position: s.position, duration: s.duration });
    });

    player.skip();
    expect(b.src).toBe(coming);
    // At once, before the fade has run: the new index, title, position 0, the length not known yet.
    expect(player.getState()).toMatchObject({ track: coming, title: titleOf(coming), position: 0, duration: 0, previousTrack: first.track });
    expect(player.getState().index).not.toBe(first.index);
    // Its length as soon as the element knows it, not at the next tick.
    b.duration = 150;
    b.dispatchEvent(new Event("durationchange"));
    expect(player.getState().duration).toBe(150);

    // The fade runs on the old track's clock (its last 2 s); the state follows the new one all along.
    for (const [old, now] of [[198.5, 0.5], [199.5, 1.5]] as const) {
      a.currentTime = old;
      b.currentTime = now;
      vi.advanceTimersByTime(TICK);
      expect(player.getState()).toMatchObject({ track: coming, position: now, duration: 150 });
    }
    a.currentTime = 200;
    b.currentTime = 2;
    vi.advanceTimersByTime(TICK);
    expect(a.paused).toBe(true);
    expect(player.getState()).toMatchObject({ track: coming, position: 2, duration: 150 });

    // The sequence: the old track until Next, then only the new one, from 0, its position never going back.
    const at = seen.findIndex((s) => s.track === coming);
    expect(seen.slice(0, at).every((s) => s.track === first.track)).toBe(true);
    expect(seen.slice(at).every((s) => s.track === coming && s.index === seen[at]!.index)).toBe(true);
    expect(seen[at]).toMatchObject({ position: 0, duration: 0 });
    const positions = seen.slice(at).map((s) => s.position);
    expect(positions).toEqual([...positions].sort((x, y) => x - y));
    expect(seen.slice(at).some((s) => s.duration === 200)).toBe(false);
    unsubscribe();
    player.destroy();
  });

  it("the crossfade at a track's end shows the incoming track from its start", () => {
    const { player, a, b } = make();
    document.dispatchEvent(new Event("click"));
    a.duration = 100;
    a.currentTime = 99;
    vi.advanceTimersByTime(TICK);
    expect(b.paused).toBe(false);
    expect(player.getState()).toMatchObject({ track: b.src, position: 0, duration: 0 });
    player.destroy();
  });

  it("on Previous mid-track the state switches at once too, and names the track it came from as the next", () => {
    const { player, a, b } = make();
    document.dispatchEvent(new Event("click"));
    const first = a.src;
    a.duration = 100;
    a.currentTime = 10;
    player.skip();
    a.currentTime = 100;
    vi.advanceTimersByTime(TICK);
    const second = b.src;
    b.duration = 120;
    b.currentTime = 30;
    player.previous();
    expect(player.getState()).toMatchObject({ track: first, position: 0, previousTrack: null, nextTrack: second });
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

describe("a hidden tab (#712)", () => {
  it("plays on while the tab is hidden, through the crossfade to the next track, and nothing restarts when it shows", () => {
    const { player, a, b } = make();
    document.dispatchEvent(new Event("click"));
    a.duration = 100;
    a.currentTime = 99; // mid-fade: both are playing
    vi.advanceTimersByTime(100);
    expect([a.paused, b.paused]).toEqual([false, false]);

    setHidden(true);
    expect([a.paused, b.paused]).toEqual([false, false]);
    expect(player.getState().playing).toBe(true);
    const incoming = b.src;
    a.currentTime = 100; // the outgoing track runs out, hidden: the fade ends on its clock
    vi.advanceTimersByTime(100);
    expect([a.paused, b.paused]).toEqual([true, false]);
    expect(player.getState()).toMatchObject({ track: incoming, playing: true });

    const plays = b.plays;
    setHidden(false);
    expect(b.plays).toBe(plays);
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

  it("waits for the gesture when the page opens in a hidden tab: being shown is not one", () => {
    setHidden(true);
    const { player, a } = make();
    setHidden(false);
    expect(a.plays).toBe(0);
    document.dispatchEvent(new Event("click"));
    expect(a.plays).toBe(1);
    player.destroy();
  });
});

describe("previous, pause and resume", () => {
  /** Plays the current track's last seconds out: the fade ends on its clock. */
  const finishFade = (out: FakeAudio) => {
    out.currentTime = out.duration;
    vi.advanceTimersByTime(100);
  };

  it("previous goes back through the tracks played, with the crossfade, and next walks forward again", () => {
    const { player, a, b } = make({ volume: 0.5 });
    document.dispatchEvent(new Event("click"));
    const first = a.src;
    a.duration = 100;
    a.currentTime = 10;
    player.skip();
    finishFade(a);
    const second = b.src;
    expect(player.getState().track).toBe(second);

    b.duration = 120;
    b.currentTime = 30;
    player.previous();
    // The fade follows the outgoing clock: jumped to its last seconds, the first track coming in at 0.
    expect(b.currentTime).toBe(120 - CROSSFADE_S);
    expect(a.src).toBe(first);
    expect(a.paused).toBe(false);
    b.currentTime = 119;
    vi.advanceTimersByTime(100);
    expect(a.volume).toBeCloseTo(0.25);
    finishFade(b);
    expect(player.getState()).toMatchObject({ track: first, title: titleOf(first) });
    expect(a.volume).toBeCloseTo(0.5);

    // Forward again: the track that was next, not a new draw.
    a.duration = 100;
    a.currentTime = 5;
    player.skip();
    expect(b.src).toBe(second);
    player.destroy();
  });

  it("cuts instead of fading when the host cannot seek to the track's last seconds", () => {
    const { player, a, b } = make({ volume: 0.4 });
    document.dispatchEvent(new Event("click"));
    a.duration = 100;
    a.currentTime = 10;
    // Only the first 20 s are seekable (a host with no range requests serves none past what it sent).
    (a as unknown as { seekable: TimeRanges }).seekable = { length: 1, start: () => 0, end: () => 20 } as unknown as TimeRanges;
    player.skip();
    expect(a.src).toBe("");
    expect(b.src).not.toBe("");
    expect(b.volume).toBeCloseTo(0.4);
    expect(player.getState().track).toBe(b.src);
    player.destroy();
  });

  it("at the start of the history, previous goes back to the start of the track", () => {
    const { player, a } = make();
    document.dispatchEvent(new Event("click"));
    const first = a.src;
    a.duration = 100;
    a.currentTime = 42;
    player.previous();
    expect(a.currentTime).toBe(0);
    expect(a.src).toBe(first);
    expect(player.getState().playing).toBe(true);
    player.destroy();
  });

  it("does nothing before the first gesture", () => {
    const { player, a, b } = make();
    player.previous();
    player.skip();
    expect(a.src + b.src).toBe("");
    expect(player.getState().track).toBeNull();
    player.destroy();
  });

  it("keeps at most HISTORY tracks to go back through", () => {
    const { player } = make();
    document.dispatchEvent(new Event("click"));
    // No length known: each skip cuts at once.
    for (let i = 0; i < HISTORY + 10; i++) player.skip();
    const seen: (string | null)[] = [player.getState().track];
    for (let i = 0; i < HISTORY + 10; i++) {
      player.previous();
      seen.push(player.getState().track);
    }
    // HISTORY tracks in all: HISTORY - 1 steps back, then the start of the oldest one again and again.
    let steps = 0;
    for (let i = 1; i < seen.length; i++) if (seen[i] !== seen[i - 1]) steps++;
    expect(steps).toBe(HISTORY - 1);
    player.destroy();
  });

  it("pause stops both elements where they are; resume plays on from there", () => {
    const { player, a } = make();
    document.dispatchEvent(new Event("click"));
    a.duration = 100;
    a.currentTime = 30;
    player.pause();
    expect(a.paused).toBe(true);
    expect(player.getState()).toMatchObject({ enabled: false, playing: false });
    vi.advanceTimersByTime(1000);
    player.resume();
    expect(a.paused).toBe(false);
    expect(a.currentTime).toBe(30);
    expect(player.getState()).toMatchObject({ enabled: true, playing: true });
    player.destroy();
  });

  it("while the music is off, next and previous change the track without playing it", () => {
    const { player, a, b } = make({ enabled: false });
    document.dispatchEvent(new Event("click"));
    expect(player.getState().track).toBeNull();
    player.skip();
    const first = player.getState().track;
    expect(first).toMatch(/^\/music\//);
    player.skip();
    const second = player.getState().track;
    expect(second).not.toBe(first);
    player.previous();
    expect(player.getState().track).toBe(first);
    expect(a.plays + b.plays).toBe(0);
    expect(player.getState().playing).toBe(false);
    player.resume();
    expect(player.getState()).toMatchObject({ playing: true, track: first });
    player.destroy();
  });

  it("a pause in the middle of a fade: next then finishes it and moves on", () => {
    const { player, a, b } = make();
    document.dispatchEvent(new Event("click"));
    a.duration = 100;
    a.currentTime = 99;
    vi.advanceTimersByTime(100);
    const incoming = b.src;
    player.pause();
    player.skip();
    expect(player.getState().track).not.toBe(incoming);
    expect(a.plays + b.plays).toBe(2);
    player.destroy();
  });

  it("a pause and a resume while the tab is hidden (the lock screen) hold whatever the tab does next", () => {
    const { player, a } = make();
    document.dispatchEvent(new Event("click"));
    setHidden(true);
    player.pause();
    expect(a.paused).toBe(true);
    setHidden(false);
    expect(a.paused).toBe(true);
    setHidden(true);
    player.resume();
    expect(a.paused).toBe(false);
    expect(player.getState().playing).toBe(true);
    setHidden(false);
    setHidden(true);
    expect(a.paused).toBe(false);
    player.destroy();
  });

  it("reads as loading while the track waits for its data", () => {
    const { player, a } = make();
    document.dispatchEvent(new Event("click"));
    a.readyState = 1;
    a.dispatchEvent(new Event("waiting"));
    expect(player.getState().loading).toBe(true);
    a.readyState = 4;
    a.dispatchEvent(new Event("canplay"));
    expect(player.getState().loading).toBe(false);
    player.pause();
    a.readyState = 1;
    a.dispatchEvent(new Event("waiting"));
    expect(player.getState().loading).toBe(false);
    player.destroy();
  });
});

describe("the Media Session", () => {
  function fakeSession() {
    const handlers = new Map<string, (() => void) | null>();
    const positions: MediaPositionState[] = [];
    const session: SessionLike = {
      metadata: null,
      playbackState: "none",
      setActionHandler: (action, h) => void handlers.set(action, h),
      setPositionState: (p) => void positions.push(p!),
    };
    return { session, handlers, positions };
  }

  it("shows the track's title, the album and its image, and the state", () => {
    const { player, a } = make();
    const { session, positions } = fakeSession();
    const unbind = bindMediaSession(player, { session, createMetadata: (init) => init as MediaMetadata, onPlay: () => {}, onPause: () => {} });
    expect(session.playbackState).toBe("none");
    document.dispatchEvent(new Event("click"));
    const track = player.getState().track!;
    const meta = session.metadata as unknown as MediaMetadataInit;
    expect(meta.title).toBe(titleOf(track));
    expect(meta.album).toBe(ALBUM);
    expect(meta.artwork).toEqual(ART_SIZES.map((size) => ({ src: artOf(track, size), sizes: `${size}x${size}`, type: "image/webp" })));
    expect(session.playbackState).toBe("playing");
    a.duration = 180;
    a.currentTime = 12;
    vi.advanceTimersByTime(100);
    expect(positions.at(-1)).toEqual({ duration: 180, position: 12, playbackRate: 1 });
    player.pause();
    expect(session.playbackState).toBe("paused");
    unbind();
    expect(session.metadata).toBeNull();
    player.destroy();
  });

  it("sends the position again when it jumps: Previous at the start of the history restarts the track", () => {
    const { player, a } = make();
    const { session, positions } = fakeSession();
    let ms = 0;
    const unbind = bindMediaSession(player, { session, createMetadata: (init) => init as MediaMetadata, onPlay: () => {}, onPause: () => {}, now: () => ms });
    document.dispatchEvent(new Event("click"));
    a.duration = 180;
    vi.advanceTimersByTime(100);
    const before = positions.length;
    // Six seconds played, as the OS's clock counts them too: nothing to send.
    for (let i = 1; i <= 60; i++) {
      ms += 100;
      a.currentTime = i / 10;
      vi.advanceTimersByTime(100);
    }
    expect(positions.length).toBe(before);
    player.previous();
    expect(a.currentTime).toBe(0);
    expect(positions.length).toBe(before + 1);
    expect(positions.at(-1)).toEqual({ duration: 180, position: 0, playbackRate: 1 });
    unbind();
    player.destroy();
  });

  it("its actions: play and pause go to the app, previous and next to the player; unbinding clears them", () => {
    const { player } = make();
    const { session, handlers } = fakeSession();
    const onPlay = vi.fn();
    const onPause = vi.fn();
    const unbind = bindMediaSession(player, { session, createMetadata: (init) => init as MediaMetadata, onPlay, onPause });
    expect([...handlers.keys()].sort()).toEqual(["nexttrack", "pause", "play", "previoustrack"]);
    document.dispatchEvent(new Event("click"));
    const first = player.getState().track;
    handlers.get("nexttrack")!();
    const second = player.getState().track;
    expect(second).not.toBe(first);
    expect((session.metadata as unknown as MediaMetadataInit).title).toBe(titleOf(second!));
    handlers.get("previoustrack")!();
    expect(player.getState().track).toBe(first);
    handlers.get("pause")!();
    handlers.get("play")!();
    expect([onPause.mock.calls.length, onPlay.mock.calls.length]).toEqual([1, 1]);
    unbind();
    expect([...handlers.values()].every((h) => h === null)).toBe(true);
    player.destroy();
  });

  it("switches the metadata and the position on Next, with the card, before the fade ends (#580)", () => {
    const { player, a, b } = make();
    const { session, positions } = fakeSession();
    const unbind = bindMediaSession(player, { session, createMetadata: (init) => init as MediaMetadata, onPlay: () => {}, onPause: () => {} });
    document.dispatchEvent(new Event("click"));
    a.duration = 180;
    a.currentTime = 60;
    vi.advanceTimersByTime(TICK);
    player.skip();
    expect((session.metadata as unknown as MediaMetadataInit).title).toBe(titleOf(b.src));
    b.duration = 140;
    b.dispatchEvent(new Event("durationchange"));
    expect(positions.at(-1)).toEqual({ duration: 140, position: 0, playbackRate: 1 });
    expect(a.paused).toBe(false);
    unbind();
    player.destroy();
  });

  it("does nothing where the browser has no session", () => {
    const { player } = make();
    expect(() => bindMediaSession(player, { session: null, onPlay: () => {}, onPause: () => {} })()).not.toThrow();
    player.destroy();
  });
});

describe("the images", () => {
  const PUBLIC = join(__dirname, "../public");
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));

  it("ships no original: the sources are in music-sources/, public/ has only the WebP copies", () => {
    expect(readdirSync(join(PUBLIC, "music")).filter((n) => !n.endsWith(".m4a"))).toEqual([]);
    expect(sources()).toHaveLength(TRACK_LIST.length);
    for (const f of walk(PUBLIC)) expect(f.replace(PUBLIC, ""), "a URL-safe name").toMatch(/^[\w/.@-]+$/);
    for (const f of walk(join(PUBLIC, "music-art"))) expect(f).toMatch(/\.webp$/);
  });

  it("has a square WebP of each track at each size, named after the track, and small", () => {
    const art = join(PUBLIC, "music-art");
    const files = walk(art).map((f) => f.replace(`${art}/`, "")).sort();
    expect(files).toEqual(expected());
    const totals = new Map<number, number>();
    for (const f of files) {
      const size = Number(f.split("/")[0]);
      const bytes = readFileSync(join(art, f));
      expect(webpSize(bytes), f).toEqual({ width: size, height: size });
      totals.set(size, (totals.get(size) ?? 0) + bytes.length);
    }
    // The thumbnails stay small: about 4 KiB each at 128 px, 37 KiB at 512 px (measured 65 and 589 KiB in all).
    expect(totals.get(128)!).toBeLessThan(96 * 1024);
    expect(totals.get(512)!).toBeLessThan(800 * 1024);
    for (const t of TRACKS) for (const size of ART_SIZES) expect(files).toContain(artOf(t, size)!.replace("/music-art/", ""));
    expect(artOf("/music/99-unknown.m4a", 128)).toBeNull();
  });

  it("reads the size of a source JPEG and PNG", () => {
    const dir = join(__dirname, "../music-sources");
    expect(imageSize(readFileSync(join(dir, "00-endless-kingdom.png")))).toEqual({ width: 1254, height: 1254 });
    expect(imageSize(readFileSync(join(dir, "02 - Fields of Morning Mist.jpeg")))).toEqual({ width: 1152, height: 864 });
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
      <AudioProvider musicVolume={0.4} sfxVolume={0.7}>
        <Probe />
      </AudioProvider>,
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

  it("pause and resume set the music volume (0, then the level before), at once on the engine", async () => {
    vi.useRealTimers();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    const created = vi.spyOn(document, "createElement");
    const onMusicVolumeChange = vi.fn();
    function Buttons() {
      const m = useMusic();
      return (
        <>
          <button onClick={m.pause}>pause</button>
          <button onClick={m.resume}>resume</button>
          <span data-testid="enabled">{String(m.enabled)}</span>
        </>
      );
    }
    render(
      <AudioProvider musicVolume={0.4} musicBefore={0.6} sfxVolume={0.7} onMusicVolumeChange={onMusicVolumeChange}>
        <Buttons />
      </AudioProvider>,
    );
    await waitFor(() => expect(created.mock.calls.filter(([tag]) => tag === "audio")).toHaveLength(2));
    await userEvent.click(screen.getByText("pause"));
    expect(onMusicVolumeChange).toHaveBeenLastCalledWith(0);
    await waitFor(() => expect(screen.getByTestId("enabled")).toHaveTextContent("false"));
    await userEvent.click(screen.getByText("resume"));
    expect(onMusicVolumeChange).toHaveBeenLastCalledWith(0.6);
    await waitFor(() => expect(screen.getByTestId("enabled")).toHaveTextContent("true"));
    vi.restoreAllMocks();
  });
});

describe("the MusicPlayer card", () => {
  const props = { track: "/music/03-market-day.m4a", title: "Market Day", art: "/music-art/128/03-market-day.webp", position: 65, duration: 183, enabled: true, unlocked: true, playing: true, loading: false };

  it("shows the thumbnail, the title, the time, and reports Previous, Pause and Next with 44 px targets", async () => {
    vi.useRealTimers();
    const on = { onPrevious: vi.fn(), onNext: vi.fn(), onPlay: vi.fn(), onPause: vi.fn() };
    render(<MusicPlayer {...props} {...on} />);
    expect(screen.getByTestId("music-title")).toHaveTextContent("Market Day");
    expect(screen.getByTestId("music-status")).toHaveTextContent("Now playing");
    expect(screen.getByTestId("music-position")).toHaveTextContent("1:05");
    expect(screen.getByTestId("music-duration")).toHaveTextContent("3:03");
    expect(screen.getByRole("progressbar", { name: "Track progress" })).toHaveAttribute("aria-valuenow", "36");
    const img = screen.getByTestId("music-thumbnail").querySelector("img")!;
    expect(img.getAttribute("src")).toBe(props.art);
    expect(img.getAttribute("loading")).toBe("lazy");
    for (const name of ["Previous track", "Pause music", "Next track"]) expect(screen.getByRole("button", { name }).className).toContain("size-11");
    await userEvent.click(screen.getByRole("button", { name: "Previous track" }));
    await userEvent.click(screen.getByRole("button", { name: "Pause music" }));
    await userEvent.click(screen.getByRole("button", { name: "Next track" }));
    expect([on.onPrevious, on.onPause, on.onNext].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
    expect(on.onPlay).not.toHaveBeenCalled();
    // No volume of its own: the Music slider of the settings is that.
    expect(screen.queryByRole("slider")).toBeNull();
    expect(formatTime(0)).toBe("0:00");
  });

  it("muted: Play turns the music on, and Previous and Next still work", async () => {
    vi.useRealTimers();
    const on = { onPrevious: vi.fn(), onNext: vi.fn(), onPlay: vi.fn() };
    render(<MusicPlayer {...props} enabled={false} playing={false} {...on} />);
    expect(screen.getByTestId("music-status")).toHaveTextContent("Music muted");
    await userEvent.click(screen.getByRole("button", { name: "Play music" }));
    await userEvent.click(screen.getByRole("button", { name: "Next track" }));
    await userEvent.click(screen.getByRole("button", { name: "Previous track" }));
    expect([on.onPlay, on.onNext, on.onPrevious].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it("before the first gesture: 'Tap play to start', a placeholder, Previous and Next off", () => {
    vi.useRealTimers();
    render(<MusicPlayer {...props} track={null} title={null} art={null} unlocked={false} playing={false} position={0} duration={0} />);
    expect(screen.getByTestId("music-status")).toHaveTextContent("Tap play to start");
    expect(screen.getByTestId("music-thumbnail")).toHaveAttribute("data-state", "placeholder");
    expect(screen.getByTestId("music-duration")).toHaveTextContent("--:--");
    expect(screen.getByRole("button", { name: "Play music" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Previous track" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next track" })).toBeDisabled();
  });

  it("the first press plays, though the press itself unlocks the audio and Play turns into Pause before the click", () => {
    vi.useRealTimers();
    const on = { onPlay: vi.fn(), onPause: vi.fn() };
    const { rerender } = render(<MusicPlayer {...props} unlocked={false} playing={false} {...on} />);
    const button = screen.getByRole("button", { name: "Play music" });
    fireEvent.pointerDown(button);
    rerender(<MusicPlayer {...props} {...on} />);
    expect(button).toHaveAccessibleName("Pause music");
    fireEvent.click(button);
    expect([on.onPlay.mock.calls.length, on.onPause.mock.calls.length]).toEqual([1, 0]);
    // The next press reads the button as it is now.
    fireEvent.pointerDown(button);
    fireEvent.click(button);
    expect(on.onPause).toHaveBeenCalledTimes(1);
  });

  it("an image that fails turns into the placeholder; the next track tries its own", () => {
    vi.useRealTimers();
    const { rerender } = render(<MusicPlayer {...props} />);
    fireEvent.error(screen.getByTestId("music-thumbnail").querySelector("img")!);
    expect(screen.getByTestId("music-thumbnail")).toHaveAttribute("data-state", "placeholder");
    rerender(<MusicPlayer {...props} track="/music/08-harvest-dance.m4a" art="/music-art/128/08-harvest-dance.webp" />);
    expect(screen.getByTestId("music-thumbnail")).toHaveAttribute("data-state", "image");
  });

  it("keeps the placeholder under the image: a new track's image not loaded yet never shows the old one", () => {
    vi.useRealTimers();
    const { rerender } = render(<MusicPlayer {...props} />);
    const thumb = screen.getByTestId("music-thumbnail");
    expect(thumb.querySelector("svg, i, [data-icon]")).not.toBeNull();
    const old = thumb.querySelector("img")!;
    rerender(<MusicPlayer {...props} track="/music/08-harvest-dance.m4a" title="Harvest Dance" art="/music-art/128/08-harvest-dance.webp" position={0} duration={0} />);
    const img = thumb.querySelector("img")!;
    expect(img).not.toBe(old);
    expect(img.getAttribute("src")).toBe("/music-art/128/08-harvest-dance.webp");
    expect(screen.getByTestId("music-position")).toHaveTextContent("0:00");
    expect(screen.getByRole("progressbar", { name: "Track progress" })).toHaveAttribute("aria-valuenow", "0");
  });

  it("loads the images of the next and previous tracks ahead", () => {
    vi.useRealTimers();
    const made: string[] = [];
    const Real = globalThis.Image;
    globalThis.Image = class {
      decoding = "";
      set src(v: string) {
        made.push(v);
      }
    } as unknown as typeof Image;
    try {
      const { rerender } = renderHook(({ srcs }) => usePreloadedArt(srcs), { initialProps: { srcs: ["/music-art/128/03-market-day.webp", null] as (string | null)[] } });
      expect(made).toEqual(["/music-art/128/03-market-day.webp"]);
      rerender({ srcs: ["/music-art/128/03-market-day.webp", null] });
      expect(made).toHaveLength(1);
      rerender({ srcs: ["/music-art/128/08-harvest-dance.webp", "/music-art/128/03-market-day.webp"] });
      expect(made.slice(1)).toEqual(["/music-art/128/08-harvest-dance.webp", "/music-art/128/03-market-day.webp"]);
    } finally {
      globalThis.Image = Real;
    }
  });

  it("names each state", () => {
    const base = { enabled: true, unlocked: true, playing: false, loading: false, track: "/music/03-market-day.m4a" };
    expect(musicStatus({ ...base, loading: true })).toBe("Loading…");
    expect(musicStatus({ ...base, playing: true })).toBe("Now playing");
    expect(musicStatus(base)).toBe("Paused");
    expect(musicStatus({ ...base, enabled: false })).toBe("Music muted");
    expect(musicStatus({ ...base, unlocked: false })).toBe("Tap play to start");
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

  it("imports no image of the music (a thumbnail or an original) anywhere in the source", () => {
    for (const f of files(SRC).filter((f) => /\.(tsx?|css)$/.test(f))) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/\b(import|from|require|new URL)\s*\(?\s*["'`][^"'`]*(music-art|asset-sources\/music)[^"'`]*/);
      expect(text, f).not.toMatch(/url\(\s*["']?[^)]*music-art/);
    }
    const naming = files(SRC).filter((f) => readFileSync(f, "utf8").includes('"/music-art"'));
    expect(naming.map((f) => f.replace(SRC, ""))).toEqual(["/lib/music/track-info.ts"]);
  });

  it("names the tracks by URL only, in one file", () => {
    const naming = files(SRC).filter((f) => /\.m4a/.test(readFileSync(f, "utf8")));
    expect(naming.map((f) => f.replace(SRC, ""))).toEqual(expect.arrayContaining(["/lib/music/tracks.ts"]));
  });
});
