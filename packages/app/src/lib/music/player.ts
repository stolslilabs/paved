import { createShuffle, trackTitle } from "./tracks";

// The music player (P-81), without React: a playlist streamed by two `<audio>` elements that crossfade, paused while the tab
// is hidden, and silent until the first user gesture. Two elements and their `volume`, no Web Audio graph: the fade needs
// nothing more. (iOS Safari keeps `volume` at 1 on a media element: there the fade is a cut and the volume slider has no
// effect; a Web Audio graph would fix both and is not worth its weight until that is asked for.)

/** The crossfade between two tracks, in seconds: the next one starts this long before the current one ends. */
export const CROSSFADE_S = 2;
/** How often the fade and the readout are updated, in ms, while playing. */
const TICK_MS = 50;
/** The events that count as the first gesture: autoplay rules accept these (not `pointermove`, not `scroll`). */
const GESTURES = ["pointerdown", "keydown", "touchend", "click"] as const;

export interface MusicState {
  /** The setting: music on or off. */
  enabled: boolean;
  /** 0 to 1, the setting. */
  volume: number;
  /** A gesture has happened: the player may load and play. */
  unlocked: boolean;
  /** A track is playing (not paused by the tab being hidden, not off, not waiting for the gesture). */
  playing: boolean;
  /** The playlist's index of the track playing, null before the first. */
  index: number | null;
  /** Its title, from its file name. */
  title: string | null;
  /** Seconds played and the track's length (0 until known). */
  position: number;
  duration: number;
}

export interface MusicOptions {
  tracks: readonly string[];
  enabled: boolean;
  volume: number;
  /** For the tests. */
  random?: () => number;
  doc?: Document;
  createAudio?: () => HTMLAudioElement;
}

