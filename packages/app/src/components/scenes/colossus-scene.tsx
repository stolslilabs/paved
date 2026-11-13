import type { ReactNode } from "react";
import { COLOSSUS_DAYS, COLOSSUS_HAND, COLOSSUS_HEART_SHARE, COLOSSUS_NAME_TILES, COLOSSUS_RATION, COLOSSUS_TOP, formatInteger } from "@paved/game-core";
import type { ColossusBoardState, ColossusBuilderRow, ColossusOptions, ColossusPlace, ColossusPlaced, ColossusState } from "../../data/colossus-source";
import { cn } from "../../lib/utils";
import { ColossusBoard } from "../containers/colossus-board";
import { ColossusBuilders, ColossusPlaque } from "../containers/colossus-plaque";
import { COLOSSUS_DAY_NAMES, ColossusGauge, ColossusSite, colossusShare } from "../containers/colossus-site";
import { DrawerFooter } from "../containers/hud-drawer";
import { formatShortRemaining } from "../elements/countdown";
import { GOLD_ACTION, GoldShine } from "../elements/gold-action";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { SectionTitle } from "../elements/section-title";
import type { TileArt } from "../elements/tile-chip";
import type { UiIconName } from "../elements/ui-art";
import { UiIcon } from "../elements/ui-icon";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";

/** The Colossus's views in Play's drawer: the site, the builders' ranking, one board. */
export type ColossusView = "site" | "builders" | "board";

export interface ColossusSceneProps {
  /** The week as the viewer sees it; null while it is read. */
  state: ColossusState | null;
  /** Why it could not be read, with Retry. */
  error?: string | null;
  errorDetail?: ErrorDetail;
  onRetry?: () => void;
  /** Seconds since the epoch: the week's time left. */
  now: number;
  view?: ColossusView;
  /** Every builder (the builders' view); null while it is read. */
  builders?: readonly ColossusBuilderRow[] | null;
  /** The board shown (the board's view); null while it is read. */
  board?: ColossusBoardState | null;
  /** The card picked in the hand, and where it may go. */
  selected?: number | null;
  options?: ColossusOptions | null;
  /** What the viewer's last tile did, said over the board. */
  placed?: ColossusPlaced | null;
  /** The write on its way: its button waits. */
  busy?: "place" | "claim" | null;
  tileArt?: TileArt;
  onSelect?: (card: number) => void;
  onPlace?: (tile: ColossusPlace) => void;
  /** The Cobbles of a week: this one's tiers, or last week's tiers and top 10. */
  onClaim?: (week: number) => void;
  onLot?: (board: number) => void;
  onBuilders?: () => void;
  onOpenPlayer?: (address: string) => void;
}

function Figure({ value, word, tone }: { value: ReactNode; word: string; tone?: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col items-center px-1 text-center">
      <span className={cn("numeric text-outline text-xl leading-tight font-bold", tone)}>{value}</span>
      <span className="text-xs leading-tight font-semibold text-muted-foreground">{word}</span>
    </span>
  );
}

const RULES: readonly { icon: UiIconName; text: string }[] = [
  { icon: "tile-stack", text: `${COLOSSUS_RATION} tiles a day at 00:00 UTC, yours alone. A day's tiles wait until the next day's end: ${COLOSSUS_HAND} in hand at most, no discard.` },
  { icon: "trophy", text: "Close a structure and each of its tiles not yet counted becomes a stone of the Colossus, yours. A wall runs round every district: an edge facing it is closed." },
  { icon: "padlock", text: `The heart opens when the gauge reaches ${COLOSSUS_HEART_SHARE}%. A tile may never leave a hole that no card fits; a hole no card can take is sealed.` },
  { icon: "crown", text: `The gauge pays every builder at 25, 50, 75 and 100%: 10, 15, 20 and 30 Cobbles. The top ${COLOSSUS_TOP} by stones set are paid 150, 100, 75, then 50 each.` },
];

/** What a tile laid did, in a line or two. */
function PlacedNotice({ placed }: { placed: ColossusPlaced }) {
  return (
    <Notice tone="info" title={placed.completed ? "The Colossus is complete: you laid its capstone!" : placed.stones > 0 ? `+${formatInteger(placed.stones)} ${placed.stones === 1 ? "stone" : "stones"}` : "Tile laid"}>
      <span data-slot="colossus-placed">
        {placed.stones > 0 ? (
          <>
            The gauge: <span className="numeric">{colossusShare(placed.before, placed.cells)}</span> → <span className="numeric">{colossusShare(placed.after, placed.cells)}</span>.{" "}
          </>
        ) : (
          "No structure closed yet: the stones come when one does. "
        )}
        You: <span className="numeric">{formatInteger(placed.mine.stones)}</span> {placed.mine.stones === 1 ? "stone" : "stones"}, <span className="numeric">#{formatInteger(placed.mine.place)}</span> of <span className="numeric">{formatInteger(placed.mine.builders)}</span> builders.
        {placed.tiers.length > 0 && <> The gauge reached {placed.tiers.map((t) => `${t}%`).join(" and ")}.</>}
        {placed.heartOpened && <> The heart is open.</>}
        {placed.sealed > 0 && <> {placed.sealed === 1 ? "A hole no card could fill was sealed." : `${placed.sealed} holes no card could fill were sealed.`}</>}
      </span>
    </Notice>
  );
}

