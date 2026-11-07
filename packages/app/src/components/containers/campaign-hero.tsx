import type { CSSProperties } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { StoryBackground, TileMosaic, type TileRenders } from "../elements/tile-render";
import { UiIcon } from "../elements/ui-icon";

/**
 * A campaign's state (#592): open, locked (its picture blurred, its condition stated), unlocking (opened since the device last showed
 * the list: the lock opens and goes, the blur lifts, once), complete (every level finished).
 */
export type CampaignStatus = "open" | "locked" | "unlocking" | "complete";

export interface CampaignHeroProps {
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
 * The picture fades into the drawer's body (the owner's ask of 2026-11-07): whole under the header, clear by the end of the words, so
 * they read on the body's own colour as the picture goes.
 */
const FADE: CSSProperties = {
  maskImage: "linear-gradient(to bottom, #000 35%, transparent)",
  WebkitMaskImage: "linear-gradient(to bottom, #000 35%, transparent)",
};
/** The status line's icons, 20 px. */
const LINE_ICON = "drawer-icon size-5";

/**
 * One campaign at the head of Story's view (#592; STORY-PAGE, the owner's ask of 2026-11-07: no card, the campaign written in the
 * drawer's body on its picture): its build-time picture in its theme (#721; its tiles' renders without one; no WebGL) from the header
 * down, edge to edge, fading into the body by the end of its words; over it a room for the painted lock, then its name (the view's
 * heading) and its stars (the painted star), its summary in full and a status line: its levels, the campaign to finish first while
 * locked (the painted lock), or Complete (the painted check). Every state has the same parts and the same room, so nothing moves
 * between states. A locked one shows its picture under a blur and the painted lock in the room; an unlocking one plays the unlock once
 * (the lock opens, the blur lifts, the lock goes; at once under reduced motion), when it is not `paused`. The carousel chooses it.
 */
export function CampaignHero({ id, name, summary, levels, stars, status, opensAfter = "Tutorial", theme = 0, plans, renders, paused, className }: CampaignHeroProps) {
  const reduced = useReducedMotionConfig();
  const shown: CampaignStatus = status === "unlocking" && reduced ? "open" : status;
  const locked = shown === "locked";
  const unlocking = shown === "unlocking";
  const playing = unlocking && !paused;
  const veiled = locked ? "scale-110 blur-[14px] saturate-50" : undefined;
  const total = levels * 3;
  const heading = `campaign-name-${id}`;
  return (
    <article
      aria-labelledby={heading}
      data-campaign={id}
      data-status={shown}
      data-unlock={unlocking ? (playing ? "playing" : "paused") : undefined}
      className={cn("relative isolate flex h-full flex-col gap-1.5 px-4 pb-1", className)}
    >
      <span aria-hidden data-slot="campaign-picture" className="absolute inset-0 -z-10 overflow-hidden" style={FADE}>
        {/* A size container: the tiles' patch without a picture covers the room as the picture does, its tiles kept square. */}
        <m.span
          className="absolute inset-0 [container-type:size]"
          initial={unlocking ? { filter: BLURRED, scale: 1.1 } : false}
          animate={playing ? { filter: "blur(0px) saturate(1)", scale: 1 } : undefined}
          transition={{ delay: UNLOCK.lift, duration: UNLOCK.duration, ease: "easeOut" }}
        >
          <StoryBackground
            campaign={id}
            theme={theme}
            renders={renders}
            className={veiled}
            fallback={<TileMosaic plans={plans} renders={renders} className={cn("absolute top-1/2 left-1/2 w-[max(100cqw,200cqh)] -translate-x-1/2 -translate-y-1/2", veiled)} />}
          />
        </m.span>
        {(locked || unlocking) && (
          // The veil over the picture; unlocking, it goes with the lock.
          <m.span
            className="absolute inset-0 bg-background/35"
            initial={{ opacity: 1 }}
            animate={playing ? { opacity: 0 } : undefined}
            transition={{ delay: UNLOCK.fade, duration: 0.45 }}
          />
        )}
      </span>
      {/* The room above the words, the same in every state: the painted lock in its middle while locked or unlocking. */}
      <span className="grid aspect-[2/1] flex-1 place-items-center">
        {(locked || unlocking) && (
          <m.span
            aria-hidden
            data-slot="campaign-lock"
            className="relative grid size-16 place-items-center"
            initial={{ opacity: 1 }}
            animate={playing ? { opacity: 0 } : undefined}
            transition={{ delay: UNLOCK.fade, duration: 0.45 }}
          >
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
          </m.span>
        )}
      </span>
      <span className="flex items-end justify-between gap-2">
        <h3 id={heading} className="text-outline min-w-0 font-display text-3xl leading-tight tracking-wide wrap-anywhere">
          {name}
        </h3>
        <span role="img" aria-label={`${formatInteger(stars)} of ${formatInteger(total)} stars`} className="flex shrink-0 items-center gap-1 pb-1">
          <UiIcon name="star" px={24} className="drawer-icon size-6" />
          <span className="numeric text-outline text-base leading-tight font-bold">
            {formatInteger(stars)} / {formatInteger(total)}
          </span>
        </span>
      </span>
      <p className="text-outline text-sm leading-snug font-semibold text-foreground/85">{summary}</p>
      <span data-slot="campaign-status" className="flex items-center gap-1.5 text-sm leading-tight font-bold">
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
