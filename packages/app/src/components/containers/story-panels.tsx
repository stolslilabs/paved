import { useEffect, useState, type ReactNode } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { formatInteger, type Stars } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { StarRow } from "../elements/star-row";
import { planCode } from "../elements/tile-chip";
import { StoryBackground, TileMosaic, TileRender, type TileRenders } from "../elements/tile-render";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";
import { useSfx } from "./audio-provider";

const CARD = "pointer-events-auto flex w-full max-w-2xl flex-col gap-3 rounded-xl border border-border bg-card/95 p-3 text-sm shadow-lg backdrop-blur tablet:p-4";

/** A short buzz where the device has one (`navigator.vibrate`); refused or absent, nothing. */
function buzz(ms: number) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(ms);
  } catch {
    // A browser that refuses it (no user gesture, a policy): no buzz.
  }
}

/** The whole presentation's entrance, seconds: the tiles land one after another within it, however many there are. */
const PRESENT_SECONDS = 0.9;

export interface DeckPresentationProps {
  campaign: string;
  levelIndex: number;
  title: string;
  intro: string;
  /** The level's tip (`StoryLevel.tip`, #721): one sentence, set apart under the tiles. None: no tip block. */
  tip?: string;
  /** The tiles the level deals after the starter, in draw order (chain plan ids). */
  deck: readonly number[];
  /** The campaign's tile theme (`StoryCampaign.theme`, #721): the tiles are drawn in it. Unset: 0 (Default). */
  theme?: number;
  /** The build-time renders the tiles are drawn from; the plan's chip without one. */
  renders?: TileRenders;
  /** The best score so far on this device, with its stars. */
  best?: { score: number; stars: Stars } | null;
  onStart?: () => void;
  className?: string;
}

/**
 * A level's opening (#593, #721): its title and intro, then the tiles it deals in draw order, in its campaign's theme,
 * numbered, the order the deck sheet shows (#613), landing one after another, then its tip, set apart under a bulb; a tap
 * anywhere, or Start, opens the board. No star threshold is shown. Under reduced motion the tiles are there at once.
 */
