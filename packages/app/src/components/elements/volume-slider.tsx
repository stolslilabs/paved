import { useEffect, useRef, useState } from "react";
import { animate } from "motion";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Slider } from "../ui/slider";

export interface VolumeSliderProps {
  /** What the slider is for: "Music", "Sound effects". It names the button and the slider. */
  label: string;
  /** 0 to 1; 0 is muted. */
  value: number;
  /** The level the icon returns to when it unmutes (above 0). */
  before: number;
  onChange?: (value: number) => void;
  className?: string;
}

const MUTE_ANIMATION_S = 0.22;

/** The icon at this level: a cross when muted, one wave up to a half, two above. */
export const volumeIcon = (value: number): "volume-xmark" | "volume-low" | "volume-high" => (value <= 0 ? "volume-xmark" : value < 0.5 ? "volume-low" : "volume-high");

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A volume slider with its mute: an icon button and a slider, 44 px tall. The icon mutes (the slider runs down to 0, the
 * icon is crossed) and unmutes (it runs back to the level before the mute). Dragging to 0 mutes, dragging up from 0 unmutes: the
 * muted state is "the value is 0", so the parent keeps one number and the level to return to. The percent is read out beside it.
 */
export function VolumeSlider({ label, value, before, onChange, className }: VolumeSliderProps) {
  const muted = value <= 0;
  // The thumb's position: the value, except for the quarter second after a click on the icon, when it runs to the new value.
  const [shown, setShown] = useState(value);
  const dragging = useRef(false);
  const run = useRef<{ stop: () => void } | null>(null);
  const last = useRef(value);

  useEffect(() => {
    const from = last.current;
    last.current = value;
    run.current?.stop();
    run.current = null;
    // A drag moves the value a pixel at a time and the thumb follows it as it is; a jump of the icon is the one animated.
    if (dragging.current || reducedMotion() || Math.abs(from - value) < 0.05) {
      setShown(value);
      return;
    }
    run.current = animate(from, value, { duration: MUTE_ANIMATION_S, ease: "easeOut", onUpdate: setShown });
    return () => run.current?.stop();
  }, [value]);

  const toggle = () => onChange?.(muted ? before : 0);
  const percent = Math.round(value * 100);
  return (
    <div className={cn("flex min-h-11 items-center gap-2", className)}>
      <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label={`Mute ${label.toLowerCase()}`} aria-pressed={muted} title={muted ? `Unmute ${label.toLowerCase()}` : `Mute ${label.toLowerCase()}`} onClick={toggle}>
        <Icon name={volumeIcon(value)} fixedWidth />
      </Button>
      <Slider
        className="h-11"
        aria-label={`${label} volume`}
        aria-valuetext={muted ? "Muted" : `${percent}%`}
        min={0}
        max={100}
        step={1}
        value={[Math.round(shown * 100)]}
        onPointerDown={() => void (dragging.current = true)}
        onValueCommit={() => void (dragging.current = false)}
        onValueChange={([v]) => onChange?.((v ?? 0) / 100)}
      />
      <span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular-nums" aria-hidden>
        {percent}%
      </span>
    </div>
  );
}
