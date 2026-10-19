import { titleOf } from "./track-info";
import { createShuffle } from "./tracks";

// The music player (P-81), without React: a playlist streamed by two `<audio>` elements that crossfade, paused while the tab
// is hidden, and silent until the first user gesture. The levels (the fade, the volume) are written through `route`: by default
// the element's own `volume`; the audio engine (`lib/audio/engine.ts`) routes each element into a Web Audio `GainNode`, because
// iOS Safari keeps `volume` at 1 on a media element and a slider would do nothing there.
//
// The tracks played make a history (#569): `previous()` goes back through it and `skip()` forward again before it draws a new
// track from the shuffle, both with the crossfade. `pause()` and `resume()` are the setting (music off or on); the app keeps it
// (`AudioProvider`: a pause mutes the music volume, remembered after a reload).

/** The crossfade between two tracks, in seconds: the next one starts this long before the current one ends. */
export const CROSSFADE_S = 2;
/** How often the fade and the readout are updated, in ms, while playing. */
const TICK_MS = 50;
/** The events that count as the first gesture: autoplay rules accept these (not `pointermove`, not `scroll`). */
const GESTURES = ["pointerdown", "keydown", "touchend", "click"] as const;
/** The tracks `previous()` can go back through. */
export const HISTORY = 50;
/** `HTMLMediaElement.HAVE_FUTURE_DATA`: enough is loaded to play on. */
const HAVE_FUTURE_DATA = 3;

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
  /** Its URL, and its title (the album's, `titleOf`). */
  track: string | null;
  title: string | null;
  /** The track should be playing but is waiting for its data (a new track, a slow network). */
  loading: boolean;
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
  /** Takes over an element's level: returns the function that sets it (0 to 1). Default: the element's `volume`. */
  route?: (a: HTMLAudioElement) => (level: number) => void;
}

export interface MusicPlayer {
  getState(): MusicState;
  subscribe(listener: () => void): () => void;
  setEnabled(enabled: boolean): void;
  setVolume(volume: number): void;
  /**
   * Go to the next track now, with the crossfade: forward through the history after a `previous()`, else a new one from the
   * shuffle. While the music is off, it changes the track without playing it.
   */
  skip(): void;
  /** Back to the track played before, with the crossfade; at the start of the history, the start of the current track. */
  previous(): void;
  /** The setting off: both elements pause where they are. */
  pause(): void;
  /**
   * The setting on: the track plays on from where it paused. `hidden`: it plays even while the tab is hidden, until the tab is
   * shown or hidden again (a play from the lock screen, where the page is hidden).
   */
  resume(options?: { hidden?: boolean }): void;
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
  const shuffle = createShuffle(tracks.length, options.random);
  // The tracks played, oldest first, and the one heard (or coming in): `skip` after `previous` walks forward again.
  const history: number[] = [];
  let at = -1;
  const forward = (): number => {
    if (at < history.length - 1) return history[++at]!;
    history.push(shuffle());
    if (history.length > HISTORY) history.shift();
    at = history.length - 1;
    return history[at]!;
  };
  const back = (): number | null => (at > 0 ? history[--at]! : null);

  // `preload="none"`, no `src`: nothing is requested until the first gesture says so.
  const elements = [make(), make()] as const;
  const setters = elements.map((a) => options.route?.(a) ?? ((v: number) => void (a.volume = v)));
  const levels = [0, 0];
  const setLevel = (a: HTMLAudioElement, v: number) => {
    const i = elements.indexOf(a);
    levels[i] = v;
    setters[i]!(v);
  };
  const levelOf = (a: HTMLAudioElement) => levels[elements.indexOf(a)]!;
  for (const a of elements) {
    a.preload = "none";
    a.loop = false;
    setLevel(a, 0);
  }

  let enabled = options.enabled;
  let volume = clamp01(options.volume);
  let unlocked = false;
  let hidden = doc.visibilityState === "hidden";
  let held = false; // a play asked for while the tab is hidden (the lock screen): it holds until the tab changes again
  let current = 0; // the element that carries the track being heard
  let fading = false; // the other element is in, `current` is going out
  let pendingIndex: number | null = null; // the track coming in
  let index: number | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<() => void>();
  let snapshot: MusicState | null = null;

  const cur = () => elements[current]!;
  const other = () => elements[1 - current]!;
  const wants = () => enabled && unlocked && (!hidden || held) && tracks.length > 0;
  // Whether the element can jump to `t`; one with no `seekable` (a test's) can.
  const seekable = (a: HTMLAudioElement, t: number) => {
    const r = a.seekable as TimeRanges | undefined;
    if (!r) return true;
    for (let k = 0; k < r.length; k++) if (r.start(k) <= t && t <= r.end(k)) return true;
    return false;
  };
  // An element with no `readyState` (a test's) reads as ready.
  const waiting = (a: HTMLAudioElement) => a.readyState < HAVE_FUTURE_DATA;