export function DeckPresentation({ campaign, levelIndex, title, intro, tip, deck, theme = 0, renders, best, onStart, className }: DeckPresentationProps) {
  const reduced = useReducedMotionConfig();
  const step = Math.min(0.07, PRESENT_SECONDS / Math.max(1, deck.length));
  // A plan the theme has no render of keeps the base one, as the deck sheet's (`deckArt`).
  const shownIn = (plan: number) => (renders?.(theme, planCode(plan).toLowerCase()) ? theme : 0);
  return (
    <section
      aria-label="Level deck"
      data-testid="deck-presentation"
      onClick={onStart}
      onKeyDown={(e) => {
        if (e.key === "Escape") onStart?.();
      }}
      className={cn("pointer-events-auto fixed inset-0 z-50 cursor-pointer bg-background/80 backdrop-blur-sm", className)}
    >
      {/* The veil stays whole; the content scrolls inside it with the edge hint (NO-SCROLLBARS, #609). */}
      <ScrollRegion className="h-full">
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-6 tablet:max-w-2xl">
          <m.header className="flex flex-col gap-1" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <span className="text-xs text-muted-foreground">
              {campaign} · Level {levelIndex}
            </span>
            <h2 className="font-display text-2xl font-semibold wrap-anywhere">{title}</h2>
            <p className="text-sm wrap-anywhere">{intro}</p>
          </m.header>
          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">
              This level deals <span className="numeric text-foreground">{deck.length}</span> {deck.length === 1 ? "tile" : "tiles"}, in this order:
            </span>
            <ol data-testid="presented-tiles" className="grid grid-cols-5 gap-2 tablet:grid-cols-8 desktop:grid-cols-10">
              {deck.map((plan, i) => (
                <m.li
                  key={i}
                  data-plan={plan}
                  data-theme={shownIn(plan)}
                  aria-label={`Tile ${i + 1}`}
                  className="relative aspect-square overflow-hidden rounded-lg border border-border bg-board shadow-md"
                  initial={reduced ? false : { opacity: 0, y: 14, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.25 + i * step, duration: 0.3, ease: "easeOut" }}
                >
                  <TileRender plan={plan} theme={shownIn(plan)} renders={renders} />
                  <span className="numeric absolute top-1 left-1 rounded-md bg-card/90 px-1.5 text-xs font-semibold text-card-foreground shadow-sm" aria-hidden>
                    {i + 1}
                  </span>
                </m.li>
              ))}
            </ol>
          </div>
          {tip && (
            <m.aside
              aria-label="Tip"
              data-testid="level-tip"
              className="flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/10 p-3"
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 + deck.length * step + 0.1, duration: 0.3 }}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                <Icon name="lightbulb" size="sm" />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-xs font-semibold tracking-wide text-primary uppercase">Tip</span>
                <span className="text-sm wrap-anywhere">{tip}</span>
              </span>
            </m.aside>
          )}
          {best && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              Your best: <span className="numeric text-foreground">{formatInteger(best.score)}</span> <StarRow stars={best.stars} size="xs" />
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              autoFocus
              onClick={(e) => {
                e.stopPropagation();
                onStart?.();
              }}
            >
              <Icon name="play" size="sm" /> Start
            </Button>
            <span className="text-xs text-muted-foreground">or tap anywhere</span>
          </div>
        </div>
      </ScrollRegion>
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

export interface StoryEndProps {
  title: string;
  score: number;
  stars: Stars;
  /** The points this run was short of its next star; none at 3 stars. The thresholds themselves are never shown (#593). */
  toNextStar?: number | null;
  /** The level's target is the best score known, not a proven optimum. */
  bestKnown?: boolean;
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

/** The stars' timeline, seconds: the first lands after `lead`, then one every `gap`; the rest of the screen after the last. */
const FILL = { lead: 0.35, gap: 0.5, pop: 0.45 } as const;

/** When the result under the stars comes in, seconds. */
export const resultDelay = (stars: number) => FILL.lead + Math.max(0, stars - 1) * FILL.gap + FILL.pop;

/**
 * The stars earned, filled one by one (#593): each lands with a pop, a sound (`place`, the last of three the `wonder`) and a
 * buzz where the device has one. `instant` (reduced motion, or a tap to skip) shows them at once, with one sound.
 */
export function StarFill({ stars, instant: skip = false, className }: { stars: Stars; instant?: boolean; className?: string }) {
  const play = useSfx();
  const reduced = useReducedMotionConfig() ?? false;
  const instant = skip || reduced;
  useEffect(() => {
    if (stars === 0) return;
    if (instant) {
      play(stars === 3 ? "wonder" : "place");
      buzz(40);
      return;
    }
    const timers = Array.from({ length: stars }, (_, i) =>
      setTimeout(
        () => {
          play(i === 2 ? "wonder" : "place");
          buzz(i === 2 ? 80 : 30);
        },
        (FILL.lead + i * FILL.gap) * 1000,
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [stars, instant, play]);
  return (
    <span role="img" aria-label={`${stars} of 3 stars`} data-stars={stars} data-testid="star-fill" className={cn("inline-flex items-end gap-2", className)}>
      {[1, 2, 3].map((n) => {
        const earned = n <= stars;
        return (
          <span key={n} className="relative inline-flex">
            <Icon name="star" className="text-5xl! text-muted-foreground/40" />
            {earned && (
              <m.span
                className="absolute inset-0 inline-flex text-primary"
                initial={instant ? false : { scale: 0, rotate: -40, opacity: 0 }}
                animate={{ scale: [0, 1.35, 1], rotate: 0, opacity: 1 }}
                transition={{ delay: FILL.lead + (n - 1) * FILL.gap, duration: FILL.pop, ease: "easeOut" }}
              >
                <Icon name="star" className="text-5xl!" />
              </m.span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/**
 * A finished level (#593, #546): over the board, the stars fill one by one, then the score screen: the score, a new best,
 * how many points the next star was missing (never the thresholds), Next, Replay and Levels. A tap skips the stars; under
 * reduced motion they are there at once. "Board" shows the finished board under a small bar that brings the result back.
 */
export function StoryEnd({ title, score, stars, toNextStar, bestKnown, previousBest, beatsTarget, onReplay, onNext, onLevels, children, className }: StoryEndProps) {
  const reduced = useReducedMotionConfig() ?? false;
  const [skipped, setSkipped] = useState(false);
  const [settled, setSettled] = useState(reduced);
  const [peek, setPeek] = useState(false);
  const instant = reduced || skipped;
  // Once the stars are in, a tap is a tap: nothing to skip, so nothing replays.
  useEffect(() => {
    if (settled) return;
    const timer = setTimeout(() => setSettled(true), resultDelay(stars) * 1000);
    return () => clearTimeout(timer);
  }, [settled, stars]);
  const record = previousBest != null && score > previousBest;
  if (peek) {
    return (
      <div className="pointer-events-auto fixed inset-x-0 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-50 flex justify-center px-4">
        <Button onClick={() => setPeek(false)} className="shadow-lg">
          <Icon name="star" size="sm" /> Show the result
        </Button>
      </div>
    );
  }
  return (
    <div className={cn("pointer-events-auto fixed inset-0 z-50 bg-background/80 backdrop-blur-sm", !settled && "cursor-pointer")} onClick={() => {
        if (settled) return;
        setSkipped(true);
        setSettled(true);
      }}
    >
      <ScrollRegion className="h-full">
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-6">
          <section aria-label="Level complete" data-testid="story-end" data-stars={stars} className={cn(CARD, "items-center gap-4 py-6 text-center", className)}>
            <h2 className="font-display text-lg font-semibold wrap-anywhere">{title}: complete</h2>
            <StarFill key={instant ? "stars-instant" : "stars-fill"} stars={stars} instant={instant} />
            <m.div
              key={instant ? "result-instant" : "result-fill"}
              className="flex w-full flex-col items-center gap-3"
              initial={instant ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: resultDelay(stars), duration: 0.35 }}
            >
              <p className="flex flex-col items-center gap-1">
                <span className="text-xs text-muted-foreground">Score</span>
                <span className="numeric font-display text-3xl font-semibold">{formatInteger(score)}</span>
                {record && <span className="text-primary">A new best for you.</span>}
              </p>
              {toNextStar != null && toNextStar > 0 && stars < 3 && (
                <p data-testid="to-next-star" className="flex items-center gap-1.5 text-muted-foreground">
                  <Icon name="star" size="xs" className="text-primary" />
                  <span>
                    <span className="numeric text-foreground">{formatInteger(toNextStar)}</span> {toNextStar === 1 ? "point" : "points"} short of the next star.
                  </span>
                </p>
              )}
              {stars === 3 && !beatsTarget && <p className="text-primary">{bestKnown ? "Three stars: the best score known for this level." : "Three stars: the best score there is."}</p>}
              {beatsTarget && (
                <p role="status" className="text-primary">
                  You beat the best score known for this level. It was found by a search, not proven: yours is better.
                </p>
              )}
              {children && (
                <div className="w-full text-left" onClick={(e) => e.stopPropagation()}>
                  {children}
                </div>
              )}
              <div className="flex flex-wrap justify-center gap-2" onClick={(e) => e.stopPropagation()}>
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
                <Button size="sm" variant="ghost" onClick={() => setPeek(true)}>
                  Board
                </Button>
              </div>
            </m.div>
          </section>
        </div>
      </ScrollRegion>
    </div>
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
  /** The campaign's tile theme (`StoryCampaign.theme`, 0 Default): its background is drawn in it. Unset: 0. */
  theme?: number;
  /** The plans of its decks (chain ids), the first eight drawn as its background when the build has no picture of it. */
  plans: readonly number[];
  renders?: TileRenders;
  /** Its levels are the ones shown under the cards. */
  selected?: boolean;
  /** Unlocking: holds the locked look while another motion runs (the carousel's), and plays the unlock once it is false (#615). */
  paused?: boolean;
  onSelect?: () => void;
  className?: string;
}

/** The unlock's timeline, in seconds: the lock turns open, the blur lifts, the lock goes. */
const UNLOCK = { turn: 0.5, lift: 0.8, duration: 0.9, fade: 1.3 } as const;
const BLURRED = "blur(14px) saturate(0.5)";

/**
 * One campaign (#592): its background (its build-time picture in its theme, #721; its tiles' renders without one; no WebGL),
 * its name, summary, levels and stars. A locked one shows its background under a blur, a lock and the stars it still needs;
 * an unlocking one plays the unlock once (at once under reduced motion), when it is not `paused`. Pressing it shows its levels.
 */
export function CampaignCard({ id, name, summary, levels, stars, status, missing = 0, theme = 0, plans, renders, selected, paused, onSelect, className }: CampaignCardProps) {
  const reduced = useReducedMotionConfig();
  const shown: CampaignStatus = status === "unlocking" && reduced ? "open" : status;
  const locked = shown === "locked";
  const unlocking = shown === "unlocking";
  const playing = unlocking && !paused;
  const veiled = locked ? "scale-110 blur-[14px] saturate-50" : undefined;
  const total = levels * 3;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected ?? false}
      data-campaign={id}
      data-status={shown}
      data-unlock={unlocking ? (playing ? "playing" : "paused") : undefined}
      className={cn(
        "state-layer group relative flex aspect-[16/10] w-full cursor-pointer flex-col justify-end overflow-hidden rounded-xl border bg-card text-left text-card-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary ring-1 ring-primary" : "border-border",
        className,
      )}
    >
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
      <span aria-hidden className="absolute inset-0 bg-linear-to-t from-card via-card/75 to-transparent" />
      {(locked || unlocking) && (
        <m.span
          aria-hidden
          className="absolute inset-0 bg-background/35"
          initial={{ opacity: 1 }}
          animate={playing ? { opacity: 0 } : undefined}
          transition={{ delay: UNLOCK.fade, duration: 0.45 }}
        >
          <span className="absolute top-3 right-3 grid size-11 place-items-center rounded-full border border-border bg-card/90 text-foreground shadow-lg">
            <m.span className="absolute" initial={{ opacity: 1 }} animate={playing ? { opacity: 0 } : undefined} transition={{ delay: UNLOCK.turn, duration: 0.12 }}>
              <Icon name="lock" size="md" />
            </m.span>
            {unlocking && (
              <m.span
                className="absolute text-primary"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={playing ? { opacity: 1, scale: [0.8, 1.3, 1] } : undefined}
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
          <span title={name} className="min-w-0 truncate font-display text-xl font-semibold">
            {name}
          </span>
          {shown === "complete" && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
              <Icon name="circle-check" size="xs" /> Complete
            </span>
          )}
        </span>
        <span title={summary} className="line-clamp-2 text-sm text-muted-foreground">
          {summary}
        </span>
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
