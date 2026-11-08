import { PUZZLE_PRIZE_COBBLES, PUZZLE_TILES, formatInteger } from "@paved/game-core";
import type { PuzzleStanding } from "../../data/puzzle-source";
import { cn } from "../../lib/utils";
import { formatDay } from "../elements/day-picker";
import { GOLD_ACTION, GoldShine } from "../elements/gold-action";
import { Icon } from "../ui/icon";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { rankingArtSources } from "../elements/ranking-art";
import { SectionTitle } from "../elements/section-title";
import { TokenIcon } from "../elements/token-icon";
import { UiIcon } from "../elements/ui-icon";
import { DrawerFooter } from "../containers/hud-drawer";
import { PuzzleRankRow } from "../containers/leaderboard";
import { ModeIcon, PUZZLE_LATE_S, puzzleTimeLeft } from "../containers/play-modes";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

export interface PuzzleSceneProps {
  /** Today's leaderboard; null while it is read. */
  standing: PuzzleStanding | null;
  /** Why it could not be read, with Retry. */
  error?: string | null;
  errorDetail?: ErrorDetail;
  onRetry?: () => void;
  /** Seconds since the epoch: the day's time left. */
  now: number;
  /** The viewer: their row in gold. */
  me?: string | null;
  /** The player's game of today still open: its score; the footer's Play becomes Resume. Null: none. */
  playing?: { score: number } | null;
  /** A game on its way to start (`start`): Play waits. */
  starting?: boolean;
  onPlay?: () => void;
  /** Today's deck: the deck sheet on the day's 38 cards. */
  onDeck?: () => void;
  onOpenPlayer?: (address: string) => void;
}

/** Whether two player IDs are one, whatever their leading zeros (`0x05f1` and `0x5f1`). */
function sameAddress(a: string, b: string): boolean {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return a === b;
  }
}

/** A soft rule between two of the day's figures: the bevel's grey, half see-through (the Free card's rows'). */
const RULE = "border-l border-[color-mix(in_oklab,var(--drawer-bevel)_45%,transparent)]";

/** One of the day's figures: its painted icon, the figure outlined, its word under it. */
function Figure({ art, value, word, warn, className }: { art: "countdown" | "tile-stack" | "trophy"; value: string; word: string; warn?: boolean; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1", className)}>
      <UiIcon name={art} px={28} className="drawer-icon size-7" />
      <span className={cn("numeric text-outline text-base leading-tight font-bold", warn && "text-warning")}>{value}</span>
      <span className="text-xs font-semibold text-muted-foreground">{word}</span>
    </div>
  );
}

/**
 * The Puzzle (`/play/puzzle`, Play's Limited mode, the owner's approved mockups of 2026-11-08): a view of Play's drawer, as Story's
 * campaigns, its Back to the modes. On the page itself (no frame): the jigsaw tile (the Puzzle's icon), "Daily Puzzle", the day and its number, then
 * the day's figures: the time left (amber under an hour), the deck's 38 tiles, how many played. The prize in a carved strip on the gold
 * wash: the gold medal, "First place wins" (the owner's ask: one winner, no plural to read), at 00:00 UTC, 250 Cobbles. Today's deck, a raised row: the deck
 * sheet on the day's cards. Today's leaderboard (`PuzzleRankRow`, Ranking's rows with the score), the viewer's row in gold, listed after
 * the others when past the list. In the drawer's footer: the viewer's best of the day and their place, and the gold Play (Resume while a
 * game of theirs is open).
 */
