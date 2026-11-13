import type { ReactNode } from "react";
import { DISCARD_POINTS, MASTERPIECE_DAILY, MASTERPIECE_DAYS, MASTERPIECE_FLOOR, MASTERPIECE_TIERS, formatInteger, type MasterpieceKind } from "@paved/game-core";
import type { MasterpieceBoardState, MasterpieceRanking, MasterpieceResult, MasterpieceRow, MasterpieceState } from "../../data/masterpiece-source";
import { cn } from "../../lib/utils";
import { DrawerFooter } from "../containers/hud-drawer";
import { formatShortRemaining } from "../elements/countdown";
import { GOLD_ACTION, GoldShine } from "../elements/gold-action";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { MASTERPIECE_KIND, pieceName, placeName, topShare } from "../elements/masterpiece-kind";
import { SectionTitle } from "../elements/section-title";
import { TokenIcon } from "../elements/token-icon";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";

/** The Masterpiece's views in Play's drawer: the week, the live ranking with the Hall. */
export type MasterpieceView = "week" | "ranking";

export interface MasterpieceSceneProps {
  /** The week as the viewer sees it; null while it is read. */
  state: MasterpieceState | null;
  /** Why it could not be read, with Retry. */
  error?: string | null;
  errorDetail?: ErrorDetail;
  onRetry?: () => void;
  /** Seconds since the epoch: the week's time left. */
  now: number;
  view?: MasterpieceView;
  /** The live ranking (the ranking's view); null while it is read. */
  ranking?: MasterpieceRanking | null;
  /** The write on its way: its button waits. */
  busy?: "open" | "claim" | null;
  /** Opens the board (the first visit creates it). */
  onOpen?: () => void;
  /** The Cobbles of last week's tier. */
  onClaim?: (week: number) => void;
  onRanking?: () => void;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** One figure of a carved row: the figure outlined, its word under it. A figure is never cut (WRAP360). */
function Figure({ value, word, tone }: { value: ReactNode; word: string; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1">
      <span className={cn("numeric text-outline text-lg leading-tight font-bold", tone)}>{value}</span>
      <span className="text-center text-xs font-semibold text-muted-foreground">{word}</span>
    </div>
  );
}

/** A tier's Cobbles at a row's end. */
function Cobbles({ amount }: { amount: number }) {
  return (
    <span className="numeric flex w-16 shrink-0 items-center justify-end gap-1 text-base font-bold text-primary">
      <TokenIcon kind="cobbles" size="sm" className="size-5" px={20} /> {formatInteger(amount)}
    </span>
  );
}

/** A line of a ranking: the place, the builder (the whole name in its `title`), the masterpiece and its score. */
function RankRow({ row, kind }: { row: MasterpieceRow; kind: MasterpieceKind }) {
  return (
    <li data-me={row.me || undefined} className={cn("flex min-h-12 items-center gap-3 px-3.5 py-1.5", row.me && "bg-primary/15")}>
      <span className="numeric text-outline w-9 shrink-0 text-base font-bold">{formatInteger(row.place)}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span title={row.name} className="truncate text-sm leading-tight font-bold">
          {row.name}
          {row.me && <span className="sr-only"> (you)</span>}
        </span>
        <span className="text-xs font-semibold text-muted-foreground">{pieceName(kind, row.size)}</span>
      </span>
      <span className="numeric text-outline shrink-0 text-base font-bold text-primary">{formatInteger(row.score)}</span>
    </li>
  );
}

/** Last week's result: the tier and its Cobbles, the place among the counted masterpieces, the piece, the week's master. */
function ResultCard({ result, claiming, onClaim }: { result: MasterpieceResult; claiming: boolean; onClaim?: (week: number) => void }) {
  const kind = MASTERPIECE_KIND[result.kind];
  return (
    <section aria-label="Last week's masterpiece" data-slot="masterpiece-result" className="drawer-carved flex flex-col gap-2.5 rounded-2xl bg-linear-to-b from-primary/15 to-primary/5 px-3.5 py-3">
      <div className="flex items-center gap-3">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">Last week · the {kind.name}</span>
          <span className="text-outline font-display text-2xl leading-tight font-bold">{result.tier ? (result.tier.id === "counted" ? "Counted" : result.tier.name) : "Not counted"}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className="numeric text-outline text-xl leading-none font-bold text-primary">{formatInteger(result.score)}</span>
          <span className="text-xs font-semibold text-muted-foreground">points</span>
        </span>
      </div>
      <p className="text-[0.8125rem] font-semibold text-muted-foreground">
        {result.piece ? (
          <>
            Your masterpiece: <strong className="text-foreground">{pieceName(result.kind, result.piece.size)}</strong>
            {result.place !== null ? (
              <>
                , <span className="numeric text-foreground">{placeName(result.place)}</span> of <span className="numeric text-foreground">{formatInteger(result.builders)}</span>.
              </>
            ) : (
              <>. Only a masterpiece of {MASTERPIECE_FLOOR} or more is counted.</>
            )}
          </>
        ) : (
          <>You closed no {kind.name}: nothing to count.</>
        )}
      </p>
      {result.master && (
        <p data-slot="masterpiece-master" className="text-[0.8125rem] font-semibold text-muted-foreground">
          The week's master: <strong className="text-foreground wrap-anywhere">{result.master.me ? "you" : result.master.name}</strong>, {pieceName(result.kind, result.master.size).toLowerCase()} ·{" "}
          <span className="numeric text-foreground">{formatInteger(result.master.score)}</span>
        </p>
      )}
      {result.tier &&
        (result.claimed ? (
          <span className="flex items-center gap-2 text-sm font-bold text-success">
            <Icon name="check" size="sm" /> {formatInteger(result.cobbles)} Cobbles claimed
          </span>
        ) : (
          <Button variant="secondary" className="h-11" disabled={claiming} aria-busy={claiming || undefined} onClick={() => onClaim?.(result.week)}>
            <TokenIcon kind="cobbles" size="sm" className="size-5" px={20} /> Claim +{formatInteger(result.cobbles)} Cobbles
          </Button>
        ))}
    </section>
  );
}

/** The viewer's board: the masterpiece so far and its live place, what they are growing, the tiles waiting, the week's seven days. */
function BoardCard({ board, kind, day, builders }: { board: MasterpieceBoardState; kind: MasterpieceKind; day: number; builders: number }) {
  const name = MASTERPIECE_KIND[kind].name;
  return (
    <>
      <section aria-labelledby="masterpiece-board" className="flex flex-col gap-2">
        <SectionTitle id="masterpiece-board">Your masterpiece</SectionTitle>
        <div role="group" aria-label="Your masterpiece" className="drawer-carved flex rounded-2xl py-1.5">
          <Figure value={formatInteger(board.score)} word="points" tone="text-primary" />
          <Figure value={board.piece ? formatInteger(board.piece.size) : "–"} word="tiles" />
          <Figure value={formatInteger(board.waiting)} word="waiting" />
          <Figure value={formatInteger(board.toCome)} word="to come" />
        </div>
        <p data-slot="masterpiece-piece" className="drawer-carved rounded-2xl px-3.5 py-2.5 text-sm font-semibold text-muted-foreground">
          {board.piece ? (
            <>
              <strong className="text-foreground">{pieceName(kind, board.piece.size)}</strong>, <span className="numeric text-foreground">{formatInteger(board.piece.points)}</span> points
              {board.discards > 0 && (
                <>
                  , less <span className="numeric text-foreground">{formatInteger(board.discards * DISCARD_POINTS)}</span> for {board.discards === 1 ? "a discard" : `${board.discards} discards`}
                </>
              )}
              .{" "}
              {board.place !== null ? (
                <>
                  Live: <span className="numeric font-bold text-foreground">{placeName(board.place)}</span> of <span className="numeric">{formatInteger(builders)}</span>, <strong className="text-foreground">{topShare(board.place, builders).toLowerCase()}</strong>.
                </>
              ) : (
                <>Not counted yet: a masterpiece counts from {MASTERPIECE_FLOOR}.</>
              )}
            </>
          ) : (
            <>No {name} closed yet: only a closed one scores.</>
          )}
        </p>
        {board.prospect && (
          <p data-slot="masterpiece-prospect" className="drawer-carved rounded-2xl px-3.5 py-2.5 text-sm font-semibold text-muted-foreground">
            Growing: an open {name} of <span className="numeric font-bold text-foreground">{formatInteger(board.prospect.size)}</span>, <span className="numeric text-foreground">{formatInteger(board.prospect.open)}</span>{" "}
            {board.prospect.open === 1 ? "edge" : "edges"} open, worth <span className="numeric font-bold text-foreground">{formatInteger(board.prospect.worth)}</span> if closed now.
          </p>
        )}
      </section>
      <section aria-labelledby="masterpiece-days" className="flex flex-col gap-2">
        <SectionTitle id="masterpiece-days">The week's tiles</SectionTitle>
        <ol aria-label="The week's days" className="drawer-carved grid grid-cols-7 rounded-2xl px-1 py-2">
          {board.days.map((played, i) => (
            <li key={DAYS[i]} data-today={i === day || undefined} className={cn("flex flex-col items-center gap-0.5 rounded-lg py-1", i === day && "bg-primary/15")}>
              <span className="text-xs font-bold text-muted-foreground">{DAYS[i]}</span>
              <span className="numeric text-outline text-base leading-tight font-bold">{i > day ? "·" : played}</span>
              <span className="text-xs font-semibold text-muted-foreground">{i > day ? "" : played === MASTERPIECE_DAILY ? "done" : "played"}</span>
            </li>
          ))}
        </ol>
        <p className="text-[0.8125rem] font-medium text-muted-foreground">
          <span className="numeric">{formatInteger(board.played)}</span> played of the days' {MASTERPIECE_DAILY} each. A missed day's tiles wait, in day order, until Sunday 24:00 UTC.
        </p>
      </section>
    </>
  );
}

/** The week before the first visit: how it goes. */
function Brief({ kind }: { kind: MasterpieceKind }) {
  const name = MASTERPIECE_KIND[kind].name;
  const steps: readonly [string, string][] = [
    ["Each day:", `${MASTERPIECE_DAILY} new tiles at 00:00 UTC, the same cards for every builder, each board in its own order. A missed day's tiles wait until Sunday.`],
    ["One piece:", `only your closed ${name} that scores the most counts. Close a modest one early, then grow a larger one: a later closing that scores more replaces it.`],
    ["Discards:", `each takes ${DISCARD_POINTS} points, and never brings another card.`],
    ["Next Monday:", `every masterpiece of ${MASTERPIECE_FLOOR} or more is ranked, and its tier pays its Cobbles.`],
  ];
  return (
    <section aria-labelledby="masterpiece-how" className="flex flex-col gap-2">
      <SectionTitle id="masterpiece-how">How it goes</SectionTitle>
      <ol aria-label="How it goes" className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
        {steps.map(([when, what]) => (
          <li key={when} className="px-3.5 py-2.5 text-sm font-semibold text-muted-foreground">
            <strong className="text-foreground">{when}</strong> {what}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The five tiers and their Cobbles; the one the viewer stands in is marked, and each bar's score where the ranking gives it. */
function Tiers({ reached, bars }: { reached: string | null; bars?: MasterpieceRanking["bars"] }) {
  return (
    <section aria-labelledby="masterpiece-tiers" className="flex flex-col gap-2">
      <SectionTitle id="masterpiece-tiers">{bars ? "Tiers so far" : "Tiers"}</SectionTitle>
      <ul aria-label="Tiers" className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
        {MASTERPIECE_TIERS.map((t) => {
          const from = bars?.find((b) => b.tier.id === t.id)?.from ?? null;
          return (
            <li key={t.id} data-reached={reached === t.id || undefined} className="flex min-h-11 items-center gap-3 px-3.5 py-1.5">
              <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-bold">
                {t.id === "counted" ? "A counted masterpiece below" : t.name}
                {reached === t.id && <Icon name="check" size="xs" label="yours" className="text-success" />}
              </span>
              {from !== null && t.id !== "counted" && (
                <span className="text-sm font-semibold text-muted-foreground">
                  from <span className="numeric">{formatInteger(from)}</span>
                </span>
              )}
              <Cobbles amount={t.cobbles} />
            </li>
          );
        })}
      </ul>
      <p className="text-[0.8125rem] font-medium text-muted-foreground">Claimed from the next Monday. No XP and no chest, as Training and the Puzzle.</p>
    </section>
  );
}

/** The ranking's view: the first places, the viewer's line, the tiers' bars so far, the Hall's records by kind. */
function Ranking({ ranking }: { ranking: MasterpieceRanking | null }) {
  if (ranking === null)
    return (
      <div aria-busy aria-label="Ranking" className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    );
  const mine = ranking.top.find((r) => r.me) ?? ranking.me;
  return (
    <section aria-label="Ranking" className="flex flex-col gap-4">
      <p className="text-sm font-semibold text-muted-foreground">
        <span className="numeric text-foreground">{formatInteger(ranking.builders)}</span> counted {ranking.builders === 1 ? "masterpiece" : "masterpieces"} so far. Ties: the score, then the size, then the earlier closing.
      </p>
      {ranking.top.length > 0 ? (
        <ol aria-label="The first places" className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
          {ranking.top.map((row) => (
            <RankRow key={row.place} row={row} kind={ranking.kind} />
          ))}
        </ol>
      ) : (
        <p className="drawer-carved rounded-2xl px-3.5 py-2.5 text-sm font-semibold text-muted-foreground">No masterpiece is counted yet this week.</p>
      )}
      {ranking.me && (
        <ul aria-label="Your place" className="drawer-carved flex flex-col overflow-hidden rounded-2xl">
          <RankRow row={ranking.me} kind={ranking.kind} />
        </ul>
      )}
      <Tiers reached={null} bars={ranking.bars} />
      {mine && (
        <p data-slot="masterpiece-share" className="text-[0.8125rem] font-semibold text-muted-foreground">
          You stand in the <strong className="text-foreground">{topShare(mine.place, ranking.builders).toLowerCase()}</strong>.
        </p>
      )}
      <section aria-labelledby="masterpiece-hall" className="flex flex-col gap-2">
        <SectionTitle id="masterpiece-hall">Hall of Masterpieces</SectionTitle>
        {ranking.hall.length > 0 ? (
          <ul aria-label="Records by kind" className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
            {ranking.hall.map((r) => (
              <li key={r.kind} data-me={r.me || undefined} className="flex min-h-12 items-center gap-3 px-3.5 py-1.5">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm leading-tight font-bold">
                    {MASTERPIECE_KIND[r.kind].season} · {pieceName(r.kind, r.size)}
                  </span>
                  <span title={r.name} className="truncate text-xs font-semibold text-muted-foreground">
                    {r.me ? "You" : r.name}
                  </span>
                </span>
                <span className="numeric text-outline shrink-0 text-base font-bold text-primary">{formatInteger(r.score)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="drawer-carved rounded-2xl px-3.5 py-2.5 text-sm font-semibold text-muted-foreground">No record yet.</p>
        )}
        <p className="text-[0.8125rem] font-medium text-muted-foreground">Each kind's best masterpiece of the last weeks.</p>
      </section>
    </section>
  );
}

/**
 * The Masterpiece (`/play/masterpiece`, Play's Limited mode; the design proposal of 2026-11-09, one Masterpiece a week on the client): a
 * view of Play's drawer, as the Joust's. The week's kind, its day and its time left; last week's result while there is one (the tier,
 * the place, the week's master, Claim); before the first visit how the week goes, then the viewer's board (the masterpiece so far
 * and its live place, what they are growing, the tiles waiting, the seven days); the tiers; in the footer the gold button that
 * opens the board and the way to the ranking. The ranking is a view of its own (`view: "ranking"`): the first places, the viewer's
 * line, the bars so far, the Hall's records.
 */
export function MasterpieceScene({ state, error, errorDetail, onRetry, now, view = "week", ranking = null, busy = null, onOpen, onClaim, onRanking }: MasterpieceSceneProps) {
  if (error)
    return (
      <InlineError
        title="The Masterpiece"
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
  if (view === "ranking") return <Ranking ranking={ranking} />;
  if (state === null)
    return (
      <div aria-busy aria-label="Masterpiece" className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    );
  const board = state.board;
  const kind = MASTERPIECE_KIND[state.kind];
  const waiting = board?.waiting ?? 0;
  return (
    <section aria-label="Masterpiece" className="flex flex-col gap-4">
      <header className="flex flex-col gap-1.5">
        <span className="w-fit rounded-md bg-info px-2 py-0.5 text-xs leading-4 font-extrabold tracking-widest text-background uppercase">
          {kind.season} · Day {state.day + 1} of {MASTERPIECE_DAYS}
        </span>
        <h2 className="text-outline font-display text-[1.75rem] leading-tight font-bold">The {kind.name}</h2>
        <p className="text-sm font-semibold text-muted-foreground">{kind.rule}</p>
        <p role="timer" className="text-sm font-semibold text-muted-foreground">
          Ends Sunday at 24:00 UTC · in <span className="numeric text-foreground">{formatShortRemaining(state.endsAt - now)}</span>
        </p>
      </header>

      {state.result && <ResultCard result={state.result} claiming={busy === "claim"} onClaim={onClaim} />}

      {board ? <BoardCard board={board} kind={state.kind} day={state.day} builders={state.builders} /> : <Brief kind={state.kind} />}

      <Tiers reached={board?.tier?.id ?? null} />

      <DrawerFooter>
        <div data-slot="masterpiece-footer" className="flex min-h-16 items-center gap-3 px-4 py-2">
          <Button variant="secondary" className="h-12 shrink-0 px-3" onClick={onRanking}>
            Ranking
          </Button>
          <Button variant="ghost" style={GOLD_ACTION} className="relative h-12 min-w-0 flex-1 px-2 text-base font-black text-foreground mobile:text-lg" disabled={busy === "open"} aria-busy={busy === "open" || undefined} onClick={onOpen}>
            {busy !== "open" && <GoldShine />}
            {!board ? "Open your board" : waiting > 0 ? `Play ${waiting} ${waiting === 1 ? "tile" : "tiles"}` : "See your board"}
          </Button>
        </div>
      </DrawerFooter>
    </section>
  );
}
