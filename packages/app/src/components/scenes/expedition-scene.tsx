import type { ReactNode } from "react";
import { EXPEDITION_DAYS, EXPEDITION_HAND, EXPEDITION_LEVEL, EXPEDITION_MAPS, EXPEDITION_RATION, EXPEDITION_TIERS, formatInteger, formatPercent, type ExpeditionSeason } from "@paved/game-core";
import type { ExpeditionBoardState, ExpeditionResult, ExpeditionState } from "../../data/expedition-source";
import { cn } from "../../lib/utils";
import { DrawerFooter } from "../containers/hud-drawer";
import { formatShortRemaining } from "../elements/countdown";
import { GOLD_ACTION, GoldShine } from "../elements/gold-action";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { SectionTitle } from "../elements/section-title";
import { TokenIcon } from "../elements/token-icon";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";

export interface ExpeditionSceneProps {
  /** The week as the viewer sees it; null while it is read. */
  state: ExpeditionState | null;
  /** Why it could not be read, with Retry. */
  error?: string | null;
  errorDetail?: ErrorDetail;
  onRetry?: () => void;
  /** Seconds since the epoch: the week's time left. */
  now: number;
  /** The write on its way: its button waits. */
  busy?: "open" | "claim" | null;
  /** Opens the board: the first visit writes the map, a day's first visit draws its tiles. */
  onOpen?: () => void;
  /** The Cobbles of last week's tier. */
  onClaim?: (week: number) => void;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const SEASON: Record<ExpeditionSeason, string> = { winter: "Winter", spring: "Spring", summer: "Summer", autumn: "Autumn" };

/** One figure of a carved row: the figure outlined, its word under it. A figure is never cut (WRAP360). */
function Figure({ value, word, tone }: { value: ReactNode; word: string; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1">
      <span className={cn("numeric text-outline text-lg leading-tight font-bold", tone)}>{value}</span>
      <span className="text-center text-xs font-semibold text-muted-foreground">{word}</span>
    </div>
  );
}

/** A landmark's row: done or not (a sign and a word, never the colour alone), its title, what it is worth or who did it. */
function LandmarkRow({ done, title, note, end }: { done: boolean; title: string; note?: ReactNode; end: ReactNode }) {
  return (
    <li data-done={done || undefined} className="flex min-h-12 items-center gap-3 px-3.5 py-1.5">
      <Icon name={done ? "check" : "flag"} size="sm" fixedWidth label={done ? "Done" : "To do"} className={done ? "text-success" : "text-muted-foreground"} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm leading-tight font-bold wrap-anywhere">{title}</span>
        {note && <span className="text-xs font-semibold text-muted-foreground">{note}</span>}
      </span>
      <span className="numeric text-outline shrink-0 text-base font-bold text-primary">{end}</span>
    </li>
  );
}

/** Last week's result: the tier and its Cobbles, the score's two parts, each landmark with the share of the week's explorers who did it. */
function ResultCard({ result, level, claiming, onClaim }: { result: ExpeditionResult; level: number | null; claiming: boolean; onClaim?: (week: number) => void }) {
  const locked = level !== null && level < EXPEDITION_LEVEL;
  return (
    <section aria-label="Last week's expedition" data-slot="expedition-result" className="drawer-carved flex flex-col gap-2.5 rounded-2xl bg-linear-to-b from-primary/15 to-primary/5 px-3.5 py-3">
      <div className="flex items-center gap-3">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">Last week · {result.map}</span>
          <span className="text-outline font-display text-2xl leading-tight font-bold">{result.tier ? result.tier.name : "No tier reached"}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className="numeric text-outline text-xl leading-none font-bold text-primary">{formatInteger(result.score)}</span>
          <span className="text-xs font-semibold text-muted-foreground">points</span>
        </span>
      </div>
      <p className="text-[0.8125rem] font-semibold text-muted-foreground">
        The board <span className="numeric text-foreground">{formatInteger(result.boardScore)}</span> · the landmarks <span className="numeric text-foreground">{formatInteger(result.bonus)}</span>
      </p>
      <ul aria-label="Last week's landmarks" className="drawer-rows flex flex-col overflow-hidden rounded-xl bg-background/30">
        {result.landmarks.map((l) => (
          <LandmarkRow key={l.id} done={l.done} title={l.title} end={formatPercent(l.share)} />
        ))}
      </ul>
      <p className="text-[0.8125rem] font-semibold text-muted-foreground">
        The share of the week's <span className="numeric text-foreground">{formatInteger(result.explorers)}</span> explorers who did each landmark. No names, no rank.
      </p>
      {result.tier &&
        (result.claimed ? (
          <span className="flex items-center gap-2 text-sm font-bold text-success">
            <Icon name="check" size="sm" /> {formatInteger(result.cobbles)} Cobbles claimed
          </span>
        ) : locked ? (
          <p data-slot="expedition-locked" className="text-sm font-semibold text-muted-foreground">
            Reach level {EXPEDITION_LEVEL} to claim your {formatInteger(result.cobbles)} Cobbles. You are level {level}.
          </p>
        ) : (
          <Button variant="secondary" className="h-11" disabled={claiming} aria-busy={claiming || undefined} onClick={() => onClaim?.(result.week)}>
            <TokenIcon kind="cobbles" size="sm" className="size-5" px={20} /> Claim +{formatInteger(result.cobbles)} Cobbles
          </Button>
        ))}
    </section>
  );
}

/** The viewer's board: its score and what is left to the next tier, the hand and the bag, the landmarks, the week's seven days. */
function BoardCard({ board, day }: { board: ExpeditionBoardState; day: number }) {
  return (
    <>
      <section aria-labelledby="expedition-board" className="flex flex-col gap-2">
        <SectionTitle id="expedition-board">Your board</SectionTitle>
        <div role="group" aria-label="Your board" className="drawer-carved flex rounded-2xl py-1.5">
          <Figure value={formatInteger(board.score)} word="points" tone="text-primary" />
          <Figure value={formatInteger(board.hand)} word="in hand" />
          <Figure value={formatInteger(board.toCome)} word="to come" />
        </div>
        <p data-slot="expedition-tier" className="drawer-carved rounded-2xl px-3.5 py-2.5 text-sm font-semibold text-muted-foreground">
          {board.tier && (
            <>
              <strong className="text-foreground">{board.tier.name}</strong> reached.{" "}
            </>
          )}
          {board.next ? (
            <>
              <span className="numeric font-bold text-foreground">{formatInteger(board.next.score - board.score)}</span> to go to {board.next.name}.
            </>
          ) : (
            "The highest tier."
          )}
        </p>
      </section>
      <section aria-labelledby="expedition-landmarks" className="flex flex-col gap-2">
        <SectionTitle id="expedition-landmarks">Landmarks</SectionTitle>
        <ul aria-label="Landmarks" className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
          {board.objectives.map((o) => (
            <LandmarkRow key={o.id} done={o.done} title={o.title} note={!o.done && o.count !== undefined ? `${o.count} of ${o.of} cells laid` : undefined} end={`+${formatInteger(o.bonus)}`} />
          ))}
        </ul>
      </section>
      <section aria-labelledby="expedition-journal" className="flex flex-col gap-2">
        <SectionTitle id="expedition-journal">Journal</SectionTitle>
        <ol aria-label="The week's days" className="drawer-carved grid grid-cols-7 rounded-2xl px-1 py-2">
          {board.days.map((d, i) => (
            <li key={DAYS[i]} data-today={i === day || undefined} className={cn("flex flex-col items-center gap-0.5 rounded-lg py-1", i === day && "bg-primary/15")}>
              <span className="text-xs font-bold text-muted-foreground">{DAYS[i]}</span>
              <span className="numeric text-outline text-base leading-tight font-bold">{i > day ? "·" : d.laid}</span>
              <span className="text-xs font-semibold text-muted-foreground">{i > day ? "" : "laid"}</span>
              {d.lost > 0 && <span className="numeric text-xs font-bold text-warning">−{d.lost}</span>}
            </li>
          ))}
        </ol>
        <p className="text-[0.8125rem] font-medium text-muted-foreground">
          <span className="numeric">{formatInteger(board.laid)}</span> {board.laid === 1 ? "tile" : "tiles"} laid. A ration that does not fit the hand of {EXPEDITION_HAND} is lost (shown with a minus).
        </p>
      </section>
    </>
  );
}

const STEPS: readonly [string, string][] = [
  ["Each day:", `${EXPEDITION_RATION} new tiles. The hand holds ${EXPEDITION_HAND}: a missed day costs nothing, longer loses tiles.`],
  ["On the map:", "lay a tile next to your trail, in any order. A landmark anchors nothing until your trail touches it."],
  ["Next Monday:", "your score's tier pays its Cobbles. No ranking."],
];

/** The week's map before the first visit: its landmarks and their bonuses, how the week goes. */
function Brief({ season }: { season: ExpeditionSeason }) {
  return (
    <>
      <section aria-labelledby="expedition-map" className="flex flex-col gap-2">
        <SectionTitle id="expedition-map">Four landmarks</SectionTitle>
        <ul aria-label="Landmarks" className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
          {EXPEDITION_MAPS[season].objectives.map((o) => (
            <LandmarkRow key={o.id} done={false} title={o.title} note={o.id === "landmark" ? "The season's landmark, the farthest from the camp" : undefined} end={`+${formatInteger(o.bonus)}`} />
          ))}
        </ul>
      </section>
      <section aria-labelledby="expedition-how" className="flex flex-col gap-2">
        <SectionTitle id="expedition-how">How it goes</SectionTitle>
        <ol className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
          {STEPS.map(([when, what]) => (
            <li key={when} className="px-3.5 py-2.5 text-sm font-semibold text-muted-foreground">
              <strong className="text-foreground">{when}</strong> {what}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

/** The four tiers and their Cobbles; the one reached is marked. */
function Tiers({ score }: { score: number | null }) {
  return (
    <section aria-labelledby="expedition-tiers" className="flex flex-col gap-2">
      <SectionTitle id="expedition-tiers">Tiers</SectionTitle>
      <ul aria-label="Tiers" className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
        {EXPEDITION_TIERS.map((t) => {
          const reached = score !== null && score >= t.score;
          return (
            <li key={t.id} data-reached={reached || undefined} className="flex min-h-11 items-center gap-3 px-3.5 py-1.5">
              <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-bold">
                {t.name}
                {reached && <Icon name="check" size="xs" label="reached" className="text-success" />}
              </span>
              <span className="numeric text-sm font-semibold text-muted-foreground">{formatInteger(t.score)}</span>
              <span className="numeric flex w-16 shrink-0 items-center justify-end gap-1 text-base font-bold text-primary">
                <TokenIcon kind="cobbles" size="sm" className="size-5" px={20} /> {formatInteger(t.cobbles)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-[0.8125rem] font-medium text-muted-foreground">
        The highest tier reached pays, claimed from the next Monday at level {EXPEDITION_LEVEL}. No XP and no chest, as Training.
      </p>
    </section>
  );
}

/**
 * The Expedition (`/play/expedition`, Play's Limited mode; the design proposal of 2026-11-09, one expedition a week on the client): a
 * view of Play's drawer, as the Joust's. The week's day and its time left; last week's result while there is one (the tier, the
 * score's parts, what everyone else reached, Claim from level 3); before the first visit the week's map (its four landmarks and how
 * it goes), then the viewer's board (its score and the next tier, the hand and the bag, the landmarks, the journal of the seven
 * days); the four tiers; in the footer the gold button that opens the board, a day's first visit drawing its tiles.
 */
export function ExpeditionScene({ state, error, errorDetail, onRetry, now, busy = null, onOpen, onClaim }: ExpeditionSceneProps) {
  if (error)
    return (
      <InlineError
        title="The Expedition"
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
    );
  if (state === null)
    return (
      <div aria-busy aria-label="Expedition" className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    );
  const board = state.board;
  const due = board?.due.drawn ?? 0;
  return (
    <section aria-label="Expedition" className="flex flex-col gap-4">
      <header className="flex flex-col gap-1.5">
        <span className="w-fit rounded-md bg-info px-2 py-0.5 text-xs leading-4 font-extrabold tracking-widest text-background uppercase">
          {SEASON[state.season]} · Day {state.day + 1} of {EXPEDITION_DAYS}
        </span>
        <h2 className="text-outline font-display text-[1.75rem] leading-tight font-bold">{state.map}</h2>
        <p role="timer" className="text-sm font-semibold text-muted-foreground">
          Ends Sunday at 24:00 UTC · in <span className="numeric text-foreground">{formatShortRemaining(state.endsAt - now)}</span>
        </p>
      </header>

      {state.result && <ResultCard result={state.result} level={state.level} claiming={busy === "claim"} onClaim={onClaim} />}

      {board ? <BoardCard board={board} day={state.day} /> : <Brief season={state.season} />}

      <Tiers score={board?.score ?? null} />

      <DrawerFooter>
        <div data-slot="expedition-footer" className="flex min-h-16 items-center gap-3 px-4 py-2">
          <Button variant="ghost" style={GOLD_ACTION} className="relative h-12 flex-1 px-2 text-lg font-black text-foreground" disabled={busy === "open"} aria-busy={busy === "open" || undefined} onClick={onOpen}>
            {busy !== "open" && <GoldShine />}
            {!board ? "Open the map" : due > 0 ? `Draw ${due} ${due === 1 ? "tile" : "tiles"}` : "Continue"}
          </Button>
        </div>
      </DrawerFooter>
    </section>
  );
}
