import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { formatInteger, type Stars } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { BLACK_OUTLINE } from "../elements/black-outline";
import { GOLD_ACTION, GoldShine } from "../elements/gold-action";
import { HudFrame } from "../elements/hud-frame";
import { EMPTY_STAR, PaintedStars } from "../elements/painted-stars";
import { SectionTitle } from "../elements/section-title";
import { planCode, type TileArt } from "../elements/tile-chip";
import { StoryBackground, TileRender, type TileRenders } from "../elements/tile-render";
import { UiIcon } from "../elements/ui-icon";
import { Button } from "../ui/button";
import { ScrollRegion } from "../ui/scroll-region";
import { EndChestPanel, END_STARS, GameEnd, ShowScores, XpRow, type EndChest, type EndXp } from "./game-end";

/** The tiles' deal, seconds: they land one after another within it, however many there are. */
const DEAL_SECONDS = 0.9;
/** When the first tile lands (s): the window is in. */
const DEAL_LEAD = 0.2;
/** A tile's landing (s). */
const LAND = 0.32;

export interface DeckPresentationProps {
  campaign: string;
  /** The campaign's id: its picture (`StoryBackground`, Story's campaign head) behind the level's name. Unset: no picture. */
  campaignId?: number;
  levelIndex: number;
  title: string;
  intro: string;
  /** The level's tip (`StoryLevel.tip`, #721): one sentence, in its carved box under the tiles. None: no box. */
  tip?: string;
  /** The tiles the level deals after the starter, in draw order (chain plan ids). */
  deck: readonly number[];
  /** The campaign's tile theme (`StoryCampaign.theme`, #721): the tiles are drawn in it. Unset: 0 (Default). */
  theme?: number;
  /** The build-time renders the tiles are drawn from; the plan's chip without one. */
  renders?: TileRenders;
  /** The best score so far on this device, with its stars; none: "No best yet". */
  best?: { score: number; stars: Stars } | null;
  onStart?: () => void;
  className?: string;
}

/** The deck page's grid (`deck-sheet.tsx`): four tiles a row on a carved panel. */
const GRID = "drawer-carved grid gap-1 self-center rounded-xl p-1";
const COLUMNS = 4;
/**
 * The grid's width: the whole row from four tiles; a shorter deck's panel hugs its tiles at the same tile size (the 2-tile Tutorial
 * level: half the row, in its middle), so a cell is the same whatever the deck.
 */
function gridStyle(tiles: number): CSSProperties {
  const columns = Math.max(1, Math.min(COLUMNS, tiles));
  return {
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    // The four columns' share, less the panel's padding (0.5rem) and three gaps (0.75rem), plus this grid's own.
    width: columns === COLUMNS ? "100%" : `calc((100% - 1.25rem) * ${columns / COLUMNS} + ${(columns - 1) * 0.25 + 0.5}rem)`,
  };
}

/** The campaign's picture behind the level's name (Story's campaign head): whole at the window's top, clear by the end of its words. */
const PICTURE: CSSProperties = {
  ["--hud-px" as string]: 16,
  bottom: "auto",
  height: "11rem",
  maskImage: "linear-gradient(to bottom, #000 30%, transparent)",
  WebkitMaskImage: "linear-gradient(to bottom, #000 30%, transparent)",
};

/**
 * A level's opening (#593, #721; STORY-INTRO: the Paved UX Book draws none, so each piece from the integrated page that shows the
 * same information). Over the blurred board, as the level's end (`StoryEnd`), the HUD's framed window (`HudFrame`): at its head the
 * level's campaign and number, its title in the display font and its intro, on the campaign's picture fading into the window (Story's
 * campaign head); then the tiles it deals (the deck page's: a section title with the painted pile and the count, its one short line,
 * the tiles seen from above in the campaign's theme, four a row on a carved panel, each numbered in draw order), landing one after
 * another; the tip in a carved box under the painted bulb; at the foot, as Story's footer, the device's best and its painted stars (or
 * "No best yet") on the left and the window's one gold action, Start, on the right. A tap anywhere, Escape or Start opens the board.
 * No star threshold is shown. Under reduced motion everything is there at once.
 */
