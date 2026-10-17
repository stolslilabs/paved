import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Slider } from "../ui/slider";

export interface MusicPlayerProps {
  /** The track's title, null before the first track. */
  title: string | null;
  /** Seconds played and the track's length (0 when not known). */
  position: number;
  duration: number;
  /** Music on (the setting): the button pauses it. */
  enabled: boolean;
  /** A track is sounding right now (false while the tab is hidden, or before the first gesture). */
  playing: boolean;
  /** 0 to 1. */
  volume: number;
  onEnabledChange?: (enabled: boolean) => void;
  onVolumeChange?: (volume: number) => void;
  onSkip?: () => void;
  className?: string;
}

/** `183.4` as "3:03". */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The music player: play or pause, the next track, the volume, and a readout of the track's title and the time. */
export function MusicPlayerControls({ title, position, duration, enabled, playing, volume, onEnabledChange, onVolumeChange, onSkip, className }: MusicPlayerProps) {
  return (
    <section aria-label="Music player" className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-4", className)}>
      <div className="flex min-w-0 flex-col" aria-live="off">
        <span className="text-xs tracking-wide text-muted-foreground uppercase">{playing ? "Now playing" : enabled ? "Waiting" : "Music off"}</span>
        <span className="text-sm font-semibold wrap-anywhere" data-testid="music-title">
          {title ?? "No track yet"}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums" data-testid="music-time">
          {formatTime(position)} / {duration > 0 ? formatTime(duration) : "--:--"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Button size="icon" variant="outline" aria-label={enabled ? "Turn music off" : "Turn music on"} onClick={() => onEnabledChange?.(!enabled)}>
          <Icon name={enabled ? "pause" : "play"} size="sm" />
        </Button>
        <Button size="icon" variant="outline" aria-label="Next track" disabled={!enabled} onClick={onSkip}>
          <Icon name="forward-step" size="sm" />
        </Button>
        <Icon name="volume-low" className="text-muted-foreground" size="sm" fixedWidth />
        <Slider aria-label="Music volume" min={0} max={100} step={1} value={[Math.round(volume * 100)]} onValueChange={([v]) => onVolumeChange?.((v ?? 0) / 100)} />
      </div>
    </section>
  );
}
