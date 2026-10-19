import { createContext, use, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { AudioEngine } from "../../lib/audio/engine";
import type { SfxName } from "../../lib/audio/sfx";
import type { MusicState } from "../../lib/music/player";
import { TRACKS } from "../../lib/music/tracks";

/** The music before the engine has loaded (its chunk), after a gesture or never: off, silent, nothing known. */
const IDLE: MusicState = { enabled: false, volume: 0, unlocked: false, playing: false, index: null, track: null, title: null, loading: false, position: 0, duration: 0, previousTrack: null, nextTrack: null };
/** The level a resume returns to when the settings know none above 0. */
const RESUME_VOLUME = 0.4;

export interface MusicApi extends MusicState {
  /** The next track now, with the crossfade (forward through the history after a `previous`). */
  skip(): void;
  /** The track before, with the crossfade; at the start of the history, the start of the track. */
  previous(): void;
  /** Music off: the music volume goes to 0 (the setting, remembered after a reload; the slider shows it muted). */
  pause(): void;
  /** Music on: the music volume back to its level before the pause, and the track plays on. */
  resume(): void;
}

type Play = (name: SfxName) => void;

const NO_OP = () => () => {};
const SILENT_MUSIC: MusicApi = { ...IDLE, skip: () => {}, previous: () => {}, pause: () => {}, resume: () => {} };
const SILENT_PLAY: Play = () => {};
// Two contexts: the music's state moves ten times a second while it plays, and the board that plays sound effects must not render with it.
const MusicContext = createContext<MusicApi | null>(null);
const SfxContext = createContext<Play | null>(null);

export interface AudioProviderProps {
  /** The music volume setting, 0 to 1 (`DeviceSettings.musicVolume`); 0 is muted and pauses the player. */
  musicVolume: number;
  /** The level a resume returns to (`DeviceSettings.musicBefore`). */
  musicBefore?: number;
  /** A pause or a resume (the player's buttons, the lock screen, the headphones) sets the music volume: the app stores it. */
  onMusicVolumeChange?: (volume: number) => void;
  /** The sound effects volume setting, 0 to 1 (`DeviceSettings.sfxVolume`). */
  sfxVolume: number;
  /** The playlist's URLs; the app's tracks by default. */
  tracks?: readonly string[];
  children: ReactNode;
}

/**
 * Sound for what it wraps (#541): one engine (`lib/audio/engine.ts`, its own chunk, loaded when the provider mounts) with the
 * music player and the sound effects, the two volumes from the settings. The engine starts on the first user gesture; until
 * it has loaded, `play` does nothing and the music reads as idle.
 */
export function AudioProvider({ musicVolume, musicBefore = RESUME_VOLUME, onMusicVolumeChange, sfxVolume, tracks = TRACKS, children }: AudioProviderProps) {
  const [engine, setEngine] = useState<AudioEngine | null>(null);
  // The latest settings, for the controls the Media Session holds from the engine's creation on.
  const latest = useRef({ musicBefore, onMusicVolumeChange });
  latest.current = { musicBefore, onMusicVolumeChange };

  useEffect(() => {
    let dead = false;
    let made: AudioEngine | null = null;
    let unbind = () => {};
    void import("../../lib/audio/engine")
      .then(({ createAudioEngine, bindMediaSession }) => {
        if (dead) return;
        const e = createAudioEngine({ tracks, musicVolume, sfxVolume });
        made = e;
        // The lock screen and the headphones: a play there comes while the page is hidden, so it plays through that.
        unbind = bindMediaSession(e.music, { onPlay: () => setMusicOn(e, true, true), onPause: () => setMusicOn(e, false) });
        setEngine(e);
      })
      // A chunk that does not load is a silent app, not a broken one.
      .catch(() => {});
    return () => {
      dead = true;
      unbind();
      made?.destroy();
      setEngine(null);
    };
    // The engine is made once per playlist: the settings reach it below, they do not remake it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  useEffect(() => engine?.setMusicVolume(musicVolume), [engine, musicVolume]);
  useEffect(() => engine?.setSfxVolume(sfxVolume), [engine, sfxVolume]);

  // Music on or off, at once on the engine (a lock screen's play must not wait for a render) and in the settings.
  function setMusicOn(e: AudioEngine, on: boolean, hidden = false) {
    const { musicBefore: before, onMusicVolumeChange: report } = latest.current;
    const volume = on ? (before > 0 ? before : RESUME_VOLUME) : 0;
    if (on) e.music.resume({ hidden });
    e.setMusicVolume(volume);
    report?.(volume);
  }

  const player = engine?.music;
  const state = useSyncExternalStore(player?.subscribe ?? NO_OP, player?.getState ?? (() => IDLE), () => IDLE);
  const music = useMemo<MusicApi>(
    () => ({
      ...state,
      volume: musicVolume,
      skip: () => player?.skip(),
      previous: () => player?.previous(),
      pause: () => engine && setMusicOn(engine, false),
      resume: () => engine && setMusicOn(engine, true),
    }),
    // `setMusicOn` reads the settings through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, engine, player, musicVolume],
  );
  const play = useMemo<Play>(() => (name) => engine?.play(name), [engine]);
  return (
    <SfxContext value={play}>
      <MusicContext value={music}>{children}</MusicContext>
    </SfxContext>
  );
}

/** The music in a component: the track, the time, `skip`. Outside a provider, silence. */
export function useMusic(): MusicApi {
  return use(MusicContext) ?? SILENT_MUSIC;
}

/**
 * The sound effects: `play(name)` is stable while the engine is, and does nothing outside a provider, before the first gesture
 * or while the effects are muted.
 */
export function useSfx(): Play {
  return use(SfxContext) ?? SILENT_PLAY;
}
