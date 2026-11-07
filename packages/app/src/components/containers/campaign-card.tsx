import type { CSSProperties } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { StoryBackground, TileMosaic, type TileRenders } from "../elements/tile-render";
import { UiIcon } from "../elements/ui-icon";

/**
 * A campaign card's state (#592): open, locked (blurred, its condition stated), unlocking (opened since the device last showed
 * the list: the lock opens and goes, the blur lifts, once), complete (every level finished).
 */
export type CampaignStatus = "open" | "locked" | "unlocking" | "complete";

export interface CampaignCardProps {
  id: number;
  name: string;
  summary: string;
  levels: number;
  /** The stars held over its levels, of `levels` x 3. */
  stars: number;
  status: CampaignStatus;
  /** Locked: the campaign to finish first (STORY-PAGE, 2026-11-07: the Tutorial opens every other campaign). */
  opensAfter?: string;
  /** The campaign's tile theme (`StoryCampaign.theme`, 0 Default): its background is drawn in it. Unset: 0. */
  theme?: number;
  /** The plans of its decks (chain ids), the first eight drawn as its background when the build has no picture of it. */
  plans: readonly number[];
  renders?: TileRenders;
  /** Unlocking: holds the locked look while another motion runs (the carousel's), and plays the unlock once it is false (#615). */
  paused?: boolean;
  className?: string;
}

/** The unlock's timeline, in seconds: the lock opens, the blur lifts, the lock and the veil go. */
const UNLOCK = { turn: 0.5, lift: 0.8, duration: 0.9, fade: 1.3 } as const;
const BLURRED = "blur(14px) saturate(0.5)";
/**
 * The picture's frame, carved into the raised card (the drawer's rule: raised presses, carved informs): its near-black edge and a soft
 * shadow inside its top, drawn over the picture, which would cover a frame of its own box.
 */
const FRAME: CSSProperties = { boxShadow: "inset 0 0 0 1px var(--hud-outline), inset 0 3px 6px color-mix(in oklab, var(--hud-outline) 70%, transparent)" };
/** The picture's foot darkened, so the name over it reads (the words outlined as the drawers'). */
const FOOT: CSSProperties = { backgroundImage: "linear-gradient(to top, color-mix(in oklab, var(--background) 85%, transparent), transparent)" };
/** The status line's icons, 20 px. */
const LINE_ICON = "drawer-icon size-5";

/**
 * One campaign (#592; STORY-PAGE, in the integrated pages' style, after Play's raised mode cards): a raised card holding its picture
 * (its build-time picture in its theme, #721; its tiles' renders without one; no WebGL) carved into it, the name outlined over the
 * picture's foot and its stars beside it (the painted star), then its summary and a status line: its levels, the campaign to finish first
 * while locked (the painted lock), or Complete (the painted check). Every card has the same three parts, so nothing moves between states.
 * A locked one shows its picture under a blur and the painted lock over it; an unlocking one plays the unlock once (the lock opens, the
 * blur lifts, the lock goes; at once under reduced motion), when it is not `paused`. The carousel chooses it, not a press.
 */
export function CampaignCard({ id, name, summary, levels, stars, status, opensAfter = "Tutorial", theme = 0, plans, renders, paused, className }: CampaignCardProps) {
  const reduced = useReducedMotionConfig();
  const shown: CampaignStatus = status === "unlocking" && reduced ? "open" : status;
  const locked = shown === "locked";
  const unlocking = shown === "unlocking";
  const playing = unlocking && !paused;
  const veiled = locked ? "scale-110 blur-[14px] saturate-50" : undefined;
  const total = levels * 3;
  return (
    <article
      aria-label={name}
      data-campaign={id}
      data-status={shown}
      data-unlock={unlocking ? (playing ? "playing" : "paused") : undefined}
      className={cn("drawer-tile flex h-full flex-col gap-2 rounded-2xl p-2", className)}
    >
      <span className="relative isolate block aspect-video overflow-hidden rounded-xl bg-board">
        <m.span
          className="absolute inset-0"
          initial={unlocking ? { filter: BLURRED, scale: 1.1 } : false}
          animate={playing ? { filter: "blur(0px) saturate(1)", scale: 1 } : undefined}
          transition={{ delay: UNLOCK.lift, duration: UNLOCK.duration, ease: "easeOut" }}
        >
          <StoryBackground
            campaign={id}
            theme={theme}
            renders={renders}
            className={veiled}
            fallback={<TileMosaic plans={plans} renders={renders} className={cn("size-full aspect-auto", veiled)} />}
          />
        </m.span>
        {(locked || unlocking) && (
          // The veil and the painted lock over the picture's middle; unlocking, the lock opens (the painted open lock), then both go.
          <m.span
            aria-hidden
            data-slot="campaign-lock"
            className="absolute inset-0 grid place-items-center bg-background/35"
            initial={{ opacity: 1 }}
            animate={playing ? { opacity: 0 } : undefined}
            transition={{ delay: UNLOCK.fade, duration: 0.45 }}
          >
            <span className="relative grid size-16 place-items-center">
              <m.span className="absolute inset-0" initial={{ opacity: 1 }} animate={playing ? { opacity: 0 } : undefined} transition={{ delay: UNLOCK.turn, duration: 0.12 }}>
                <UiIcon name="lock" px={64} className="drawer-icon size-16" />
              </m.span>
              {unlocking && (
                <m.span
                  className="absolute inset-0"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={playing ? { opacity: 1, scale: [0.8, 1.3, 1] } : undefined}
                  transition={{ delay: UNLOCK.turn, duration: 0.45 }}
                >
                  <UiIcon name="unlock" px={64} className="drawer-icon size-16" />
                </m.span>
              )}
            </span>
          </m.span>
        )}
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-3/5" style={FOOT} />
        <span className="absolute inset-x-3 bottom-2 flex items-end justify-between gap-2">
          <span className="text-outline min-w-0 font-display text-2xl leading-tight tracking-wide wrap-anywhere">{name}</span>
          <span role="img" aria-label={`${formatInteger(stars)} of ${formatInteger(total)} stars`} className="flex shrink-0 items-center gap-1">
            <UiIcon name="star" px={24} className="drawer-icon size-6" />
            <span className="numeric text-outline text-base leading-tight font-bold">
              {formatInteger(stars)} / {formatInteger(total)}
            </span>
          </span>
        </span>
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-xl" style={FRAME} />
      </span>
      <span title={summary} className="line-clamp-2 px-1 text-sm leading-snug font-semibold text-muted-foreground">
        {summary}
      </span>
      <span data-slot="campaign-status" className="mt-auto flex items-center gap-1.5 px-1 pb-0.5 text-sm leading-tight font-bold">
        {locked ? (
          <>
            <UiIcon name="lock" px={20} className={LINE_ICON} />
            <span className="text-outline">Finish the {opensAfter} to open</span>
          </>
        ) : shown === "complete" ? (
          <>
            <UiIcon name="check" px={20} className={LINE_ICON} />
            <span className="text-outline text-success">Complete</span>
          </>
        ) : (
          <>
            <UiIcon name="tile-stack" px={20} className={LINE_ICON} />
            <span className="text-outline">
              <span className="numeric">{formatInteger(levels)}</span> levels
            </span>
          </>
        )}
      </span>
    </article>
  );
}
