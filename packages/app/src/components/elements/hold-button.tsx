import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { useReducedMotionConfig } from "motion/react";
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

const TONE: Record<HoldTone, { variant: "default" | "secondary"; progress: string; tube: "gold" | "red" }> = {
  primary: { variant: "default", progress: "stroke-current", tube: "gold" },
  destructive: { variant: "secondary", progress: "stroke-destructive", tube: "red" },
};

/**
 * The painted ring (TILE-ACTIONS, the owner's ask of 2026-11-07): the Missions' gold rail (`rail-fill`) bent into a ring round the painted
 * button, just outside its disc (on the disc's own gold or red rim it would not read), 4.5 px wide, its colours across the width from the
 * rail's foot inside to its top outside (`--hold-gold-*`); Discard's the same tube in red (`--hold-red-*`). Under it while held, a dark
 * track a px wider, as the rail's under its fill. Each stop: the colour's part and its radius, px of the 44 px box (the disc's edge is at
 * about 20.6).
 */
const TUBE_R = 23.5;
const TUBE_W = 4.5;
const TUBE_OUT = TUBE_R + TUBE_W / 2;
const TUBE_C = 2 * Math.PI * TUBE_R;
const TUBE: readonly (readonly [string, number])[] = [
  ["edge", 21.25],
  ["deep", 21.85],
  ["shade", 22.55],
  ["base", 23.25],
  ["bright", 23.95],
  ["shine", 24.45],
  ["rim", 24.95],
  ["edge", 25.75],
];

export interface HoldButtonProps {
  /** The action, once per completed hold. */
  onComplete: () => void;
  /** Its accessible name, which says it is held: "Hold to place the tile". */
  label: string;
  /** A Font Awesome name drawn in the ring. */
  icon?: string;
  /** Drawn in place of the plain Font Awesome icon (EDIT-VILLAGE: the edit bar's painted eraser in the HUD's look). */
  glyph?: ReactNode;
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
  /**
   * The painted look (TILE-ACTIONS, the Paved UX Book's board screen): `glyph` is the whole button, a painted round button on no fill
   * of the button's own; the ring rides on its rim with no track under it (the rim is the track), light on Confirm's gold, red on
   * Discard's blue; busy keeps the painting under the spinner.
   */
  painted?: boolean;
  className?: string;
}

/**
 * A button that acts only when held (PLACE-POLISH, issue 568): a ring fills around its icon over `holdMs`; letting go, or the
 * pointer leaving it, before the end cancels and the ring rewinds. A light tick when the hold starts, a firmer one when it
 * completes and acts, once (`haptic`, where the device has haptics). The same with the mouse, a finger (no callout, no selection, no gesture of the board under it) or the keyboard
 * (hold Enter or Space). An activation with no press before it, as a screen reader's double tap sends, acts at once: the
 * hold guards a slip of the finger, which that activation is not.
 */
export function HoldButton({ onComplete, label, icon = "check", glyph, holdMs = HOLD_MS, disabled = false, busy = false, title, holdKey, tone = "primary", hold: shared, painted = false, className }: HoldButtonProps) {
  const off = disabled || busy;
  const own = useHold({ onComplete, holdMs, holdKey, disabled: off, charge: painted });
  const reduce = useReducedMotionConfig() ?? false;
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

  return (
    <Button
      size="icon"
      variant={painted ? "ghost" : TONE[tone].variant}
      data-tone={tone}
      aria-label={label}
      title={title}
      data-state={state}
      // Painted, the button's own spinner would take the painting's place: the button is disabled and busy by hand, the spinner over it.
      disabled={painted ? off : disabled}
      loading={painted ? false : busy}
      {...(painted && busy ? { "aria-busy": true } : {})}
      onPointerDown={onPointerDown}
      onPointerUp={release}
      onPointerLeave={leave}
      onPointerCancel={leave}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={release}
      onClick={onClick}
      className={cn("relative touch-none select-none [-webkit-touch-callout:none]", className, painted && busy && "disabled:opacity-100")}
    >
      {painted ? (
        // The charge: the painting swells a little as the hold fills (slowly, then fast), and springs back when let go.
        <span
          data-charge
          className={cn("pointer-events-none grid size-full place-items-center", busy && "opacity-70")}
          style={
            reduce
              ? undefined
              : { transform: state === "holding" ? "scale(1.09)" : "scale(1)", transition: state === "holding" ? `transform ${hold.holdMs}ms cubic-bezier(0.6, 0, 0.9, 0.4)` : `transform ${REWIND_MS}ms ease-out` }
          }
        >
          {glyph}
        </span>
      ) : (
        !busy && (glyph ?? <Icon name={icon} size="md" />)
      )}
      <HoldRing state={state} holdMs={hold.holdMs} tone={tone} painted={painted} busy={painted && busy} />
    </Button>
  );
}

