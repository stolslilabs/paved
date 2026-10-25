import { useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { cn } from "../../lib/utils";
import { HOLD_MS, useHold, type Hold, type HoldState } from "../../lib/use-hold";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { haptic } from "../../lib/haptics";

export { HOLD_MS, type HoldState };
/** The ring rewinds this fast when the hold is let go before the end, ms. */
const REWIND_MS = 150;
/** The ring: a circle in the button's 44 px box, drawn from the top, clockwise. */
const RING_R = 19;
const RING_C = 2 * Math.PI * RING_R;

/**
 * The button's colours (BUBBLE-DISCARD, issue 606): `primary`, the yellow button with a grey progress ring (Validate); `destructive`, the colours
 * inverted, a grey circle with a red progress ring (Discard).
 */
export type HoldTone = "primary" | "destructive";

const TONE: Record<HoldTone, { variant: "default" | "secondary"; progress: string }> = {
  primary: { variant: "default", progress: "stroke-current" },
  destructive: { variant: "secondary", progress: "stroke-destructive" },
};

export interface HoldButtonProps {
  /** The action, once per completed hold. */
  onComplete: () => void;
  /** Its accessible name, which says it is held: "Hold to place the tile". */
  label: string;
  /** A Font Awesome name drawn in the ring. */
  icon?: string;
  /** The hold's length, ms. */
  holdMs?: number;
  disabled?: boolean;
  /** The action is on its way: a spinner in place of the icon, and disabled. */
  busy?: boolean;
  title?: string;
  /**
   * What the hold validates (the tile's cell and rotation, say): when it changes mid-hold, the hold is dropped and the ring
   * rewinds, so a completed hold always acts on what was shown for its whole length.
   */
  holdKey?: string | number;
  tone?: HoldTone;
  /**
   * A hold shared with another source (`useHold`; the board's press on the placed tile, TILE-HOLD, issue 630): the button shows its
   * ring and drives it as its own, so the ring fills whichever of the two is held. Its controller then owns `onComplete`,
   * `holdMs` and `holdKey`; the button's are unused.
   */
  hold?: Hold;
  className?: string;
}

/**
 * A button that acts only when held (PLACE-POLISH, issue 568): a ring fills around its icon over `holdMs`; letting go, or the
 * pointer leaving it, before the end cancels and the ring rewinds. A light tick when the hold starts, a firmer one when it
 * completes and acts, once (`haptic`, where the device has haptics). The same with the mouse, a finger (no callout, no selection, no gesture of the board under it) or the keyboard
 * (hold Enter or Space). An activation with no press before it, as a screen reader's double tap sends, acts at once: the
 * hold guards a slip of the finger, which that activation is not.
 */
export function HoldButton({ onComplete, label, icon = "check", holdMs = HOLD_MS, disabled = false, busy = false, title, holdKey, tone = "primary", hold: shared, className }: HoldButtonProps) {
  const off = disabled || busy;
  const own = useHold({ onComplete, holdMs, holdKey, disabled: off });
  const hold = shared ?? own;
  const { state } = hold;
  // A press (pointer or key) on the button began: the click that follows it is not an activation of its own, and only
  // that press is let go by the button's own up, leave or blur (a hold from the board is the board's to let go).
  const pressed = useRef(false);
  const start = () => {
    if (off) return;
    pressed.current = true;
    hold.start();
  };
  const release = () => {
    if (pressed.current) hold.release();
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button > 0) return;
    // No board gesture starts under the button.
    e.stopPropagation();
    // A touch captures its pointer to the button: let it go, so a finger sliding off cancels as the mouse does.
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    start();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    // No click from the key: the hold acts, not the press.
    e.preventDefault();
    if (!e.repeat && state === "idle") start();
  };
  const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    release();
    pressed.current = false;
  };
  const leave = () => {
    release();
    pressed.current = false;
  };
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (pressed.current) {
      pressed.current = false;
      return;
    }
    // An activation with no press: a screen reader's.
    if (!off && e.detail === 0) hold.act();
  };

  const offset = state === "idle" ? RING_C : 0;
  const transition = state === "holding" ? `stroke-dashoffset ${hold.holdMs}ms linear` : state === "idle" ? `stroke-dashoffset ${REWIND_MS}ms ease-out, opacity ${REWIND_MS}ms ease-out` : "none";
  return (
    <Button
      size="icon"
      variant={TONE[tone].variant}
      data-tone={tone}
      aria-label={label}
      title={title}
      data-state={state}
      disabled={disabled}
      loading={busy}
      onPointerDown={onPointerDown}
      onPointerUp={release}
      onPointerLeave={leave}
      onPointerCancel={leave}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={release}
      onClick={onClick}
      className={cn("relative touch-none select-none [-webkit-touch-callout:none]", className)}
    >
      {!busy && <Icon name={icon} size="md" />}
      <svg data-ring aria-hidden viewBox="0 0 44 44" className="absolute inset-0 size-full -rotate-90">
        <circle cx="22" cy="22" r={RING_R} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={3} />
        <circle
          data-ring-progress
          cx="22"
          cy="22"
          r={RING_R}
          fill="none"
          className={TONE[tone].progress}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={RING_C}
          style={{ strokeDashoffset: offset, transition, opacity: state === "idle" ? 0 : 1 }}
        />
      </svg>
    </Button>
  );
}
