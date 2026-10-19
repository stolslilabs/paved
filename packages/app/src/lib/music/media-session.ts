import type { MusicPlayer } from "./player";
import { ART_SIZES, artOf } from "./track-info";

// The Media Session (#569): the phone's lock screen, the notification shade and the headphones show the track (its title, the
// album "Paved", its image) and control the player: play, pause, previous, next. In the audio engine's chunk, with the player.
// The OS fetches the artwork when a track starts, not before.

/** The album the lock screen shows under the title. */
export const ALBUM = "Paved";

type Action = "play" | "pause" | "previoustrack" | "nexttrack";
export const ACTIONS: readonly Action[] = ["play", "pause", "previoustrack", "nexttrack"];

/** What the binding uses of `navigator.mediaSession`. */
export interface SessionLike {
  metadata: MediaMetadata | null;
  playbackState: MediaSessionPlaybackState;
  setActionHandler(action: Action, handler: (() => void) | null): void;
  setPositionState?(state?: MediaPositionState): void;
}

export interface MediaSessionOptions {
  /** `navigator.mediaSession` by default; none in this browser, the binding does nothing. */
  session?: SessionLike | null;
  /** Builds the metadata; `new MediaMetadata(init)` by default. */
  createMetadata?: (init: MediaMetadataInit) => MediaMetadata;
  /** A play from the lock screen or the headphones: the app turns the music on (the setting) and resumes the player. */
  onPlay: () => void;
  /** A pause from there: the app turns the music off. */
  onPause: () => void;
  /** A clock in ms, for the tests; `performance.now` by default. */
  now?: () => number;
}

/** A position this far (in seconds) from where the OS's own clock puts it is a jump (a restart, a seek): it is sent again. */
export const JUMP_S = 1;

const defaultSession = (): SessionLike | null => (globalThis.navigator as Navigator | undefined)?.mediaSession ?? null;
const defaultMetadata = (init: MediaMetadataInit): MediaMetadata => {
  const Meta = (globalThis as { MediaMetadata?: typeof MediaMetadata }).MediaMetadata;
  // No `MediaMetadata` (an old browser that has the session object anyway): the plain object, which some accept.
  return Meta ? new Meta(init) : (init as MediaMetadata);
};

/** The metadata of a track: its title, the album, and its image at each size (WebP). */
export function trackMetadata(track: string, title: string): MediaMetadataInit {
  const artwork = ART_SIZES.flatMap((size) => {
    const src = artOf(track, size);
    return src ? [{ src, sizes: `${size}x${size}`, type: "image/webp" }] : [];
  });
  return { title, album: ALBUM, artwork };
}

/** Binds the player to the Media Session; returns the function that unbinds it. */
export function bindMediaSession(player: MusicPlayer, options: MediaSessionOptions): () => void {
  const session = options.session === undefined ? defaultSession() : options.session;
  if (!session) return () => {};
  const createMetadata = options.createMetadata ?? defaultMetadata;
  const now = options.now ?? (() => performance.now());
  const handlers: Record<Action, () => void> = {
    play: options.onPlay,
    pause: options.onPause,
    previoustrack: () => player.previous(),
    nexttrack: () => player.skip(),
  };
  for (const action of ACTIONS) {
    try {
      session.setActionHandler(action, handlers[action]);
    } catch {
      // An action this browser does not know: the others still work.
    }
  }

  let track: string | null = null;
  let shown = "";
  // The position last sent, and when: while playing, the OS moves it on from there at the rate of 1.
  let sent: { position: number; at: number; playing: boolean } | null = null;
  const sync = () => {
    const s = player.getState();
    if (s.track !== track) {
      track = s.track;
      session.metadata = s.track && s.title ? createMetadata(trackMetadata(s.track, s.title)) : null;
    }
    // The state and the position are set when the track, the state or the length changes, or when the position jumps away
    // from where the OS's clock puts it (Previous at the start of the history restarts the track); the OS moves the position
    // on its own while it plays.
    const key = `${s.track}|${s.playing}|${s.duration}`;
    const expected = sent ? sent.position + (sent.playing ? (now() - sent.at) / 1000 : 0) : null;
    const jumped = expected !== null && Math.abs(s.position - expected) > JUMP_S;
    if (key !== shown || jumped) {
      shown = key;
      session.playbackState = s.track === null ? "none" : s.playing ? "playing" : "paused";
      sent = null;
      if (s.duration > 0) {
        sent = { position: s.position, at: now(), playing: s.playing };
        try {
          session.setPositionState?.({ duration: s.duration, position: Math.min(s.position, s.duration), playbackRate: 1 });
        } catch {
          // A position the browser refuses: the lock screen shows no progress, the rest works.
        }
      }
    }
  };
  sync();
  const unsubscribe = player.subscribe(sync);
  return () => {
    unsubscribe();
    for (const action of ACTIONS) {
      try {
        session.setActionHandler(action, null);
      } catch {
        // As above.
      }
    }
    session.metadata = null;
    session.playbackState = "none";
  };
}
