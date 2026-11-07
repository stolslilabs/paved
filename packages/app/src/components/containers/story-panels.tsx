import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { formatInteger, type Stars } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { BLACK_OUTLINE } from "../elements/black-outline";
import { EMPTY_STAR } from "../elements/painted-stars";
import { StarRow } from "../elements/star-row";
import { planCode, type TileArt } from "../elements/tile-chip";
import { TileRender, type TileRenders } from "../elements/tile-render";
import { UiIcon } from "../elements/ui-icon";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";
import { EndChestPanel, END_STARS, GameEnd, ShowScores, XpRow, type EndChest, type EndXp } from "./game-end";

const CARD = "pointer-events-auto flex w-full max-w-2xl flex-col gap-3 rounded-xl border border-border bg-card/95 p-3 text-sm shadow-lg backdrop-blur tablet:p-4";

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
  /** Each star's share filled by the score, 0 to 1 (the Ranked end's bar, `GameEnd`'s `fills`); unset, the won ones full. Never a threshold. */
  fills?: readonly number[];
  /** The points this run was short of its next star; none at 3 stars. The thresholds themselves are never shown (#593). */
  toNextStar?: number | null;
  /** The level's target is the best score known, not a proven optimum. */
  bestKnown?: boolean;
  /** The best score before this run (none on a first finish). */
  previousBest?: number | null;
  /** The run scored above a best-known target: the plan can raise it. */
  beatsTarget?: boolean;
  /** The XP the run's report gave (`StoryReported.xp`) and the level it leaves; none (no report, nothing gained): no row. */
  xp?: EndXp | null;
  onReplay?: () => void;
  /** The next level; none after the last level, or while it is locked. */
  onNext?: () => void;
  /** A level follows but stays locked (a run with no star): Next shown, disabled, in its place. */
  nextLocked?: boolean;
  onLevels?: () => void;
  /**
   * The level's chest (END-CHEST, STORY-PAGE): won (3 stars the first time), opened here (`EndChestPanel`), or why this run won none
   * (`already`, `missed`); none, no panel.
   */
  chest?: EndChest;
  /** Seconds since the epoch (a capped chest's wait; a Story chest is never capped). */
  now?: number;
  tileArt?: TileArt;
  onOpenChest?: () => void;
  /** More under the result: Tutorial level 1's First Stone claim. */
  children?: ReactNode;
  className?: string;
}

/** The stars' last pop after its turn (s): the result under them comes in then. */
const POP = 0.45;

/** When the result under the stars comes in, seconds: the Ranked end's beats (`END_STARS`), after the last star won. */
export const resultDelay = (stars: number) => END_STARS.lead + Math.max(0, stars - 1) * END_STARS.gap + POP;

/** A row's large figure and its line under it, the crowns' row's (`CrownsRow`): outlined, the figure tabular. */
const FIGURE = "text-outline text-4xl leading-none font-bold tabular-nums";
const UNDER = "text-outline text-lg leading-tight font-bold text-muted-foreground";

/**
 * A finished level (#593, #546; END-SCREENS; STORY-PAGE: as close as its content allows to the Ranked end, `PvpEndScene`): over the
 * board, blurred, the book's window (`GameEnd`) crowned by its three painted stars on the Ranked end's beats and lights, each filling
 * with gold as the score goes (`fills`, never a threshold), "Level complete" and the level's title, the score; the carved card of rows
 * the Ranked end draws for its crowns and XP: the best (the trophy: the best score, a new best said with the one before it), the points
 * the next star was missing (never the thresholds), the XP the run's report gave (`XpRow`, only when it gave some); the level's chest
 * (`EndChestPanel`: to open here, or why this run won none: already won, or 3 stars win it); then the raised grey and gold answers on
 * one row (the owner's asks of 2026-11-06 and 2026-11-07): Retry, Levels and Next, or Retry and Levels in gold when no level follows;
 * with no star, "Level failed", Retry in gold and Next disabled in its place.
 * A tap skips the stars; under reduced motion they are there at once. The window's cross shows the finished board, the gold Scores
 * pill bringing the result back.
 */