/**
 * The Colossus (`/play/colossus`, Play's Limited mode; the design proposal of 2026-11-10, one Colossus a week on the client): a view of
 * Play's drawer, as the Joust's. The site: the season's monument and the week's time left; the gauge with its four tiers and Claim;
 * the viewer's week (hand, tiles, stones, place, the name the ninth tile wins); the map of the districts and the heart, each shaded
 * by its stones; the day's hard holes and how many builders hold a tile that fits; last week's plaque with its Claim; the rules. Its
 * two other views: every builder by stones set, and one board, where a tile of the hand is laid.
 */
export function ColossusScene({ state, error, errorDetail, onRetry, now, view = "site", builders = null, board = null, selected = null, options = null, placed = null, busy = null, tileArt, onSelect, onPlace, onClaim, onLot, onBuilders, onOpenPlayer }: ColossusSceneProps) {
  if (error)
    return (
      <InlineError
        title="The Colossus"
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
  if (state === null || (view === "builders" && builders === null) || (view === "board" && board === null))
    return (
      <div aria-busy aria-label="Colossus" className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    );
  if (view === "builders")
    return (
      <section aria-label="Builders" className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-muted-foreground">
          Live, by stones set: a builder's stones are their closings. The top {COLOSSUS_TOP} are paid on Monday, with the tiers; a tie goes to the earlier total.
        </p>
        {builders!.length === 0 ? <p className="drawer-carved rounded-xl px-4 py-6 text-center text-sm font-semibold text-muted-foreground">No tile laid yet this week.</p> : <ColossusBuilders rows={builders!} label="Builders by stones set" onOpenPlayer={onOpenPlayer} />}
      </section>
    );
  if (view === "board" && board)
    return (
      <section aria-label={board.heart ? "The heart" : `District ${board.name}`} className="flex flex-col gap-3">
        <p data-slot="colossus-board-head" className="text-sm font-semibold text-muted-foreground">
          <span className="numeric text-foreground">{formatInteger(board.stones)}</span> of <span className="numeric text-foreground">{formatInteger(board.size * board.size)}</span> stones ·{" "}
          <span className="numeric text-foreground">{formatInteger(board.holes)}</span> {board.holes === 1 ? "hole" : "holes"} left
        </p>
        {placed && <PlacedNotice placed={placed} />}
        <ColossusBoard board={board} day={state.day} selected={selected} onSelect={onSelect} options={options} busy={busy === "place"} onPlace={onPlace} tileArt={tileArt} />
        <p className="text-xs font-medium text-muted-foreground">Dimmed tiles are not stones yet: their structure is still open. Your own tiles are outlined in blue; a padlock is a sealed hole, a wall now.</p>
      </section>
    );

  const mine = state.me;
  const complete = state.completedAt !== null;
  const districts = state.lots.filter((l) => !l.heart);
  const done = districts.filter((l) => l.holes === 0).length;
  const weekStart = state.endsAt - COLOSSUS_DAYS * 86_400;
  // Where Build leads: a hard hole the viewer holds a tile for, else the first open board with holes.
  const next = state.hardHoles.find((h) => h.mine)?.board ?? state.lots.find((l) => l.holes > 0 && (!l.heart || state.heartOpen))?.board ?? null;
  return (
    <section aria-label="Colossus" className="flex flex-col gap-4">
      <header className="flex flex-col gap-1.5">
        <span className="w-fit rounded-md bg-background/70 px-2 py-px text-xs font-extrabold tracking-widest uppercase">
          Day {state.day + 1} of {COLOSSUS_DAYS} · {COLOSSUS_DAY_NAMES[state.day]}
        </span>
        <h2 className="text-outline font-display text-[1.75rem] leading-tight font-bold">{state.monument}</h2>
        <p role="timer" className="text-sm font-semibold text-muted-foreground">
          {complete ? (
            <>
              Complete{state.capstone ? <>: the capstone is <strong className="text-primary wrap-anywhere">{state.capstone}</strong></> : null}. A new site opens
            </>
          ) : (
            "One site for the whole server. It closes Sunday at 24:00 UTC ·"
          )}{" "}
          in <span className="numeric text-foreground">{formatShortRemaining(state.endsAt - now)}</span>
        </p>
      </header>

      <ColossusGauge stones={state.stones} cells={state.cells} builders={state.builders} tiers={state.tiers} weekStart={weekStart} toClaim={mine?.toClaim ?? 0} participant={(mine?.tiles ?? 0) > 0} claiming={busy === "claim"} onClaim={() => onClaim?.(state.week)} />

      {mine && (
        <section aria-labelledby="colossus-week" className="flex flex-col gap-2">
          <SectionTitle id="colossus-week">Your week</SectionTitle>
          <div role="group" aria-label="Your week" className="drawer-carved flex rounded-2xl py-1.5">
            <Figure value={formatInteger(mine.hand.length)} word="in hand" tone="text-primary" />
            <Figure value={formatInteger(mine.tiles)} word="tiles laid" />
            <Figure value={formatInteger(mine.stones)} word="stones" />
            <Figure value={mine.place === null ? "—" : `#${formatInteger(mine.place)}`} word={`of ${formatInteger(state.builders)}`} />
          </div>
          <p data-slot="colossus-name" className="drawer-carved flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold text-muted-foreground">
            <UiIcon name="crown" px={28} className="drawer-icon size-7 shrink-0" />
            <span>
              {mine.named ? (
                <>
                  Your name wears <strong className="text-foreground">{state.stone}</strong> until the season ends.
                </>
              ) : (
                <>
                  <span className="numeric text-foreground">
                    {mine.tiles}/{COLOSSUS_NAME_TILES}
                  </span>{" "}
                  tiles for your name in {state.stone}.
                </>
              )}
              {mine.behind !== null && mine.behind > 0 && (
                <>
                  {" "}
                  <span className="numeric text-foreground">{formatInteger(mine.behind)}</span> stones behind the {COLOSSUS_TOP}th.
                </>
              )}
            </span>
          </p>
        </section>
      )}

      <section aria-labelledby="colossus-site" className="flex flex-col gap-2">
        <SectionTitle id="colossus-site">The site</SectionTitle>
        <p className="text-sm font-semibold text-muted-foreground">
          <span className="numeric text-foreground">{done}</span> of <span className="numeric text-foreground">{districts.length}</span> districts complete. {state.heartOpen ? "The heart is open." : `The heart opens at ${COLOSSUS_HEART_SHARE}%.`}
        </p>
        <ColossusSite side={state.side} lots={state.lots} heartOpen={state.heartOpen} marked={state.hardHoles.filter((h) => h.mine).map((h) => h.board)} onLot={onLot} />
      </section>

      {state.hardHoles.length > 0 && (
        <section aria-labelledby="colossus-hard" className="flex flex-col gap-2">
          <SectionTitle id="colossus-hard">Hard holes</SectionTitle>
          <ul aria-label="Hard holes of the day" className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
            {state.hardHoles.map((h) => (
              <li key={`${h.board}:${h.x},${h.y}`}>
                <button type="button" onClick={() => onLot?.(h.board)} className="state-layer flex min-h-12 w-full cursor-pointer items-center gap-3 px-3 py-1.5 text-left">
                  <span className="text-outline w-12 shrink-0 text-sm font-bold">{h.lot}</span>
                  <span className="min-w-0 flex-1 text-[0.8125rem] font-semibold text-muted-foreground">
                    <span className="numeric text-foreground">{h.cards}</span> {h.cards === 1 ? "card fits" : "cards fit"} · <span className="numeric text-foreground">{formatInteger(h.holders)}</span> {h.holders === 1 ? "builder holds" : "builders hold"} one today
                    {h.mine && <strong className="text-info"> · you do</strong>}
                  </span>
                  <Icon name="chevron-right" size="sm" className="text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ColossusPlaque result={state.result} claiming={busy === "claim"} onClaim={onClaim} onOpenPlayer={onOpenPlayer} />

      <section aria-labelledby="colossus-rules" className="flex flex-col gap-2">
        <SectionTitle id="colossus-rules">The week's rules</SectionTitle>
        <ul className="drawer-carved flex flex-col gap-2.5 rounded-2xl px-3.5 py-3">
          {RULES.map((rule) => (
            <li key={rule.icon} className="flex items-start gap-3 text-[0.8125rem] font-semibold text-muted-foreground">
              <UiIcon name={rule.icon} px={24} className="drawer-icon size-6 shrink-0" />
              <span>{rule.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <DrawerFooter>
        <div data-slot="colossus-footer" className="flex min-h-16 items-center gap-3 px-4 py-2">
          <Button variant="secondary" className="h-12 flex-1" onClick={onBuilders}>
            Builders
          </Button>
          {mine && !complete && next !== null ? (
            <Button variant="ghost" style={GOLD_ACTION} className="relative h-12 flex-1 px-1 text-lg font-black text-foreground" onClick={() => onLot?.(next)}>
              <GoldShine />
              Build
            </Button>
          ) : (
            <span className="flex-1 text-center text-sm font-semibold text-muted-foreground">{complete ? "The Colossus is complete" : "The site is closed"}</span>
          )}
        </div>
      </DrawerFooter>
    </section>
  );
}