  const read = (): MusicState => {
    const a = cur();
    return {
      enabled,
      volume,
      unlocked,
      playing: index !== null && wants() && !a.paused,
      index,
      track: index === null ? null : tracks[index]!,
      title: index === null ? null : titleOf(tracks[index]!),
      loading: index !== null && wants() && waiting(a),
      position: index === null ? 0 : a.currentTime || 0,
      duration: index === null || !Number.isFinite(a.duration) ? 0 : a.duration,
    };
  };
  const emit = () => {
    const s = read();
    // A new object only when something changed, as `useSyncExternalStore` needs; the position moves in whole 1/10 s.
    const p = snapshot;
    if (p && p.enabled === s.enabled && p.volume === s.volume && p.unlocked === s.unlocked && p.playing === s.playing && p.index === s.index && p.loading === s.loading && Math.floor(p.position * 10) === Math.floor(s.position * 10) && p.duration === s.duration) return;
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
      index = forward();
      load(cur(), index);
    }
    setLevel(cur(), fading ? levelOf(cur()) : volume);
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

  // Begins track `i` on the idle element at volume 0; the fade in `tick` raises it as the current one falls.
  const crossfade = (i: number) => {
    if (fading || tracks.length === 0) return;
    const a = other();
    load(a, i);
    setLevel(a, 0);
    fading = true;
    if (wants()) play(a);
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
    setLevel(cur(), volume);
  };

  // Track `i` at once, no fade: when there is no clock to fade on (the length not loaded yet) or nothing sounds (music off).
  const cut = (i: number) => {
    if (fading) finishFade();
    crossfade(i);
    finishFade();
    if (wants()) start();
  };

  // Track `i` now: a fade on the current track's clock, jumped to its last CROSSFADE_S seconds; a cut when it cannot fade (no
  // length known yet, or a host that cannot seek there: the fade would wait for the track's real end).
  const goTo = (i: number) => {
    const a = cur();
    const target = Math.max(a.currentTime, a.duration - CROSSFADE_S);
    if (!wants() || index === null || !Number.isFinite(a.duration) || a.duration <= 0 || !seekable(a, target)) {
      cut(i);
      return;
    }
    if (a.duration > CROSSFADE_S) a.currentTime = target;
    crossfade(i);
  };

  function tick() {
    const a = cur();
    if (!wants() || (a.paused && !fading)) {
      emit();
      return;
    }
    const left = (Number.isFinite(a.duration) && a.duration > 0 ? a.duration : Infinity) - a.currentTime;
    if (!fading && left <= CROSSFADE_S) crossfade(forward());
    if (fading) {
      // The fade follows the outgoing track's own clock, so a pause (a hidden tab) cannot desynchronise it.
      const t = clamp01(1 - left / CROSSFADE_S);
      if (a.ended || left <= 0) finishFade();
      else {
        setLevel(a, volume * (1 - t));
        setLevel(other(), volume * t);
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
    held = false;
    apply();
  };
  const onEnded = () => {
    // A track that ended with no fade (the length was unknown): the next one starts at once.
    if (!fading && wants()) {
      cut(forward());
      emit();
    }
  };
  // The data arriving or running out changes `loading` at once, not at the next tick.
  const onReady = () => emit();
  const READY = ["waiting", "canplay", "playing"] as const;

  for (const g of GESTURES) doc.addEventListener(g, onGesture, true);
  doc.addEventListener("visibilitychange", onVisibility);
  for (const a of elements) {
    a.addEventListener("ended", onEnded);
    for (const e of READY) a.addEventListener(e, onReady);
  }

  const setEnabled = (v: boolean) => {
    if (enabled === v) return;
    enabled = v;
    if (!v) held = false;
    apply();
  };

  return {
    getState: () => (snapshot ??= read()),
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    setEnabled,
    setVolume(v) {
      volume = clamp01(v);
      if (!fading) setLevel(cur(), volume);
      emit();
    },
    skip() {
      // Before the first gesture there is no track to move from; mid-fade, the incoming track is already the next one (a
      // fade halted by a pause is finished first).
      if (!unlocked || tracks.length === 0 || (fading && wants())) return;
      if (fading) finishFade();
      goTo(forward());
      emit();
    },
    previous() {
      if (!unlocked || index === null || (fading && wants())) return;
      if (fading) finishFade();
      const i = back();
      if (i === null) cur().currentTime = 0;
      else goTo(i);
      emit();
    },
    pause: () => setEnabled(false),
    resume(options) {
      if (options?.hidden && hidden) held = true;
      if (enabled) apply();
      else setEnabled(true);
    },
    elements,
    destroy() {
      halt();
      for (const g of GESTURES) doc.removeEventListener(g, onGesture, true);
      doc.removeEventListener("visibilitychange", onVisibility);
      for (const a of elements) {
        a.removeEventListener("ended", onEnded);
        for (const e of READY) a.removeEventListener(e, onReady);
        a.removeAttribute("src");
      }
      listeners.clear();
    },
  };
}