export function StoryEnd({ title, score, stars, fills, toNextStar, bestKnown, previousBest, beatsTarget, xp, onReplay, onNext, nextLocked, onLevels, chest, now = 0, tileArt, onOpenChest, children, className }: StoryEndProps) {
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
  const best = Math.max(score, previousBest ?? score);
  const shortOf = toNextStar != null && toNextStar > 0 && stars < 3 ? toNextStar : null;
  // No star (the owner's ask of 2026-11-07): Retry is the gold answer, Next stays in its place, disabled (a control never leaves).
  const failed = stars === 0;
  const next = onNext !== undefined || Boolean(nextLocked);
  // The scores closed on the board (the window's cross, the Board's place, the owner's ask of 2026-11-06), the gold Scores pill to
  // bring them back, at once.
  if (peek) return <ShowScores onClick={() => setPeek(false)} />;
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  const rows = [
    <section key="best" aria-label="Best" data-record={record || undefined} className="flex min-w-0 flex-1 items-center gap-3">
      <UiIcon name="trophy" px={80} className="drawer-icon size-20 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={cn(FIGURE, record ? "text-primary" : "text-foreground")}>{formatInteger(best)}</span>
        {record ? (
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-outline text-lg leading-tight font-black text-primary">New best!</span>
            <span className={cn(UNDER, "tabular-nums")}>
              {formatInteger(previousBest!)} → {formatInteger(score)}
            </span>
          </span>
        ) : (
          <span className={UNDER}>Your best</span>
        )}
      </span>
    </section>,
  ];
  if (shortOf != null)
    rows.push(
      <section key="next" aria-label="Next star" data-testid="to-next-star" className="flex min-w-0 flex-1 items-center gap-3">
        <span aria-hidden className="drawer-icon size-20 shrink-0">
          <span className="block size-full" style={EMPTY_STAR}>
            <UiIcon name="star" px={80} className="size-full" />
          </span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-baseline gap-x-1.5">
            <span className={cn(FIGURE, "text-foreground")}>{formatInteger(shortOf)}</span>{" "}
            <span className="text-outline text-lg leading-tight font-bold text-foreground">{shortOf === 1 ? "point" : "points"}</span>
          </span>{" "}
          <span className={UNDER}>short of the next star</span>
        </span>
      </section>,
    );
  if (xp && xp.gained > 0)
    rows.push(
      <section key="xp" aria-label="Experience" className="flex min-w-0 flex-1 items-center gap-3">
        <XpRow gained={xp.gained} progress={{ level: xp.level, xp: xp.xp - xp.floor, xpForNext: xp.next - xp.floor }} levelUp={xp.level > xp.levelBefore} />
      </section>,
    );
  return (
    <div
      className={cn("pointer-events-auto fixed inset-0 z-50 bg-background/40 backdrop-blur-sm", !settled && "cursor-pointer")}
      onClick={() => {
        if (settled) return;
        setSkipped(true);
        setSettled(true);
      }}
    >
      <ScrollRegion className="h-full">
        {/* Clipped across: the stars' light spreads past a phone's edges, and the region must not scroll sideways (WRAP360). */}
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center overflow-x-clip px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <section aria-label="Level complete" data-testid="story-end" data-stars={stars} className={className}>
            <GameEnd
              stars={stars}
              fills={fills}
              instant={instant}
              verdict={failed ? "Level failed" : "Level complete"}
              subtitle={<span className="wrap-anywhere">{title}</span>}
              score={formatInteger(score)}
              rows={rows}
              notes={
                (stars === 3 || beatsTarget) && (
                  <m.div
                    key={instant ? "result-instant" : "result-fill"}
                    className="flex w-full flex-col items-center gap-1.5 text-sm font-semibold text-primary"
                    initial={instant ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: resultDelay(stars), duration: 0.35 }}
                  >
                    {beatsTarget ? (
                      <p role="status">You beat the best score known for this level. It was found by a search, not proven: yours is better.</p>
                    ) : (
                      <p>{bestKnown ? "Three stars: the best score known for this level." : "Three stars: the best score there is."}</p>
                    )}
                  </m.div>
                )
              }
              chest={
                chest && chest.state !== "none" ? (
                  <section aria-label="Chest" data-state={chest.state} aria-disabled={chest.state === "unavailable" || chest.state === "already" || chest.state === "missed" || undefined} className="w-full" onClick={stop}>
                    <EndChestPanel chest={chest} now={now} tileArt={tileArt} onOpen={onOpenChest} />
                  </section>
                ) : undefined
              }
              secondary={{ label: "Retry", onClick: onReplay, tone: failed ? "gold" : undefined }}
              middle={next ? { label: "Levels", onClick: onLevels } : undefined}
              primary={
                next
                  ? { label: "Next", onClick: onNext, disabled: !onNext, tone: failed || !onNext ? "raised" : undefined }
                  : { label: "Levels", onClick: onLevels, tone: failed ? "raised" : undefined }
              }
              onClose={() => {
                setSkipped(true);
                setSettled(true);
                setPeek(true);
              }}
            >
              {children && (
                <div className="w-full text-left" onClick={stop}>
                  {children}
                </div>
              )}
            </GameEnd>
          </section>
        </div>
      </ScrollRegion>
    </div>
  );
}

/** First Stone's Claim: the raised grey answer (the drawers' raised press; the end's gold is Next), its word outlined in black. */
const CLAIM: CSSProperties = { textShadow: BLACK_OUTLINE };

export interface FirstStonePanelProps {
  /** Its state in a line: looking for the account, checking, yours to claim, claimed, claimed before. */
  line: string;
  /** Claimable: Claim. None: no Claim. */
  onClaim?: () => void;
  claiming?: boolean;
  /** Under it: a refused claim (`InlineError`). */
  error?: ReactNode;
}

/**
 * First Stone (D-21) under Tutorial level 1's result (STORY-PAGE): a carved row as the end's chest panel, the painted medal (an
 * achievement), its name and its state, the raised grey Claim at its end while it can be claimed; a refused claim under it.
 */
export function FirstStonePanel({ line, onClaim, claiming, error }: FirstStonePanelProps) {
  return (
    <div data-testid="first-stone" className="flex flex-col gap-2">
      <div className="drawer-carved flex items-center gap-3 rounded-2xl px-3 py-2.5">
        <UiIcon name="medal" px={56} className="drawer-icon size-14 shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-outline text-base leading-tight font-bold">First Stone</span>
          <span role="status" className="text-xs leading-snug font-semibold text-muted-foreground">
            {line}
          </span>
        </span>
        {onClaim && (
          <Button variant="ghost" aria-label="Claim First Stone" style={CLAIM} className="drawer-raised h-11 shrink-0 rounded-xl px-4 text-base font-black text-foreground" onClick={onClaim} loading={claiming}>
            Claim
          </Button>
        )}
      </div>
      {error}
    </div>
  );
}

