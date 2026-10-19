import type { ReactNode } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { formatInteger, type Stars } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { StarRow } from "../elements/star-row";
import { TileMosaic, type TileRenders } from "../elements/tile-render";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";

const CARD = "pointer-events-auto flex w-full max-w-2xl flex-col gap-3 rounded-xl border border-border bg-card/95 p-3 text-sm shadow-lg backdrop-blur tablet:p-4";

/** What a level asks for: its target, labelled exact or best known, and the 2-star score. */
export interface StoryTargets {
  target: number;
  twoStars: number;
  /** The target is the best score a search found, not a proven optimum. */
  bestKnown: boolean;
}

function TargetLine({ target, twoStars, bestKnown }: StoryTargets) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1">
      <dt>
        <StarRow stars={3} size="xs" label="3 stars" />
      </dt>
      <dd className="numeric">
        {formatInteger(target)}
        {bestKnown && <span className="text-muted-foreground"> (best known)</span>}
      </dd>
      <dt>
        <StarRow stars={2} size="xs" label="2 stars" />
      </dt>
      <dd className="numeric">{formatInteger(twoStars)}</dd>
      <dt>
        <StarRow stars={1} size="xs" label="1 star" />
      </dt>
      <dd>Finish the level</dd>
    </dl>
  );
}

export interface StoryIntroProps extends StoryTargets {
  campaign: string;
  levelIndex: number;
  title: string;
  intro: string;
  tiles: number;
  /** The best score so far on this device, with its stars. */
  best?: { score: number; stars: Stars } | null;
  onStart?: () => void;
  className?: string;
}

/** A level's intro (#546): what it teaches, its deck size, the stars it asks for; Start opens the board. */
export function StoryIntro({ campaign, levelIndex, title, intro, tiles, best, onStart, className, ...targets }: StoryIntroProps) {
  return (
    <section aria-label="Level intro" data-testid="story-intro" className={cn(CARD, className)}>
      <span className="text-xs text-muted-foreground">
        {campaign} · Level {levelIndex} · <span className="numeric">{tiles}</span> tiles
      </span>
      <h2 className="font-display text-base font-semibold wrap-anywhere">{title}</h2>
      <p className="wrap-anywhere">{intro}</p>
      <TargetLine {...targets} />
      {best && (
        <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
          Your best: <span className="numeric text-foreground">{formatInteger(best.score)}</span> <StarRow stars={best.stars} size="xs" />
        </p>
      )}
      <Button className="self-start" onClick={onStart}>
        <Icon name="play" size="sm" /> Start
      </Button>
    </section>
  );
}

export interface StoryCoachProps {
  /** The tip: it names the control it points at, which the board rings. */
  tip: string;
  onDismiss?: () => void;
  className?: string;
}

/** A coach mark's text (#546): one tip under the header while the control it names is ringed on the board. */
export function StoryCoach({ tip, onDismiss, className }: StoryCoachProps) {
  return (
    <section aria-label="Tip" data-testid="story-coach" className={cn(CARD, "flex-row items-start gap-2 py-2", className)}>
      <Icon name="book-open" size="sm" className="mt-0.5 shrink-0 text-primary" />
      <p role="status" aria-live="polite" className="min-w-0 flex-1 wrap-anywhere">
        {tip}
      </p>
      {onDismiss && (
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Got it
        </Button>
      )}
    </section>
  );
}

export interface StoryEndProps extends StoryTargets {
  title: string;
  score: number;
  stars: Stars;
  /** The best score before this run (none on a first finish). */
  previousBest?: number | null;
  /** The run scored above a best-known target: the plan can raise it. */
  beatsTarget?: boolean;
  onReplay?: () => void;
  /** The next level; none after the last level, or while it is locked. */
  onNext?: () => void;
  onLevels?: () => void;
  /** More under the result: Tutorial level 1's First Stone claim. */
  children?: ReactNode;
  className?: string;
}

