import { useEffect, useRef, useState } from "react";
import { artOf } from "../../lib/music/track-info";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { SpinnerIcon } from "../ui/icons";
import { useMusic } from "./audio-provider";

export interface MusicPlayerProps {
  /** The track's URL and title, null before the first track. */
  track: string | null;
  title: string | null;
  /** The track's thumbnail (`artOf(track, 128)`), null for none: a neutral placeholder then, as when it fails to load. */
  art: string | null;
  /** Seconds played and the track's length (0 when not known). */
  position: number;
  duration: number;
  /** Music on: the music volume is above 0. Off, the controls still work and Play turns it back on. */
  enabled: boolean;
  /** A gesture has happened: before it, nothing may play ("Tap play to start"). */
  unlocked: boolean;
  /** A track is sounding right now. */
  playing: boolean;
  /** The track is waiting for its data. */
  loading: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  className?: string;
}

/** `183.4` as "3:03". */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The line under the title. */
export function musicStatus({ enabled, unlocked, playing, loading, track }: Pick<MusicPlayerProps, "enabled" | "unlocked" | "playing" | "loading" | "track">): string {
  if (!enabled) return "Music muted";
  if (!unlocked) return "Tap play to start";
  if (loading) return "Loading…";
  if (playing) return "Now playing";
  return track ? "Paused" : "Tap play to start";
}

/** The track's image, 64 px (a 128 px WebP), loaded when the player shows; a neutral placeholder before a track or if it fails. */
function Thumbnail({ src, loading }: { src: string | null; loading: boolean }) {
  // The source that failed: a new track tries its own image again.
  const [failed, setFailed] = useState<string | null>(null);
  const broken = src === null || failed === src;
  return (
    <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground tablet:size-16" data-testid="music-thumbnail" data-state={broken ? "placeholder" : "image"}>
      {broken ? (
        <Icon name="music" size="lg" />
      ) : (
        <img key={src} src={src} alt="" width={64} height={64} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(src)} className="size-full object-cover" />
      )}
      {loading && (
        <span className="absolute inset-0 grid place-items-center bg-background/60" aria-hidden>
          <SpinnerIcon className="size-5" />
        </span>
      )}
    </span>
  );
}

/**
 * The music player of the settings (#569): the track's thumbnail and title, a thin progress line with the time, and Previous,
 * Play or Pause, Next (44 px). No volume of its own: the Music slider above it is that. Pause turns the music off (the volume to
 * 0, remembered); while it is off, Previous and Next still change the track.
 */
export function MusicPlayer({ track, title, art, position, duration, enabled, unlocked, playing, loading, onPrevious, onNext, onPlay, onPause, className }: MusicPlayerProps) {
  const on = enabled && unlocked;
  // What the button showed when it was pressed: the first press is also the gesture that unlocks the audio, and the card
  // re-renders between the press and the click (Play turns into Pause), so the click alone would read the wrong one. The
  // press is read on `window`, in the capture phase: before the document's listener that unlocks the audio re-renders the card.
  const intent = useRef<"play" | "pause" | null>(null);
  const shown = useRef(on);
  shown.current = on;
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const press = (e: Event) => {
      if (button.current && e.target instanceof Node && button.current.contains(e.target)) intent.current = shown.current ? "pause" : "play";
    };
    window.addEventListener("pointerdown", press, true);
    window.addEventListener("keydown", press, true);
    return () => {
      window.removeEventListener("pointerdown", press, true);
      window.removeEventListener("keydown", press, true);
    };
  }, []);
  const toggle = () => {
    const action = intent.current ?? (on ? "pause" : "play");
    intent.current = null;
    (action === "play" ? onPlay : onPause)?.();
  };
  const progress = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  return (
    <section aria-label="Music player" className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-3", className)}>
      <div className="flex min-w-0 items-center gap-3">
        <Thumbnail src={art} loading={loading && on} />
        <div className="flex min-w-0 flex-1 flex-col" aria-live="off">
          <span className="truncate text-sm font-semibold" data-testid="music-title">
            {title ?? "Paved soundtrack"}
          </span>
          <span className="text-xs text-muted-foreground" data-testid="music-status">
            {musicStatus({ enabled, unlocked, playing, loading, track })}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="numeric min-w-10 shrink-0 text-xs whitespace-nowrap text-muted-foreground" data-testid="music-position">
          {formatTime(position)}
        </span>
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Track progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <span className="block h-full rounded-full bg-primary" style={{ width: `${progress * 100}%` }} />
        </span>
        <span className="numeric min-w-10 shrink-0 text-right text-xs whitespace-nowrap text-muted-foreground" data-testid="music-duration">
          {duration > 0 ? formatTime(duration) : "--:--"}
        </span>
      </div>
      <div className="flex items-center justify-center gap-4">
        <Button size="icon" variant="ghost" className="size-11" aria-label="Previous track" disabled={!unlocked || track === null} onClick={onPrevious}>
          <Icon name="backward-step" size="md" />
        </Button>
        <Button size="icon" className="size-11 rounded-full" aria-label={on ? "Pause music" : "Play music"} ref={button} onClick={toggle}>
          <Icon name={on ? "pause" : "play"} size="md" />
        </Button>
        <Button size="icon" variant="ghost" className="size-11" aria-label="Next track" disabled={!unlocked} onClick={onNext}>
          <Icon name="forward-step" size="md" />
        </Button>
      </div>
    </section>
  );
}

/**
 * The player on the app's music (`AudioProvider`): what the settings show, on the page and in the board's sheet. `enabled` is the
 * music volume the settings show above 0, so the card and the Music slider never disagree.
 */
export function LiveMusicPlayer({ enabled, className }: { enabled: boolean; className?: string }) {
  const m = useMusic();
  return (
    <MusicPlayer
      track={m.track}
      title={m.title}
      art={m.track ? artOf(m.track, 128) : null}
      position={m.position}
      duration={m.duration}
      enabled={enabled}
      unlocked={m.unlocked}
      playing={m.playing}
      loading={m.loading}
      onPrevious={m.previous}
      onNext={m.skip}
      onPlay={m.resume}
      onPause={m.pause}
      className={className}
    />
  );
}