/**
 * The hold's ring around a 44 px button's icon (`HoldButton`'s, and the press bubble's, issue 799): it fills clockwise from the top
 * over `holdMs` while held, stays full once done, and rewinds when let go early. The fill is the hold's progress, so it shows
 * under reduced motion too.
 */
export function HoldRing({ state, holdMs, tone = "primary", painted = false, busy = false }: { state: HoldState; holdMs: number; tone?: HoldTone; painted?: boolean; busy?: boolean }) {
  if (painted) return <PaintedRing state={state} holdMs={holdMs} tone={tone} busy={busy} />;
  const offset = state === "idle" ? RING_C : 0;
  const transition = state === "holding" ? `stroke-dashoffset ${holdMs}ms linear` : state === "idle" ? `stroke-dashoffset ${REWIND_MS}ms ease-out, opacity ${REWIND_MS}ms ease-out` : "none";
  return (
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
  );
}

/** The burst's sparks: eight, every 45 degrees round the ring. */
const SPARKS = [0, 45, 90, 135, 180, 225, 270, 315] as const;
/** The burst's length, ms. */
const BURST_MS = 480;

/**
 * The painted ring (TILE-ACTIONS, the owner's asks of 2026-11-07: the Missions' gold, shinier, a feeling of power): the rail's tube fills
 * round the button on its dark track; a white glow follows the fill and a halo of its bright colour round the whole button swells as
 * it fills (slowly, then fast); a white-hot spark runs at its head; at the end a burst (a shockwave, a flash on the disc, eight sparks flying out). Busy: an arc of the same tube turns
 * round the button (the spinner round the icon, not on it). Under reduced motion the fill and the glow alone (the hold's progress), and
 * the busy arc still.
 */