export function DeckPresentation({ campaign, campaignId, levelIndex, title, intro, tip, deck, theme = 0, renders, best, onStart, className }: DeckPresentationProps) {
  const reduced = useReducedMotionConfig() ?? false;
  const step = Math.min(0.07, DEAL_SECONDS / Math.max(1, deck.length));
  const dealt = DEAL_LEAD + Math.max(0, deck.length - 1) * step + LAND;
  // A plan the theme has no top-down render of keeps the base one, as the deck page's (`deckArt`).
  const shownIn = (plan: number) => (renders?.(theme, `${planCode(plan).toLowerCase()}-top`) ? theme : 0);
  // Start takes the focus without scrolling to it (#1090): a long deck's opening on a short phone shows its head first, never its foot.
  const startRef = useRef<HTMLButtonElement>(null);
  useEffect(() => startRef.current?.focus({ preventScroll: true }), []);
  const after = (delay: number) => (reduced ? { initial: false as const } : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.25 } });
  return (
    <section
      aria-label="Level deck"
      data-testid="deck-presentation"
      onClick={onStart}
      onKeyDown={(e) => {
        if (e.key === "Escape") onStart?.();
      }}
      className={cn("pointer-events-auto fixed inset-0 z-50 cursor-pointer bg-background/40 backdrop-blur-sm", className)}
    >
      {/* The veil stays whole; the window scrolls inside it with the edge hint (NO-SCROLLBARS, #609). */}
      <ScrollRegion className="h-full">
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-3 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] mobile:px-4">
          <m.div
            data-slot="intro-window"
            className="relative isolate flex w-full flex-col gap-3 p-4 text-left"
            initial={reduced ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <HudFrame px={16} />
            {campaignId !== undefined && (
              <span aria-hidden data-slot="intro-picture" className="hud-face absolute -z-10 overflow-hidden" style={PICTURE}>
                <StoryBackground campaign={campaignId} theme={theme} renders={renders} fallback={null} />
              </span>
            )}
            <header className="flex flex-col gap-1">
              <span className="text-outline text-sm leading-tight font-bold text-foreground/85">
                {campaign} · Level <span className="numeric">{formatInteger(levelIndex)}</span>
              </span>
              <h2 className="text-outline font-display text-3xl leading-tight tracking-wide wrap-anywhere">{title}</h2>
              <p className="text-outline text-sm leading-snug font-semibold text-foreground/85 wrap-anywhere">{intro}</p>
            </header>
            <section aria-labelledby="intro-deck" className="flex flex-col gap-2">
              <SectionTitle id="intro-deck">
                <UiIcon name="tile-stack" px={28} className="drawer-icon size-7 self-center" />
                Deck <span className="numeric font-sans text-base font-bold text-muted-foreground">{formatInteger(deck.length)}</span>
              </SectionTitle>
              <p className="text-sm leading-snug font-semibold text-muted-foreground">Dealt in this order.</p>
              <ol aria-label="Tiles in draw order" data-testid="presented-tiles" className={GRID} style={gridStyle(deck.length)}>
                {deck.map((plan, i) => (
                  <m.li
                    key={i}
                    data-plan={plan}
                    data-theme={shownIn(plan)}
                    aria-label={`Tile ${i + 1}`}
                    className="flex flex-col items-center"
                    initial={reduced ? false : { opacity: 0, y: -12, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: DEAL_LEAD + i * step, duration: LAND, ease: "backOut" }}
                  >
                    <span className="relative block aspect-square w-full rounded-lg p-1.5">
                      <span className="block size-full overflow-hidden rounded-md shadow-[0_2px_0_var(--hud-outline)]">
                        <TileRender plan={plan} theme={shownIn(plan)} renders={renders} top className="scale-105" />
                      </span>
                    </span>
                    <span aria-hidden className="text-outline pb-1 text-xs leading-tight font-bold text-muted-foreground tabular-nums">
                      {i + 1}
                    </span>
                  </m.li>
                ))}
              </ol>
            </section>
            {tip && (
              <m.aside aria-label="Tip" data-testid="level-tip" className="drawer-carved flex items-center gap-3 rounded-2xl px-3 py-2.5" {...after(dealt)}>
                <UiIcon name="bulb" px={40} className="drawer-icon size-10 shrink-0" />
                <p className="min-w-0 flex-1 text-sm leading-snug font-semibold wrap-anywhere">{tip}</p>
              </m.aside>
            )}
            <div className="flex items-center gap-3 pt-1">
              <m.section
                aria-label={best ? `Your best: ${formatInteger(best.score)}, ${best.stars} of 3 stars` : "No best yet"}
                data-slot="intro-best"
                className="flex min-w-0 flex-1 items-center gap-2"
                {...after(dealt + 0.1)}
              >
                <span aria-hidden className="drawer-icon size-10 shrink-0">
                  <span className="block size-full" style={best ? undefined : EMPTY_STAR}>
                    <UiIcon name="trophy" px={40} className="size-full" />
                  </span>
                </span>
                {best ? (
                  <span aria-hidden className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-outline text-xl leading-none font-bold tabular-nums">{formatInteger(best.score)}</span>
                    <PaintedStars stars={best.stars} className="-ml-0.5" />
                  </span>
                ) : (
                  <span aria-hidden className="text-sm leading-snug font-semibold text-muted-foreground">
                    No best yet
                  </span>
                )}
              </m.section>
              <Button
                ref={startRef}
                variant="ghost"
                style={GOLD_ACTION}
                className="relative h-12 min-w-28 shrink-0 px-1 text-lg font-black text-foreground mobile:text-xl"
                onClick={(e) => {
                  e.stopPropagation();
                  onStart?.();
                }}
              >
                <GoldShine />
                Start
              </Button>
            </div>
          </m.div>
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

/** "Got it": the raised grey answer (the drawers' raised press), its word outlined in black as the end's. */
const GOT_IT: CSSProperties = { textShadow: BLACK_OUTLINE };

/**
 * A coach mark's text (#546; STORY-INTRO: the tip's look, the painted bulb and its words, as the level's opening shows its tip): one
 * tip under the header, on the HUD's frame as the header over it (the board's panels; a carved box belongs inside a frame), while the
 * control it names is ringed on the board; the raised grey "Got it" puts it away.
 */
export function StoryCoach({ tip, onDismiss, className }: StoryCoachProps) {
  return (
    <section aria-label="Tip" data-testid="story-coach" className={cn("pointer-events-auto relative isolate flex w-full max-w-2xl items-center gap-2.5 py-2 pr-2 pl-2.5", className)}>
      <HudFrame px={13} />
      <UiIcon name="bulb" px={36} className="drawer-icon size-9 shrink-0" />
      <p role="status" aria-live="polite" className="min-w-0 flex-1 text-sm leading-snug font-semibold wrap-anywhere">
        {tip}
      </p>
      {onDismiss && (
        <Button variant="ghost" style={GOT_IT} className="drawer-raised h-11 shrink-0 rounded-xl px-3 text-base font-black text-foreground" onClick={onDismiss}>
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

