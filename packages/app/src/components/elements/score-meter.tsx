import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { haptic } from "../../lib/haptics";
import type { MeterArt, MeterMark, ScoreMeterValue } from "../../lib/score-meter";
import { cn } from "../../lib/utils";
import { CHEST_EFFECTS, chestEffectUrl, pickSize } from "./chest-images";
import { TokenIcon } from "./token-icon";
import { UiIcon } from "./ui-icon";

/** A mark's side (px): its painting sits on the rail, the rail inset by half of it at each end so the end marks stay whole. */
const MARK = 26;
/**
 * A mark ahead in greys (`PaintedStars`' `EMPTY_STAR`), and reached its gold glowing as a reached node of the Missions' rail: the same
 * filters in the same order, so the one turns into the other.
 */
const GREY: CSSProperties = { filter: "grayscale(1) brightness(0.72) contrast(1.15) drop-shadow(0 0 0 transparent)" };
const LIT: CSSProperties = { filter: "grayscale(0) brightness(1) contrast(1) drop-shadow(0 0 4px color-mix(in oklab, var(--primary) 80%, transparent))" };
/** The gold's travel (s): a mark reached lights, pops and flashes as the gold gets there. */
const TRAVEL = 0.5;
/** The light a mark flashes when the score reaches it in play: the end's star light, `FLASH` times its side. */
const FLASH = 3.2;

export interface ScoreMeterProps extends ScoreMeterValue {
  className?: string;
}

/** The marks reached by one move: their indices and a count, so the same mark reached again (after a restart) beats again. */
type Beat = { marks: readonly number[]; n: number };

/**
 * The board's score meter (GAME-OVERLAY, the owner's ask of 2026-11-08: the Ranked's bar, restyled, in every mode; `lib/score-meter.ts`
 * says what each mode puts on it): the Missions' rail (`rail-track`, `rail-fill`: drawn in CSS, so it takes any length), its steel the
 * whole line and its gold to the score, and the marks painted
 * on it, greyed until the score reaches them, then gold and glowing; the score's share of the goal outlined after it (none in Story,
 * whose thresholds stay hidden). A mark reached during play beats: it pops, its light flashes once and the device gives a light buzz (no sound: the move plays
 * its own); a move reaching several marks beats each of them, with one buzz; a mark held from the start does not. Under reduced motion the
 * gold moves at once and nothing beats. A `meter` for assistive technology, its `aria-valuenow` held within its range (a Challenge goes on
 * past its cap): the true share stays in its words and its figure.
 */
export function ScoreMeter({ fill, marks, label, valueText, now, max, figure, className }: ScoreMeterProps) {
  const reduced = useReducedMotionConfig() ?? false;
  const f = Math.min(Math.max(fill, 0), 1);
  // The marks reached, one character each ("1" reached): each one newly reached beats.
  const reached = marks.map((mark) => (mark.reached ? "1" : "0")).join("");
  const before = useRef(reached);
  const [beat, setBeat] = useState<Beat | null>(null);
  useEffect(() => {
    const was = before.current;
    before.current = reached;
    const fresh = [...reached].flatMap((r, i) => (r === "1" && was[i] !== "1" ? [i] : []));
    if (fresh.length === 0) return;
    haptic("light");
    setBeat((b) => ({ marks: fresh, n: (b?.n ?? 0) + 1 }));
  }, [reached]);
  const stars = marks.filter((mark) => mark.art === "star" && mark.reached).length;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(Math.max(now, 0), max)}
      aria-valuetext={valueText}
      data-stars={stars}
      className={cn("flex items-center gap-2", className)}
    >
      <div aria-hidden className="relative min-w-0 flex-1" style={{ height: MARK }}>
        <span className="rail-track absolute top-1/2 h-2.5 -translate-y-1/2" style={{ left: MARK / 2, right: MARK / 2 }} />
        <span
          data-fill={Math.round(f * 100)}
          className="rail-fill absolute top-1/2 h-2.5 -translate-y-1/2"
          style={{
            left: MARK / 2,
            // At least as long as it is tall, so its rounded ends meet in a dot.
            width: `max(0.625rem, calc((100% - ${MARK}px) * ${f}))`,
            opacity: f > 0 ? 1 : 0,
            transition: reduced ? "none" : `width ${TRAVEL}s ease-out`,
          }}
        />
        {/* The marks' line: the rail's, so a mark's `left` is its place on the bar. */}
        <div className="absolute inset-y-0" style={{ left: MARK / 2, right: MARK / 2 }}>
          {marks.map((mark, i) => (
            <Mark key={i} mark={mark} beat={!reduced && beat?.marks.includes(i) && mark.reached ? beat.n : null} still={reduced} />
          ))}
        </div>
      </div>
      {figure && <span className="numeric text-outline min-w-[4ch] shrink-0 text-right text-sm font-bold tablet:text-base">{figure}</span>}
    </div>
  );
}

/**
 * A mark on the rail: its painting, grey ahead, gold and glowing reached, turning as the gold gets there; `beat` (a count) pops it and
 * flashes its light once, then. `still`: reduced motion, it turns at once.
 */
function Mark({ mark, beat, still }: { mark: MeterMark; beat: number | null; still: boolean }) {
  return (
    <span
      data-reached={mark.reached}
      data-art={mark.art}
      title={mark.name}
      className="absolute top-1/2 isolate grid -translate-x-1/2 -translate-y-1/2 place-items-center"
      style={{ left: `${mark.at * 100}%`, width: MARK, height: MARK }}
    >
      {beat !== null && <MarkFlash key={beat} />}
      {/* The icons' lip, then its colour (kept from one render to the next, so it turns), then its pop (new at each beat). */}
      <span className="drawer-icon grid size-full">
        <span
          className="grid size-full place-items-center"
          style={{ ...(mark.reached ? LIT : GREY), transition: still ? "none" : `filter 0.2s ease-out ${mark.reached ? TRAVEL * 0.8 : 0}s` }}
        >
          <m.span
            key={beat ?? "still"}
            className="grid size-full place-items-center"
            initial={beat !== null ? { scale: 1 } : false}
            animate={beat !== null ? { scale: [1, 1.55, 1] } : undefined}
            transition={{ delay: TRAVEL * 0.8, duration: 0.45, times: [0, 0.35, 1], ease: "easeOut" }}
          >
            <MarkArt art={mark.art} />
          </m.span>
        </span>
      </span>
    </span>
  );
}

/** A mark's painting: the painted star, trophy or crown, or the PAVED coin. */
function MarkArt({ art }: { art: MeterArt }) {
  if (art === "paved") return <TokenIcon kind="paved" px={MARK} className="size-[22px]" />;
  return <UiIcon name={art} px={MARK} className="size-full" />;
}

/** The end's star light (`star-light`), flashing once behind a mark the score just reached. */
function MarkFlash() {
  const side = MARK * FLASH;
  const light = chestEffectUrl("star-light", pickSize(CHEST_EFFECTS["star-light"].sizes, side * 2));
  return (
    <m.span
      aria-hidden
      data-part="mark-flash"
      className="pointer-events-none absolute -z-10"
      style={{ left: "50%", top: "50%", width: side, height: side, marginLeft: -side / 2, marginTop: -side / 2, maxWidth: "none", background: `url("${light}") center / contain no-repeat` }}
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: [0, 1, 0], scale: [0.4, 1.2, 1.5] }}
      transition={{ delay: TRAVEL * 0.8, duration: 0.8, times: [0, 0.3, 1], ease: "easeOut" }}
    />
  );
}
