import type { ReactNode } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";
import { CHEST_NAME, ChestBadge, type ChestRank } from "../elements/chest-badge";
import { HeroCountdown } from "../elements/hero-countdown";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { PVP_CHESTS_A_DAY } from "./layout-rules";

/** A UTC day: the dial's turn. */
const DAY = 86_400;
const NONE: readonly number[] = [];
/** The countdown's last minute: it pulses. */
export const LAST_MINUTE_S = 60;
/** How long the slots say "Ready" once the reset is reached on the page. */
export const READY_S = 8;

/**
 * The hero's two directions (#759), for the owner to choose: `pedestals` (the default) puts the three slots first, each a large
 * chest on its pedestal, the countdown under them, and moves the countdown to the centre once the three are won; `dial` keeps a
 * large dial of the day at the centre, the countdown inside it, the slots in a row under it.
 */
export type ChestSlotsLook = "pedestals" | "dial";

export interface ChestSlotsProps {
  /** The PvP chests won today (at most 3, #732). */
  won: number;
  /** Of those, the slots whose chest was opened already (#784), by index: they show a grey, disabled chest. */
  opened?: readonly number[];
  /** Their ranks by slot, when the read gives them: a won slot then shows its chest in its rank's colour; unset, a chest of no rank. */
  ranks?: readonly (ChestRank | undefined)[];
  /** Seconds since the epoch: the next UTC day, when the slots are free again. */
  resetsAt?: number;
  /** Seconds since the epoch: the scene's clock. */
  now?: number;
  /** The reset just came: the slots light up again, for a short while. */
  ready?: boolean;
  look?: ChestSlotsLook;
  /** To the mode choice: win stars to fill a slot. */
  onPlay?: () => void;
  /** A tap on a won slot not opened yet (#784): its chest opens in the modal. Unset, the slots are not buttons. */
  onOpenSlot?: (index: number) => void;
  className?: string;
}

/**
 * The day's three PvP chest slots (#759), the Chests page's hero. A slot says its state (#784): a free one is its outline alone, a
 * won one shows its chest in its rank's colour (a tap opens it), an opened one a grey, disabled chest. The reset's countdown
 * ticks under them, at the centre once the three are won, and pulses in its last minute. At the reset a short "Ready" lights
 * the slots again. Under reduced motion every frame is still.
 */
