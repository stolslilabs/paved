import { createContext, use, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { MusicPlayer, MusicState } from "../../lib/music/player";
import { TRACKS } from "../../lib/music/tracks";

/** The music before the player has loaded (its chunk), after a gesture or never: off, silent, nothing known. */
const IDLE: MusicState = { enabled: false, volume: 0, unlocked: false, playing: false, index: null, title: null, position: 0, duration: 0 };

export interface MusicApi extends MusicState {
  /** The next track now, with the crossfade. */
  skip(): void;
}

const MusicContext = createContext<MusicApi | null>(null);
const NO_OP = () => () => {};

export interface MusicProviderProps {
  /** The music setting (`DeviceSettings.music`). */
  enabled: boolean;
  /** The music volume setting, 0 to 1 (`DeviceSettings.musicVolume`). */
  volume: number;
  /** The playlist's URLs; the app's tracks by default. */
  tracks?: readonly string[];
  children: ReactNode;
}

/**
 * Music for what it wraps (P-81): one player, `enabled` and `volume` from the settings. The player is its own chunk,
 * loaded when the provider mounts; it creates its two `<audio>` elements with `preload="none"` and no source, and loads the
 * first track only after the first user gesture. Mounted by the stories only: no route or shell uses it yet.
 */
export function MusicProvider({ enabled, volume, tracks = TRACKS, children }: MusicProviderProps) {
  const [player, setPlayer] = useState<MusicPlayer | null>(null);

  useEffect(() => {
    let dead = false;
    let made: MusicPlayer | null = null;
    void import("../../lib/music/player").then(({ createMusicPlayer }) => {
      if (dead) return;
      made = createMusicPlayer({ tracks, enabled, volume });
      setPlayer(made);
    });
    return () => {
      dead = true;
      made?.destroy();
      setPlayer(null);
    };
    // The player is made once per playlist: the settings reach it below, they do not remake it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  useEffect(() => player?.setEnabled(enabled), [player, enabled]);
  useEffect(() => player?.setVolume(volume), [player, volume]);

  const state = useSyncExternalStore(player?.subscribe ?? NO_OP, player?.getState ?? (() => IDLE), () => IDLE);
  const api = useMemo<MusicApi>(() => ({ ...state, skip: () => player?.skip() }), [state, player]);
  return <MusicContext value={api}>{children}</MusicContext>;
}

/** The music in a component: the track, the time, `skip`. Outside a provider, silence. */
export function useMusic(): MusicApi {
  return use(MusicContext) ?? { ...IDLE, skip: () => {} };
}
