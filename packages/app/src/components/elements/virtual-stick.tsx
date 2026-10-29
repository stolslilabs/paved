import { useRef, useState, type ComponentProps, type PointerEvent } from "react";
import { cn } from "../../lib/utils";

/** A stick's tilt: `x` to the right, `y` up, each -1 to 1, its length at most 1. */
export interface StickTilt {
  x: number;
  y: number;
}

/** The smallest stick, CSS px (issue 876: at least 120). */
export const MIN_STICK_PX = 120;
/** A tilt under this length counts as none: a thumb at rest drifts a little. */
export const STICK_DEAD_ZONE = 0.08;

export interface VirtualStickProps extends Omit<ComponentProps<"div">, "onChange"> {
  /** What it does, for assistive technology: "Move", "Look". */
  label: string;
  /** Each change of the tilt, and `{ x: 0, y: 0 }` when it is let go. */
  onTilt: (tilt: StickTilt) => void;
  /** Its diameter, CSS px (at least `MIN_STICK_PX`). */
  size?: number;
  /** Where its knob is drawn before a touch (the stories' tilted state). */
  initialTilt?: StickTilt;
}

/** The tilt of a point (`dx`, `dy` from the centre, CSS px, y down) on a stick of `radius`: clamped to 1, a dead zone at rest. */
export function tiltOf(dx: number, dy: number, radius: number): StickTilt {
  let x = dx / radius;
  let y = (0 - dy) / radius;
  const length = Math.hypot(x, y);
  if (length < STICK_DEAD_ZONE) return { x: 0, y: 0 };
  if (length > 1) [x, y] = [x / length, y / length];
  return { x, y };
}

/**
 * A virtual joystick for touch (V4-WALK-1, issue 876): a translucent disc whose knob follows the finger that pressed it, held to its
 * rim, and comes back to the centre when let go. One finger per stick (pointer capture), so two sticks take two thumbs.
 */
export function VirtualStick({ label, onTilt, size = 128, initialTilt = { x: 0, y: 0 }, className, style, ...props }: VirtualStickProps) {
  const diameter = Math.max(MIN_STICK_PX, size);
  const radius = diameter / 2;
  const [tilt, setTilt] = useState<StickTilt>(initialTilt);
  const finger = useRef<number | null>(null);

  const follow = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const next = tiltOf(event.clientX - (box.left + box.width / 2), event.clientY - (box.top + box.height / 2), radius);
    setTilt(next);
    onTilt(next);
  };
  const release = () => {
    finger.current = null;
    setTilt({ x: 0, y: 0 });
    onTilt({ x: 0, y: 0 });
  };
  const knob = diameter * 0.42;

  return (
    <div
      role="group"
      aria-label={label}
      data-slot="virtual-stick"
      className={cn("relative touch-none rounded-full border-2 border-border bg-background/40 select-none", className)}
      style={{ width: diameter, height: diameter, ...style }}
      onPointerDown={(event) => {
        if (finger.current !== null) return;
        finger.current = event.pointerId;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        follow(event);
      }}
      onPointerMove={(event) => {
        if (event.pointerId === finger.current) follow(event);
      }}
      onPointerUp={(event) => {
        if (event.pointerId === finger.current) release();
      }}
      onPointerCancel={(event) => {
        if (event.pointerId === finger.current) release();
      }}
      {...props}
    >
      <div
        aria-hidden
        data-stick-knob
        className="absolute top-1/2 left-1/2 rounded-full border border-border bg-card/90"
        style={{ width: knob, height: knob, transform: `translate(-50%, -50%) translate(${tilt.x * (radius - knob / 2)}px, ${-tilt.y * (radius - knob / 2)}px)` }}
      />
    </div>
  );
}
