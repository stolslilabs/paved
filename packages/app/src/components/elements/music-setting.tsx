import { useId } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { Slider } from "../ui/slider";
import { Switch } from "../ui/switch";

export interface MusicSettingProps {
  enabled: boolean;
  /** 0 to 1. */
  volume: number;
  onEnabledChange?: (enabled: boolean) => void;
  onVolumeChange?: (volume: number) => void;
  className?: string;
}

/** The Settings "Music" row: a switch, and under it the volume slider (dimmed and locked while music is off). */
export function MusicSetting({ enabled, volume, onEnabledChange, onVolumeChange, className }: MusicSettingProps) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-2 py-2.5", className)}>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-5 items-center">
          <Icon name="music" className="text-muted-foreground" size="sm" fixedWidth />
        </span>
        <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col wrap-anywhere">
          <span className="text-sm leading-5">Music</span>
        </label>
        <span className="inline-flex h-5 items-center">
          <Switch id={id} checked={enabled} onCheckedChange={onEnabledChange} />
        </span>
      </div>
      <div className="flex items-center gap-3 pl-8">
        <Slider aria-label="Music volume" min={0} max={100} step={1} disabled={!enabled} value={[Math.round(volume * 100)]} onValueChange={([v]) => onVolumeChange?.((v ?? 0) / 100)} />
        <span className="w-9 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{Math.round(volume * 100)}%</span>
      </div>
    </div>
  );
}
