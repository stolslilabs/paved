import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { VirtualStick, type StickTilt } from "../elements/virtual-stick";

/** How the walk is driven: two sticks on touch, the keys and the mouse on a desktop. */
export type WalkInputKind = "touch" | "desktop";
/** Where the walk is: its ground being built, the descent, the walk, the lift back. */
export type WalkControlsPhase = "loading" | "entering" | "walking" | "leaving";

export interface WalkControlsProps extends ComponentProps<"div"> {
  input: WalkInputKind;
  phase: WalkControlsPhase;
  /** Desktop: the mouse is locked to the look (the Pointer Lock API); Escape frees it, a click takes it again. */
  mouseLocked?: boolean;
  onExit: () => void;
  /** Touch: the move stick's tilt (`x` right, `y` forward). */
  onMove?: (tilt: StickTilt) => void;
  /** Touch: the look stick's tilt (`x` right, `y` up). */
  onLook?: (tilt: StickTilt) => void;
}

/** The desktop's line of help, by whether the mouse is locked. */
export const WALK_HINTS = {
  free: "Click to look around · ZQSD or WASD to walk · Esc to leave",
  locked: "ZQSD or WASD to walk · Esc frees the mouse",
} as const;

/**
 * The first-person walk's overlay (V4-WALK-1, #876), over the board: Exit at the top left, and, on touch, the move stick at the
 * bottom left and the look stick at the bottom right; on a desktop, a line of help at the bottom. Inside the safe areas. The
 * overlay lets the board take every other press (the click that locks the mouse).
 */
export function WalkControls({ input, phase, mouseLocked = false, onExit, onMove, onLook, className, style, ...props }: WalkControlsProps) {
  const walking = phase === "walking";
  return (
    <div
      data-slot="walk-controls"
      data-phase={phase}
      className={cn(
        "pointer-events-none absolute inset-0 flex flex-col justify-between pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        className,
      )}
      // The sides' safe areas inline: two more arbitrary classes would grow the app's CSS for one overlay.
      style={{ paddingLeft: "max(0.75rem, env(safe-area-inset-left))", paddingRight: "max(0.75rem, env(safe-area-inset-right))", ...style }}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <Button variant="secondary" className="pointer-events-auto" onClick={onExit} disabled={phase === "leaving"}>
          <Icon name="xmark" variant="solid" size="sm" />
          Exit
        </Button>
        {phase === "loading" && (
          <p role="status" className="rounded-lg bg-background/70 px-3 py-2 text-sm text-foreground">
            Finding a street…
          </p>
        )}
      </div>
      {walking && input === "touch" && (
        <div className="flex items-end justify-between gap-3">
          <VirtualStick className="pointer-events-auto" label="Move" onTilt={(tilt) => onMove?.(tilt)} />
          <VirtualStick className="pointer-events-auto" label="Look" onTilt={(tilt) => onLook?.(tilt)} />
        </div>
      )}
      {walking && input === "desktop" && (
        <p className="self-center rounded-lg bg-background/70 px-3 py-2 text-center text-sm text-foreground">{mouseLocked ? WALK_HINTS.locked : WALK_HINTS.free}</p>
      )}
    </div>
  );
}