export interface MusicPlayer {
  getState(): MusicState;
  subscribe(listener: () => void): () => void;
  setEnabled(enabled: boolean): void;
  setVolume(volume: number): void;
  /** Go to the next track now, with the crossfade. */
  skip(): void;
  /** The two elements, for the tests. */
  elements: readonly [HTMLAudioElement, HTMLAudioElement];
  /** Stop listening and release both elements. */
  destroy(): void;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export function createMusicPlayer(options: MusicOptions): MusicPlayer {
  const doc = options.doc ?? document;
  const make =
    options.createAudio ??
    (() => {
      const a = doc.createElement("audio");
      return a;
    });
  const tracks = options.tracks;
  const next = createShuffle(tracks.length, options.random);

  // `preload="none"`, no `src`: nothing is requested until the first gesture says so.
  const elements = [make(), make()] as const;
  for (const a of elements) {
    a.preload = "none";
    a.loop = false;
    a.volume = 0;
  }

  let enabled = options.enabled;
  let volume = clamp01(options.volume);
  let unlocked = false;
  let hidden = doc.visibilityState === "hidden";
  let current = 0; // the element that carries the track being heard
  let fading = false; // the other element is in, `current` is going out
  let pendingIndex: number | null = null; // the track coming in
  let index: number | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<() => void>();
  let snapshot: MusicState | null = null;

  const cur = () => elements[current]!;
  const other = () => elements[1 - current]!;
  const wants = () => enabled && unlocked && !hidden && tracks.length > 0;

  const read = (): MusicState => {
    const a = cur();
    return {
      enabled,
      volume,
      unlocked,
      playing: index !== null && wants() && !a.paused,
      index,
      title: index === null ? null : trackTitle(tracks[index]!),
      position: index === null ? 0 : a.currentTime || 0,
      duration: index === null || !Number.isFinite(a.duration) ? 0 : a.duration,
    };
  };
  const emit = () => {
    const s = read();
    // A new object only when something changed, as `useSyncExternalStore` needs; the position moves in whole 1/10 s.
    const p = snapshot;
    if (p && p.enabled === s.enabled && p.volume === s.volume && p.unlocked === s.unlocked && p.playing === s.playing && p.index === s.index && Math.floor(p.position * 10) === Math.floor(s.position * 10) && p.duration === s.duration) return;
    snapshot = s;
    listeners.forEach((l) => l());
  };

  const play = (a: HTMLAudioElement) => {
    // `play()` rejects when the browser refuses (no gesture yet, a changed source): the state says "not playing" then.
    void Promise.resolve(a.play()).catch(() => emit());
  };

  const load = (a: HTMLAudioElement, i: number) => {
    a.src = tracks[i]!;
    a.currentTime = 0;
  };

  const start = () => {
    if (index === null) {
      index = next();
      load(cur(), index);
    }
    cur().volume = fading ? cur().volume : volume;
    play(cur());
    if (fading) play(other());
    tick();
    if (!timer) timer = setInterval(tick, TICK_MS);
  };

  const halt = () => {
    for (const a of elements) a.pause();
    if (timer) clearInterval(timer);
    timer = null;
  };

  // Begins the next track on the idle element at volume 0; the fade in `tick` raises it as the current one falls.
  const crossfade = () => {
    if (fading || tracks.length === 0) return;
    const i = next();
    const a = other();
    load(a, i);
    a.volume = 0;
    fading = true;
    play(a);
    pendingIndex = i;
  };

  const finishFade = () => {
    const old = cur();
    old.pause();
    old.removeAttribute("src");
    old.load();
    current = 1 - current;
    index = pendingIndex;
    pendingIndex = null;
    fading = false;
    cur().volume = volume;
  };

  function tick() {
    const a = cur();
    if (!wants() || (a.paused && !fading)) {
      emit();
      return;
    }
    const left = (Number.isFinite(a.duration) && a.duration > 0 ? a.duration : Infinity) - a.currentTime;
    if (!fading && left <= CROSSFADE_S) crossfade();
    if (fading) {
      // The fade follows the outgoing track's own clock, so a pause (a hidden tab) cannot desynchronise it.
      const t = clamp01(1 - left / CROSSFADE_S);
      if (a.ended || left <= 0) finishFade();
      else {
        a.volume = volume * (1 - t);
        other().volume = volume * t;
      }
    }
    emit();
  }

  const apply = () => {
    if (!wants()) {
      halt();
      emit();
      return;
    }
    start();
    emit();
  };

  const onGesture = () => {
    if (unlocked) return;
    unlocked = true;
    for (const g of GESTURES) doc.removeEventListener(g, onGesture, true);
    apply();
  };
  const onVisibility = () => {
    hidden = doc.visibilityState === "hidden";
    apply();
  };
  const onEnded = () => {
    // A track that ended with no fade (the length was unknown): the next one starts at once.
    if (!fading && wants()) {
      crossfade();
      finishFade();
      start();
      emit();
    }
  };

  for (const g of GESTURES) doc.addEventListener(g, onGesture, true);
  doc.addEventListener("visibilitychange", onVisibility);
  for (const a of elements) a.addEventListener("ended", onEnded);

  return {
    getState: () => (snapshot ??= read()),
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    setEnabled(v) {
      if (enabled === v) return;
      enabled = v;
      apply();
    },
    setVolume(v) {
      volume = clamp01(v);
      if (!fading) cur().volume = volume;
      emit();
    },
    skip() {
      if (!wants() || index === null || fading) return;
      // The fade follows the outgoing track's clock: jump it to the last CROSSFADE_S seconds.
      const a = cur();
      if (Number.isFinite(a.duration) && a.duration > CROSSFADE_S) a.currentTime = Math.max(a.currentTime, a.duration - CROSSFADE_S);
      crossfade();
      emit();
    },
    elements,
    destroy() {
      halt();
      for (const g of GESTURES) doc.removeEventListener(g, onGesture, true);
      doc.removeEventListener("visibilitychange", onVisibility);
      for (const a of elements) {
        a.removeEventListener("ended", onEnded);
        a.removeAttribute("src");
      }
      listeners.clear();
    },
  };
}