export function ChestSlots({ won, opened = NONE, ranks, resetsAt, now, ready = false, look = "pedestals", onPlay, onOpenSlot, className }: ChestSlotsProps) {
  const reduced = useReducedMotionConfig() ?? false;
  const taken = ready ? 0 : Math.min(PVP_CHESTS_A_DAY, Math.max(0, won));
  const left = PVP_CHESTS_A_DAY - taken;
  const full = left === 0;
  const timed = resetsAt != null && now != null;
  const remaining = timed ? resetsAt - now : 0;
  const lastMinute = timed && remaining > 0 && remaining <= LAST_MINUTE_S;

  const countdown = timed && !ready && (
    <m.div
      data-pulse={lastMinute && !reduced ? "" : undefined}
      animate={lastMinute && !reduced ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={lastMinute && !reduced ? { duration: 1, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
    >
      <HeroCountdown expiresAt={resetsAt} now={now} label={full ? "More chests in" : "Slots reset in"} className={cn(lastMinute && "text-warning")} />
    </m.div>
  );

  const slots = (
    <ol aria-label="Today's PvP slots" className="grid grid-cols-3 gap-3">
      {Array.from({ length: PVP_CHESTS_A_DAY }, (_, i) => (
        <Slot
          key={i}
          index={i}
          state={i >= taken ? "free" : opened.includes(i) ? "opened" : "won"}
          rank={ranks?.[i]}
          ready={ready}
          small={look === "dial" || (full && look === "pedestals")}
          reduced={reduced}
          onOpen={onOpenSlot && (() => onOpenSlot(i))}
        />
      ))}
    </ol>
  );

  return (
    <section
      aria-labelledby="slots-title"
      data-look={look}
      data-state={ready ? "ready" : full ? "full" : taken > 0 ? "some" : "free"}
      className={cn(
        "relative flex flex-col items-center gap-4 overflow-hidden rounded-2xl border bg-card px-4 py-5 text-center",
        ready ? "border-primary/60 bg-radial from-primary/20 to-card to-70%" : full ? "border-border bg-radial from-warning/10 to-card to-70%" : "border-border bg-radial from-glow to-card to-70%",
        className,
      )}
    >
      <header className="flex w-full items-center justify-between gap-2">
        <h2 id="slots-title" className="font-display text-lg">
          Today's PvP chests
        </h2>
        <span aria-label={`${left} of ${PVP_CHESTS_A_DAY} left today`} className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", left > 0 ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground")}>
          <span className="numeric">{left}</span> / {PVP_CHESTS_A_DAY} left
        </span>
      </header>

      {ready && (
        <m.div
          role="status"
          initial={reduced ? false : { scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 18 }}
          className="flex flex-col items-center gap-1"
        >
          <span className="flex items-center gap-2 font-display text-3xl text-primary">
            <Icon name="sparkles" size="lg" /> Ready
          </span>
          <span className="text-sm text-muted-foreground">The slots are free again: 3 new chests to win today.</span>
        </m.div>
      )}

      {look === "dial" ? (
        <>
          {!ready && timed && <Dial fraction={Math.min(1, Math.max(0, 1 - remaining / DAY))} full={full}>{countdown}</Dial>}
          {slots}
        </>
      ) : full && !ready ? (
        <>
          <div className="py-2">{countdown}</div>
          {slots}
        </>
      ) : (
        <>
          {slots}
          {countdown}
        </>
      )}

      {full && !ready ? (
        <p className="text-xs text-muted-foreground">Today's PvP chests are won: attacks still win crowns and XP.</p>
      ) : (
        onPlay && (
          <Button size={ready ? "lg" : "default"} onClick={onPlay} className="min-w-44">
            <Icon name="swords" size="sm" /> {taken === 0 ? "Win stars to fill a slot" : "Fill the next slot"}
          </Button>
        )
      )}

      <p className="text-xs text-muted-foreground">
        Basic: one tile · Rare: one of 2 · Epic: one of 3 · A chest may hold Cobbles.
      </p>
    </section>
  );
}

/** A slot's state (#784): free (its outline alone), won (its chest, to open), opened (a grey, disabled chest). */
export type ChestSlotState = "free" | "won" | "opened";

interface SlotProps {
  index: number;
  state: ChestSlotState;
  rank?: ChestRank;
  ready: boolean;
  small: boolean;
  reduced: boolean;
  onOpen?: () => void;
}

const STATE_TEXT: Readonly<Record<ChestSlotState, string>> = { free: "Free", won: "Tap to open", opened: "Opened" };

/** One slot on its pedestal: its outline while free, its chest once won, the chest grey once opened. */
function Slot({ index, state, rank, ready, small, reduced, onOpen }: SlotProps) {
  const chest = rank ? CHEST_NAME[rank].toLowerCase() : "chest";
  const name =
    state === "won" ? `Slot ${index + 1}: won${rank ? `, ${chest}` : ""}` : state === "opened" ? `Slot ${index + 1}: opened` : `Slot ${index + 1}: free${ready ? ", ready" : ""}`;
  const box = small ? "size-16" : "size-24";
  const art =
    state === "won" ? (
      rank ? (
        <ChestBadge rank={rank} size={small ? "md" : "lg"} glow className={cn(box, "[&_svg]:text-[2.5rem]")} />
      ) : (
        <span aria-hidden className={cn("grid place-items-center rounded-2xl border-2 border-primary/60 bg-secondary text-primary", box)}>
          <Icon name="treasure-chest" variant="solid" size={small ? "xl" : "2xl"} />
        </span>
      )
    ) : state === "opened" ? (
      <span aria-hidden data-spent="" className={cn("grid place-items-center rounded-2xl border-2 border-border bg-secondary/50 text-muted-foreground opacity-40", box)}>
        <Icon name="treasure-chest" variant="solid" size={small ? "xl" : "2xl"} />
      </span>
    ) : (
      <span
        aria-hidden
        className={cn(
          "grid place-items-center rounded-2xl border-2 border-dashed transition-colors",
          ready ? "border-primary bg-primary/10 text-primary shadow-[0_0_2rem_-0.5rem_var(--primary)]" : "border-border",
          box,
        )}
      >
        {ready && <Icon name="sparkles" size={small ? "xl" : "2xl"} />}
      </span>
    );
  const body = (
    <>
      <m.div
        className="relative"
        initial={ready && !reduced ? { scale: 0.6, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 16, delay: ready && !reduced ? index * 0.12 : 0 }}
      >
        {art}
      </m.div>
      {/* The pedestal. */}
      <span aria-hidden className={cn("h-2 rounded-[50%]", small ? "w-14" : "w-20", state === "won" ? "bg-muted-foreground/40" : ready ? "bg-primary/50" : "bg-secondary")} />
      <span aria-hidden className={cn("text-xs font-semibold", state === "won" || ready ? "text-primary" : "text-muted-foreground")}>
        {state === "free" && ready ? "Ready" : state === "won" && !onOpen ? "Won" : STATE_TEXT[state]}
      </span>
    </>
  );
  return (
    <li aria-label={name} data-slot-state={state === "free" && ready ? "ready" : state} className="flex flex-col items-center">
      {state === "won" && onOpen ? (
        <button
          type="button"
          aria-label={`Open the ${chest} of slot ${index + 1}`}
          onClick={onOpen}
          className="state-layer flex flex-col items-center gap-1.5 rounded-2xl p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {body}
        </button>
      ) : (
        <div aria-disabled={state === "opened" || undefined} className="flex flex-col items-center gap-1.5 p-1">
          {body}
        </div>
      )}
    </li>
  );
}

/** The `dial` look's centre: the day gone by as a ring, the countdown inside it. */
function Dial({ fraction, full, children }: { fraction: number; full: boolean; children: ReactNode }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-56 place-items-center">
      <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="4" className="stroke-secondary" />
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - fraction)} className={full ? "stroke-warning" : "stroke-primary"} />
      </svg>
      {children}
    </div>
  );
}
