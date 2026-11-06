import { useEffect, useRef, useState } from "react";
import { animate } from "motion";
import { cn } from "../../lib/utils";
import { Slider } from "../ui/slider";
import { SETTING_LABEL } from "./setting-switch";
import type { UiIconName } from "./ui-art";
import { UiIcon } from "./ui-icon";

export interface VolumeSliderProps {
  /** What the slider is for: "Music", "Sound effects". It names the button and the slider. */
  label: string;
  /** Its painted icon (the book's note, its speaker): the mute. */
  art: UiIconName;
  /** 0 to 1; 0 is muted. */
  value: number;
  /** The level the icon returns to when it unmutes (above 0). */
  before: number;
  onChange?: (value: number) => void;
  className?: string;
}

const MUTE_ANIMATION_S = 0.22;

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A volume slider with its mute, one row (SETTINGS-PAGE, the Paved UX Book's Sound): the painted icon, the name, the slider, the
 * sliders of a group starting at one line (the name's column). The icon mutes (the slider runs down to 0, the icon dims under the red
 * cross) and unmutes (it runs back to the level before the mute). Dragging to 0 mutes, dragging up from 0 unmutes: the muted state is
 * "the value is 0", so the parent keeps one number and the level to return to. The percent is read out, not shown (the book's).
 * The slider is the book's: a carved track, the gold fill, a gold knob outlined.
 */
export function VolumeSlider({ label, art, value, before, onChange, className }: VolumeSliderProps) {
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
  const name = label.toLowerCase();
  return (
    // At 320 px the slider goes under the name rather than shrinking past use (WRAP360).
    <div data-slot="volume-row" className={cn("flex min-h-12 flex-wrap items-center gap-x-2 py-1 pr-3 pl-1.5", className)}>
      <button
        type="button"
        aria-label={`Mute ${name}`}
        aria-pressed={muted}
        title={muted ? `Unmute ${name}` : `Mute ${name}`}
        onClick={toggle}
        className="state-layer relative grid size-11 shrink-0 cursor-pointer place-items-center rounded-full outline-none"
      >
        <UiIcon name={art} px={32} className={cn("drawer-icon size-8 transition-opacity", muted && "opacity-40")} />
        {muted && <UiIcon name="close" px={20} className="drawer-icon absolute right-0 bottom-0 size-5" />}
      </button>
      <span className={cn(SETTING_LABEL, "w-28 flex-none")}>{label}</span>
      <Slider
        className="h-11 min-w-32 flex-1"
        trackClassName="drawer-carved bg-card"
        thumbClassName="size-6 border-background bg-primary"
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
    </div>
  );
}
