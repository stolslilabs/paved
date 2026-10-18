import { createContext, use, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { AudioEngine } from "../../lib/audio/engine";
import type { SfxName } from "../../lib/audio/sfx";
import type { MusicState } from "../../lib/music/player";
import { TRACKS } from "../../lib/music/tracks";

/** The music before the engine has loaded (its chunk), after a gesture or never: off, silent, nothing known. */
const IDLE: MusicState = { enabled: false, volume: 0, unlocked: false, playing: false, index: null, title: null, position: 0, duration: 0 };

export interface MusicApi extends MusicState {
  /** The next track now, with the crossfade. */
  skip(): void;
}

type Play = (name: SfxName) => void;

const NO_OP = () => () => {};
const SILENT_MUSIC: MusicApi = { ...IDLE, skip: () => {} };
const SILENT_PLAY: Play = () => {};
// Two contexts: the music's state moves ten times a second while it plays, and the board that plays sound effects must not render with it.
const MusicContext = createContext<MusicApi | null>(null);
const SfxContext = createContext<Play | null>(null);

export interface AudioProviderProps {
  /** The music volume setting, 0 to 1 (`DeviceSettings.musicVolume`); 0 is muted and pauses the player. */
  musicVolume: number;
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
export function AudioProvider({ musicVolume, sfxVolume, tracks = TRACKS, children }: AudioProviderProps) {
  const [engine, setEngine] = useState<AudioEngine | null>(null);

  useEffect(() => {
    let dead = false;
    let made: AudioEngine | null = null;
    void import("../../lib/audio/engine")
      .then(({ createAudioEngine }) => {
        if (dead) return;
        made = createAudioEngine({ tracks, musicVolume, sfxVolume });
        setEngine(made);
      })
      // A chunk that does not load is a silent app, not a broken one.
      .catch(() => {});
    return () => {
      dead = true;
      made?.destroy();
      setEngine(null);
    };
    // The engine is made once per playlist: the settings reach it below, they do not remake it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  useEffect(() => engine?.setMusicVolume(musicVolume), [engine, musicVolume]);
  useEffect(() => engine?.setSfxVolume(sfxVolume), [engine, sfxVolume]);

  const player = engine?.music;
  const state = useSyncExternalStore(player?.subscribe ?? NO_OP, player?.getState ?? (() => IDLE), () => IDLE);
  const music = useMemo<MusicApi>(() => ({ ...state, volume: musicVolume, skip: () => player?.skip() }), [state, player, musicVolume]);
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