/** A finished level (#546): the stars, the score against the target (and whether it is the best known), Replay and Next. */
export function StoryEnd({ title, score, stars, previousBest, beatsTarget, onReplay, onNext, onLevels, children, className, ...targets }: StoryEndProps) {
  const record = previousBest != null && score > previousBest;
  return (
    <section aria-label="Level complete" data-testid="story-end" data-stars={stars} className={cn(CARD, className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold wrap-anywhere">{title}: complete</h2>
        <StarRow stars={stars} size="md" />
      </div>
      <p>
        Score <span className="numeric font-semibold">{formatInteger(score)}</span> of {targets.bestKnown ? "the best known " : ""}
        <span className="numeric">{formatInteger(targets.target)}</span>.
        {record && <span className="text-primary"> A new best for you.</span>}
      </p>
      {beatsTarget && (
        <p role="status" className="text-primary">
          You beat the best score known for this level. It was found by a search, not proven: yours is better.
        </p>
      )}
      <TargetLine {...targets} />
      {children}
      <div className="flex flex-wrap gap-2">
        {onNext && (
          <Button size="sm" onClick={onNext}>
            Next level
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={onReplay}>
          Replay
        </Button>
        <Button size="sm" variant="ghost" onClick={onLevels}>
          Levels
        </Button>
      </div>
    </section>
  );
}

/**
 * A campaign card's state (#592): open, locked (blurred, its condition stated), unlocking (opened since the device last showed
 * the list: the lock goes and the blur lifts, once), complete (every level finished).
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
  /** Locked: the stars still to earn over the campaigns before it. */
  missing?: number;
  /** The plans of its decks (chain ids), the first eight drawn as its background. */
  plans: readonly number[];
  renders?: TileRenders;
  /** Its levels are the ones shown under the cards. */
  selected?: boolean;
  onSelect?: () => void;
  className?: string;
}

/** The unlock's timeline, in seconds: the lock turns open, the blur lifts, the lock goes. */
const UNLOCK = { turn: 0.5, lift: 0.8, duration: 0.9, fade: 1.3 } as const;
const BLURRED = "blur(14px) saturate(0.5)";

/**
 * One campaign (#592): its tiles as a background (build-time renders, no WebGL), its name, summary, levels and stars. A locked
 * one shows its background under a blur, a lock and the stars it still needs; an unlocking one plays the unlock once (at
 * once under reduced motion). Pressing it shows its levels.
 */
export function CampaignCard({ id, name, summary, levels, stars, status, missing = 0, plans, renders, selected, onSelect, className }: CampaignCardProps) {
  const reduced = useReducedMotionConfig();
  const shown: CampaignStatus = status === "unlocking" && reduced ? "open" : status;
  const locked = shown === "locked";
  const unlocking = shown === "unlocking";
  const total = levels * 3;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected ?? false}
      data-campaign={id}
      data-status={shown}
      className={cn(
        "state-layer group relative flex aspect-[16/10] w-full cursor-pointer flex-col justify-end overflow-hidden rounded-xl border bg-card text-left text-card-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary ring-1 ring-primary" : "border-border",
        className,
      )}
    >
      <m.span
        className="absolute inset-0"
        initial={unlocking ? { filter: BLURRED, scale: 1.1 } : false}
        animate={unlocking ? { filter: "blur(0px) saturate(1)", scale: 1 } : undefined}
        transition={{ delay: UNLOCK.lift, duration: UNLOCK.duration, ease: "easeOut" }}
      >
        <TileMosaic plans={plans} renders={renders} className={cn("size-full aspect-auto", locked && "scale-110 blur-[14px] saturate-50")} />
      </m.span>
      <span aria-hidden className="absolute inset-0 bg-linear-to-t from-card via-card/75 to-transparent" />
      {(locked || unlocking) && (
        <m.span
          aria-hidden
          className="absolute inset-0 bg-background/35"
          initial={{ opacity: 1 }}
          animate={unlocking ? { opacity: 0 } : undefined}
          transition={{ delay: UNLOCK.fade, duration: 0.45 }}
        >
          <span className="absolute top-3 right-3 grid size-11 place-items-center rounded-full border border-border bg-card/90 text-foreground shadow-lg">
            <m.span className="absolute" initial={{ opacity: 1 }} animate={unlocking ? { opacity: 0 } : undefined} transition={{ delay: UNLOCK.turn, duration: 0.12 }}>
              <Icon name="lock" size="md" />
            </m.span>
            {unlocking && (
              <m.span
                className="absolute text-primary"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: [0.8, 1.3, 1] }}
                transition={{ delay: UNLOCK.turn, duration: 0.45 }}
              >
                <Icon name="lock-open" size="md" />
              </m.span>
            )}
          </span>
        </m.span>
      )}
      <span className="relative flex flex-col gap-1 p-4">
        <span className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-display text-xl font-semibold">{name}</span>
          {shown === "complete" && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
              <Icon name="circle-check" size="xs" /> Complete
            </span>
          )}
        </span>
        <span className="line-clamp-2 text-sm text-muted-foreground">{summary}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="numeric text-muted-foreground">{levels} levels</span>
          <span className="numeric flex items-center gap-1" aria-label={`${stars} of ${total} stars`}>
            <Icon name="star" size="sm" className="text-primary" />
            {stars} / {total}
          </span>
          {locked && (
            <span className="flex items-center gap-1 font-semibold text-foreground">
              <Icon name="lock" size="xs" /> <span className="numeric">{missing}</span> more {missing === 1 ? "star" : "stars"} to open
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