export function PuzzleScene({ standing, error, errorDetail, onRetry, now, me = null, playing = null, starting = false, onPlay, onDeck, onOpenPlayer }: PuzzleSceneProps) {
  const left = standing ? standing.endsAt - now : 0;
  const mine = standing?.me ?? null;
  const own = (address: string) => me !== null && sameAddress(address, me);
  const listed = standing?.entries.some((e) => own(e.profile.address)) ?? false;
  return (
    <section aria-label="Puzzle" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <ModeIcon mode="puzzle" px={72} className="w-18 [filter:drop-shadow(0_3px_0_var(--hud-outline))]" />
          <div className="flex min-w-0 flex-col">
            <h2 className="text-outline font-display text-[1.75rem] leading-tight font-bold">Daily Puzzle</h2>
            {standing ? (
              <span className="text-sm font-semibold text-muted-foreground">
                {formatDay(standing.day)} · Day <span className="numeric">#{standing.day}</span>
              </span>
            ) : (
              <Skeleton className="h-4 w-40" />
            )}
          </div>
        </div>
        <div role="group" aria-label="Today" className="flex">
          <Figure art="countdown" value={standing ? puzzleTimeLeft(standing.endsAt, now) : "…"} word="left" warn={standing !== null && left < PUZZLE_LATE_S} />
          <Figure art="tile-stack" value={formatInteger(PUZZLE_TILES)} word="tiles" className={RULE} />
          <Figure art="trophy" value={standing ? formatInteger(standing.players) : "…"} word="played" className={RULE} />
        </div>
      </div>

      <div data-slot="puzzle-prize" className="drawer-carved flex items-center gap-3 rounded-2xl bg-linear-to-b from-primary/15 to-primary/5 px-3.5 py-2.5">
        <img {...rankingArtSources("medal-gold", 40)} alt="" draggable={false} decoding="async" className="drawer-icon size-10 shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-outline text-base leading-tight font-bold">First place wins</span>
          <span className="text-[0.8125rem] font-semibold text-muted-foreground">At 00:00 UTC</span>
        </span>
        <span role="img" aria-label={`${PUZZLE_PRIZE_COBBLES} Cobbles`} className="flex shrink-0 items-center gap-1">
          <TokenIcon kind="cobbles" size="lg" className="drawer-icon size-8" px={32} />
          <span aria-hidden className="numeric text-outline text-xl font-bold text-medal-1">
            {PUZZLE_PRIZE_COBBLES}
          </span>
        </span>
      </div>

      <button type="button" onClick={onDeck} className="drawer-tile state-layer flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 text-left">
        <UiIcon name="tile-stack" px={36} className="drawer-icon size-9 shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-outline text-base leading-tight font-bold">Today's deck</span>
          <span className="text-[0.8125rem] font-semibold text-muted-foreground">The {PUZZLE_TILES} tiles everyone plays today</span>
        </span>
        <Icon name="chevron-right" size="sm" className="text-muted-foreground" />
      </button>

      <section aria-labelledby="puzzle-today" className="flex flex-col gap-2">
        <SectionTitle id="puzzle-today">
          <UiIcon name="trophy" px={28} className="drawer-icon size-7 self-center" />
          Today
        </SectionTitle>
        {error ? (
          <InlineError
            title="Today's leaderboard"
            message={error}
            detail={errorDetail}
            action={
              onRetry && (
                <Button size="sm" variant="secondary" onClick={onRetry}>
                  Try again
                </Button>
              )
            }
          />
        ) : standing === null ? (
          <div aria-busy className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : standing.entries.length === 0 ? (
          <p className="drawer-carved rounded-xl px-4 py-6 text-center text-sm font-semibold text-muted-foreground">No one has played today yet. Be the first!</p>
        ) : (
          <ol aria-label="Today's leaderboard" className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
            {standing.entries.map((e) => (
              <li key={e.profile.address}>
                <PuzzleRankRow profile={e.profile} place={e.place} score={e.score} own={own(e.profile.address)} onOpen={() => onOpenPlayer?.(e.profile.address)} />
              </li>
            ))}
          </ol>
        )}
        {standing && mine && !listed && me !== null && (
          <p className="text-center text-sm font-semibold text-muted-foreground">
            You are <span className="numeric text-foreground">#{formatInteger(mine.place)}</span> with <span className="numeric text-foreground">{formatInteger(mine.score)}</span>.
          </p>
        )}
      </section>

      <DrawerFooter>
        {/* Story's footer: the player's day on the left, the gold Play on the right, the header's height. */}
        <div data-slot="puzzle-footer" className="flex min-h-16 items-center gap-3 px-4 py-2">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm leading-tight font-semibold text-muted-foreground">{playing ? "Your game in play" : "Your best today"}</span>
            {playing ? (
              <span className="text-outline flex items-center gap-1.5 text-lg leading-snug font-bold">
                <UiIcon name="star" px={20} className="drawer-icon size-5" />
                <span className="numeric">{formatInteger(playing.score)}</span>
              </span>
            ) : mine ? (
              <span className="text-outline flex items-center gap-1.5 text-lg leading-snug font-bold">
                <UiIcon name="star" px={20} className="drawer-icon size-5" />
                <span className="numeric">{formatInteger(mine.score)}</span>
                <span className="numeric text-base text-muted-foreground">· #{formatInteger(mine.place)}</span>
              </span>
            ) : (
              <span className="text-outline text-base leading-snug font-bold">Not played yet</span>
            )}
          </span>
          <Button
            variant="ghost"
            style={GOLD_ACTION}
            className="relative h-12 min-w-28 shrink-0 px-1 text-lg font-black text-foreground mobile:text-xl"
            disabled={starting || !standing}
            aria-busy={starting || undefined}
            onClick={onPlay}
          >
            {!starting && standing && <GoldShine />}
            {playing ? "Resume" : "Play"}
          </Button>
        </div>
      </DrawerFooter>
    </section>
  );
}
