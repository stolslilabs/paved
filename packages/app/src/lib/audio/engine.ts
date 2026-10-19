import { createMusicPlayer, type MusicPlayer } from "../music/player";
export { bindMediaSession } from "../music/media-session";
import { SFX_NAMES, sfxUrl, type SfxName } from "./sfx";

// The audio engine (AUDIO-SETTINGS, #541), without React, in its own chunk: one Web Audio graph,
//
//   music <audio> x2 -> element gain (the crossfade) -> music gain -+
//   sound effect buffers -> sfx gain -------------------------------+-> master -> destination
//
// A Web Audio gain is what makes a volume slider work on an iPhone, where `HTMLMediaElement.volume` is ignored. The context
// starts on the first user gesture (autoplay rules) and again after an interruption; it is suspended while the tab is hidden.
// The sound effects are fetched and decoded after that first gesture, not before.
//
// The iPhone's silent switch: Safari treats Web Audio like a ringtone, so with the switch on, the page is mute. Where
// `navigator.audioSession` exists (Safari 16.4+) the engine sets its type to "playback", which plays through the switch:
// the two sliders are then the only volume controls. Older Safari stays muted by the switch.

const GESTURES = ["pointerdown", "keydown", "touchend", "click"] as const;
/** The fade of a gain change, in seconds: long enough not to click, short enough to feel direct. */
const SMOOTH_S = 0.03;
/** A sound is not started again within this many ms of its last start (a double tap, an event twice). */
const MIN_GAP_MS = 40;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export interface AudioEngineOptions {
  tracks: readonly string[];
  musicVolume: number;
  sfxVolume: number;
  /** For the tests. */
  random?: () => number;
  doc?: Document;
  createContext?: () => AudioContext;
  createAudio?: () => HTMLAudioElement;
  fetchSound?: (url: string) => Promise<ArrayBuffer>;
}

export interface AudioEngine {
  music: MusicPlayer;
  setMusicVolume(v: number): void;
  setSfxVolume(v: number): void;
  /** Play a sound effect now; nothing while it is muted, before the first gesture, or before its file has loaded. */
  play(name: SfxName): void;
  /** The names whose files are decoded, for the tests. */
  loaded(): SfxName[];
  destroy(): void;
}

const defaultContext = (): AudioContext => {
  const w = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctx = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctx) throw new Error("no Web Audio");
  return new Ctx();
};

const defaultFetch = async (url: string): Promise<ArrayBuffer> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.arrayBuffer();
};

/** No Web Audio in this browser: the music alone, on the elements' own `volume`, and no sound effects. */
function createMusicOnly(options: AudioEngineOptions): AudioEngine {
  const music = createMusicPlayer({ tracks: options.tracks, enabled: options.musicVolume > 0, volume: options.musicVolume, random: options.random, doc: options.doc, createAudio: options.createAudio });
  return {
    music,
    setMusicVolume(v) {
      music.setVolume(clamp01(v));
      music.setEnabled(clamp01(v) > 0);
    },
    setSfxVolume() {},
    play() {},
    loaded: () => [],
    destroy: () => music.destroy(),
  };
}

export function createAudioEngine(options: AudioEngineOptions): AudioEngine {
  const doc = options.doc ?? document;
  let ctx: AudioContext;
  try {
    ctx = (options.createContext ?? defaultContext)();
  } catch {
    return createMusicOnly(options);
  }
  const fetchSound = options.fetchSound ?? defaultFetch;
  const session = (globalThis.navigator as unknown as { audioSession?: { type: string } } | undefined)?.audioSession;
  if (session) session.type = "playback";

  const master = ctx.createGain();
  const musicGain = ctx.createGain();
  const sfxGain = ctx.createGain();
  musicGain.connect(master);
  sfxGain.connect(master);
  master.connect(ctx.destination);

  let musicVolume = clamp01(options.musicVolume);
  let sfxVolume = clamp01(options.sfxVolume);
  const ramp = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, ctx.currentTime, SMOOTH_S);
  musicGain.gain.value = musicVolume;
  sfxGain.gain.value = sfxVolume;

  // The music player writes each element's level (the crossfade) into a gain of its own, ahead of the music gain.
  const music = createMusicPlayer({
    tracks: options.tracks,
    enabled: musicVolume > 0,
    volume: 1,
    random: options.random,
    doc,
    createAudio: options.createAudio,
    route: (a) => {
      const source = ctx.createMediaElementSource(a);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(musicGain);
      return (level) => void (gain.gain.value = level);
    },
  });

  const buffers = new Map<SfxName, AudioBuffer>();
  const lastStart = new Map<SfxName, number>();
  let unlocked = false;
  let loading = false;
  let dead = false;

  const loadSounds = () => {
    if (loading) return;
    loading = true;
    for (const name of SFX_NAMES) {
      void fetchSound(sfxUrl(name))
        .then((bytes) => ctx.decodeAudioData(bytes))
        .then((buffer) => {
          if (!dead) buffers.set(name, buffer);
        })
        // A sound that does not load is a silent one; the game does not wait for it.
        .catch(() => {});
    }
  };

  const wake = () => {
    if (ctx.state !== "running") void Promise.resolve(ctx.resume()).catch(() => {});
  };
  const onGesture = () => {
    wake();
    if (!unlocked) {
      unlocked = true;
      loadSounds();
    }
  };
  const onVisibility = () => {
    if (doc.visibilityState === "hidden") void Promise.resolve(ctx.suspend()).catch(() => {});
    else if (unlocked) wake();
  };
  for (const g of GESTURES) doc.addEventListener(g, onGesture, true);
  doc.addEventListener("visibilitychange", onVisibility);
  // A play from the lock screen, while the tab is hidden and the context suspended: the music plays, so the context runs.
  const unsubscribe = music.subscribe(() => {
    if (music.getState().playing) wake();
  });

  return {
    music,
    setMusicVolume(v) {
      musicVolume = clamp01(v);
      ramp(musicGain, musicVolume);
      music.setEnabled(musicVolume > 0);
    },
    setSfxVolume(v) {
      sfxVolume = clamp01(v);
      ramp(sfxGain, sfxVolume);
    },
    play(name) {
      const buffer = buffers.get(name);
      if (!buffer || sfxVolume === 0 || ctx.state !== "running") return;
      const now = Date.now();
      if (now - (lastStart.get(name) ?? 0) < MIN_GAP_MS) return;
      lastStart.set(name, now);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(sfxGain);
      source.start();
    },
    loaded: () => [...buffers.keys()],
    destroy() {
      dead = true;
      for (const g of GESTURES) doc.removeEventListener(g, onGesture, true);
      doc.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
      music.destroy();
      void Promise.resolve(ctx.close()).catch(() => {});
    },
  };
}