function PaintedRing({ state, holdMs, tone, busy }: { state: HoldState; holdMs: number; tone: HoldTone; busy: boolean }) {
  const reduce = useReducedMotionConfig() ?? false;
  const id = useId().replace(/[^\w-]/g, "");
  const kind = TONE[tone].tube;
  const tube = `hold-tube-${id}`;
  const glow = `hold-glow-${id}`;
  const spark = `hold-spark-${id}`;
  const halo = `hold-halo-${id}`;
  const idle = state === "idle";
  const holding = state === "holding";
  const offset = idle ? TUBE_C : 0;
  const fill = holding ? `stroke-dashoffset ${holdMs}ms linear` : idle ? `stroke-dashoffset ${REWIND_MS}ms ease-out` : "none";
  const fade = holding ? `opacity ${holdMs}ms cubic-bezier(0.4, 0, 0.8, 0.6)` : `opacity ${REWIND_MS}ms ease-out`;
  const color = (part: string) => `var(--hold-${kind}-${part})`;
  const burst = useRef<SVGGElement>(null);
  useEffect(() => {
    const g = burst.current;
    if (state !== "done" || reduce || !g || typeof g.animate !== "function") return;
    const run = (sel: string, frames: Keyframe[], ms = BURST_MS) => g.querySelectorAll<SVGElement>(sel).forEach((e) => e.animate(frames, { duration: ms, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" }));
    run("[data-burst=wave]", [
      { opacity: 1, transform: "scale(1)", strokeWidth: 5 },
      { opacity: 0, transform: "scale(1.9)", strokeWidth: 0.5 },
    ]);
    run("[data-burst=flash]", [{ opacity: 0.9 }, { opacity: 0 }], 320);
    run("[data-burst=spark]", [
      { opacity: 1, transform: "translateX(0) scale(1.4)" },
      { opacity: 0, transform: "translateX(15px) scale(0.3)" },
    ]);
  }, [state, reduce]);
  return (
    <>
      <svg data-ring aria-hidden viewBox="0 0 44 44" className="absolute inset-0 size-full -rotate-90 overflow-visible">
        <defs>
          <radialGradient id={tube} gradientUnits="userSpaceOnUse" cx="22" cy="22" r={TUBE_OUT}>
            {TUBE.map(([part, at], i) => (
              <stop key={i} offset={at / TUBE_OUT} style={{ stopColor: color(part) }} />
            ))}
          </radialGradient>
          <filter id={glow} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.5" />
          </filter>
          <filter id={halo} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
          <radialGradient id={spark}>
            <stop offset="0" style={{ stopColor: color("shine") }} />
            <stop offset="0.45" style={{ stopColor: color("bright"), stopOpacity: 0.9 }} />
            <stop offset="1" style={{ stopColor: color("bright"), stopOpacity: 0 }} />
          </radialGradient>
        </defs>
        <circle
          data-ring-track
          cx="22"
          cy="22"
          r={TUBE_R}
          fill="none"
          strokeWidth={TUBE_W + 1}
          style={{ stroke: "var(--hud-outline)", strokeOpacity: 0.7, opacity: idle && !busy ? 0 : 1, transition: `opacity ${REWIND_MS}ms ease-out` }}
        />
        {!busy && (
          <>
            {/* The halo: the whole button's light, swelling as the hold fills (slowly, then fast). */}
            <circle
              data-ring-halo
              cx="22"
              cy="22"
              r={TUBE_R}
              fill="none"
              strokeWidth={10}
              filter={`url(#${halo})`}
              style={{ stroke: color("bright"), opacity: idle ? 0 : 1, transition: fade }}
            />
            <circle
              data-ring-glow
              cx="22"
              cy="22"
              r={TUBE_R}
              fill="none"
              strokeWidth={TUBE_W + 3}
              strokeLinecap="round"
              strokeDasharray={TUBE_C}
              filter={`url(#${glow})`}
              style={{ stroke: color("shine"), strokeDashoffset: offset, opacity: idle ? 0 : 1, transition: `${fill}, ${fade}` }}
            />
            <circle
              data-ring-progress
              data-tube={kind}
              cx="22"
              cy="22"
              r={TUBE_R}
              fill="none"
              stroke={`url(#${tube})`}
              strokeWidth={TUBE_W}
              strokeLinecap="round"
              strokeDasharray={TUBE_C}
              style={{ strokeDashoffset: offset, opacity: idle ? 0 : 1, transition: idle ? `${fill}, opacity ${REWIND_MS}ms ease-out` : fill }}
            />
            {!reduce && (
              <g
                data-ring-head
                style={{
                  transformOrigin: "22px 22px",
                  transform: `rotate(${idle ? 0 : 360}deg)`,
                  opacity: holding ? 1 : 0,
                  transition: holding ? `transform ${holdMs}ms linear` : `transform ${REWIND_MS}ms ease-out, opacity ${REWIND_MS}ms ease-out`,
                }}
              >
                <circle cx={22 + TUBE_R} cy="22" r="7" fill={`url(#${spark})`} />
              </g>
            )}
            <g ref={burst}>
              <circle data-burst="flash" cx="22" cy="22" r="20.6" opacity={0} style={{ fill: color("shine") }} />
              <circle data-burst="wave" cx="22" cy="22" r={TUBE_R} fill="none" opacity={0} style={{ stroke: color("shine"), transformOrigin: "22px 22px" }} />
              {SPARKS.map((a) => (
                <g key={a} style={{ transformOrigin: "22px 22px", transform: `rotate(${a}deg)` }}>
                  <circle data-burst="spark" cx={22 + TUBE_OUT} cy="22" r="2.2" opacity={0} style={{ fill: color("shine"), transformOrigin: `${22 + TUBE_OUT}px 22px` }} />
                </g>
              ))}
            </g>
          </>
        )}
      </svg>
      {busy && (
        <svg data-ring-busy aria-hidden viewBox="0 0 44 44" className={cn("absolute inset-0 size-full overflow-visible", !reduce && "animate-spin")}>
          <circle
            cx="22"
            cy="22"
            r={TUBE_R}
            fill="none"
            stroke={`url(#${tube})`}
            strokeWidth={TUBE_W}
            strokeLinecap="round"
            strokeDasharray={`${TUBE_C * 0.3} ${TUBE_C}`}
          />
        </svg>
      )}
    </>
  );
}
