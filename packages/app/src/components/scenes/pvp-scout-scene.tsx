import { useState, type ReactNode } from "react";
import { formatInteger } from "@paved/game-core";
import type { TileSkins } from "@paved/renderer";
import type { AttackDeckSheet } from "../../lib/attack-deck-sheet";
import { useDeferred } from "../../lib/deferred";
import { useSidePanel } from "../../lib/side-panel";
import { STAR_PERCENTS, leagueOf, type CrownStakes, type PvpPlayer, type PvpVillage } from "../../lib/pvp-rules";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { Cobbles } from "../elements/cobbles";
import { formatHoursMinutes, shieldLabel } from "../elements/shield-time";
import { Crowns } from "../elements/crowns";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { LeagueCrest } from "../elements/league-crest";
import { PlayerAvatar } from "../elements/player-avatar";
import { PlayerName } from "../elements/player-name";
import { StarRow } from "../elements/star-row";
import type { TileArt } from "../elements/tile-chip";
import type { TileRenders } from "../elements/tile-render";
import { BoardMap } from "../containers/board-map";
import { toastError } from "../containers/error-toast";
import { errorDetail } from "../../routes/error-detail";

const loadDeckSheet = () => import("../containers/deck-sheet");

/** PvP v2's attack deck (#740): ceil(1.15 x S) tiles, the defender's placed tiles and extras from the base deck. */
export interface ScoutDeck {
  /** The defender's slots, S = 8 + level. */
  slots: number;
  /** The tiles the attack will draw: ceil(1.15 x S). */
  size: number;
  /** Of them, the defender's placed tiles (the starter is not drawn); the rest are extras. */
  placed: number;
}

export interface PvpScoutSceneProps {
  defender: PvpPlayer;
  /** The defender's village: its territory, its tiles, its score (the target). */
  village: PvpVillage;
  stakes: CrownStakes;
  /** The defender's tiles the attack draws (the starter is not drawn); `village.tiles.length` when left out. */
  tilesToPlay?: number;
  /** An NPC village (#643): its Story level's board, open, with no territory. */
  openBoard?: boolean;
  /**
   * PvP v2 (#740): the deck the attack will have, sized on the defender's slots, played on an unbounded board (no territory
   * drawn). v1's defender's tiles on their cells when left out.
   */
  deck?: ScoutDeck | null;
  /** The village's tile list (#788): the attack's deck sheet (#789) before the first tile; the deck chip opens it. None in v1. */
  deckSheet?: AttackDeckSheet | null;
  /** The deck sheet's real view: the board's tile art, renders and skins (`useScoutBoard`). */
  tileArt?: TileArt;
  tileRenders?: TileRenders;
  skins?: TileSkins;
  /** The star marks in whole percent of the village's score: v1's 70 / 85 / 110 % when left out, v2's 80 / 90 / 100 %. */
  starPercents?: readonly number[];
  /** "Next": another village for `price` Cobbles; `balance` is the attacker's. */
  next: { price: number; balance: number };
  /** The attacker's own shield, while it lasts (seconds since the epoch): attacking drops it (owner decision). */
  shieldEndsAt?: number | null;
  now: number;
  /** `next`: another village is on its way; `attacking`: the attack is being opened (#643's `attack()`). */
  pending?: "next" | "attacking" | null;
  error?: string | null;
  errorDetail?: ErrorDetail;
  /** The 3D board, given by the page (`FinalBoard`'s viewport, read only); the plan view without it. */
  canvas?: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  /**
   * The defender cannot be attacked now (shielded since the draw): a free search for another village, in place of Attack. A
   * paid Next stays offered.
   */
  onSearchAgain?: () => void;
  /** `onSearchAgain`'s search is on its way. */
  searching?: boolean;
  onAttack?: () => void;
}

/**
 * The PvP scout (#647): the defender's village seen before the attack, its score the target, the points of each star, and
 * "Next" for another village at its Cobble price. Since #788 the village fills the screen at every width, under a light
 * overlay: at the top the header (with the shield's chip while the attacker's village is shielded), the defender and the
 * score; at the bottom the stars' points, the deck chip (it opens the village's tile list), Next and Attack. The rules and
 * the crowns at stake are behind the info button.
 */
export function PvpScoutScene(props: PvpScoutSceneProps) {
  const { defender, village, stakes, next, now } = props;
  const percents = props.starPercents ?? STAR_PERCENTS;
  // The least whole score of each mark, in integers.
  const marks = percents.map((p) => Math.floor((p * village.score + 99) / 100));
  const deck = props.deck ?? null;
  const tiles = deck?.size ?? props.tilesToPlay ?? village.tiles.length;
  const shielded = props.shieldEndsAt != null && props.shieldEndsAt > now;
  const short = next.balance < next.price;
  const busy = props.pending != null;
  const [rulesOpen, setRulesOpen] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);
  const wide = useSidePanel();
  const deckSheet = useDeferred(loadDeckSheet, deckOpen, (e) => {
    setDeckOpen(false);
    toastError({ title: "Deck", message: "The village's tiles could not load. Check your connection and try again.", detail: errorDetail(e) });
  });
  const list = props.deckSheet ?? null;
  return (
    <div className="relative h-dvh min-h-[36rem] overflow-hidden bg-board text-foreground">
      <div data-scout-board className="absolute inset-0">
        {props.canvas ?? (
          <BoardMap tiles={[...village.tiles]} territory={deck ? undefined : village.cells} highlight={false} fit className="px-3 pt-36 pb-48 tablet:px-6" />
        )}
      </div>

      {/* The overlay: two cards at the top and the bottom, the village in view between them; the rest lets the board's gestures through. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] tablet:p-4">
        <header data-scout-top className="pointer-events-auto flex w-full max-w-2xl flex-col gap-1 rounded-xl border border-border bg-card/90 p-1.5 shadow-lg backdrop-blur">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="size-10" aria-label="Back" onClick={props.onBack}>
              <Icon name="chevron-left" />
            </Button>
            <h1 className="min-w-0 flex-1 truncate font-display text-lg">Scout</h1>
            {/* The attacker's own shield, while it lasts: a chip, whose tap tells the rule (attacking drops it). */}
            {shielded && (
              <Button variant="ghost" size="sm" data-shield className="gap-1 px-2 text-warning" onClick={() => setRulesOpen(true)}>
                <Icon name="shield-halved" size="sm" />
                <span className="sr-only">Attacking drops your shield</span>
                <span role="timer" aria-label={shieldLabel(props.shieldEndsAt!, now)} className="numeric font-semibold text-foreground">
                  {formatHoursMinutes(props.shieldEndsAt! - now)}
                </span>
              </Button>
            )}
            <Button variant="ghost" size="icon" className="size-10" aria-label="How an attack works" onClick={() => setRulesOpen(true)}>
              <Icon name="circle-info" />
            </Button>
            <Cobbles value={next.balance} className="pr-2" />
          </div>
          {/* The defender (their league's crest, avatar, name and level) and the target; their crowns are the league's, not the attack's. */}
          <div className="flex items-center gap-3 border-t border-border px-1 pt-1.5">
            <LeagueCrest league={leagueOf(defender.crowns)} size="lg" iconOnly />
            <PlayerAvatar player={defender} look={defender.look} />
            <div className="flex min-w-0 flex-1 flex-col">
              <PlayerName name={defender.name} address={defender.address} className="font-semibold" />
              <span className="text-xs text-muted-foreground">
                Level <span className="numeric">{defender.level}</span>
              </span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs leading-none text-muted-foreground">Village score</span>
              <span data-score className="numeric text-3xl font-semibold leading-none">
                {formatInteger(village.score)}
              </span>
            </div>
          </div>
        </header>

        <section aria-label="Attack" data-input-surface className="pointer-events-auto flex w-full max-w-2xl flex-col gap-2 rounded-xl border border-border bg-card/90 p-1.5 shadow-lg backdrop-blur">
          <div className="flex items-stretch gap-1">
            <ul aria-label="Stars" className="grid flex-1 grid-cols-3 gap-1">
              {marks.map((points, i) => (
                <li key={i} className="flex flex-col items-center gap-0.5 rounded-lg bg-secondary/60 px-1 py-1.5">
                  <StarRow stars={i + 1} size="xs" label={`${i + 1} ${i === 0 ? "star" : "stars"}`} />
                  <span className="numeric text-sm font-semibold">{formatInteger(points)}</span>
                </li>
              ))}
            </ul>
            {list ? (
              <Button variant="secondary" data-deck className="h-auto flex-col gap-1 px-3" aria-label={`${tiles} tiles: the village's tile list`} onClick={() => setDeckOpen(true)}>
                <Icon name="table-cells-large" size="sm" />
                <span className="numeric text-sm font-semibold">{tiles} tiles</span>
              </Button>
            ) : (
              <span data-deck className="flex flex-col items-center justify-center gap-1 rounded-lg bg-secondary/60 px-3">
                <Icon name="table-cells-large" size="sm" />
                <span className="numeric text-sm font-semibold">{tiles} tiles</span>
              </span>
            )}
          </div>

          <InlineError title="Scout" message={props.error} detail={props.errorDetail} />

          {/* The attacker's own shield, while it lasts (#806, open point 1): Attack drops it, said in one line. */}
          {shielded && !props.onSearchAgain && (
            <p data-shield-warning className="px-1 text-center text-xs text-muted-foreground">
              Attacking drops your shield, <span className="numeric font-semibold text-foreground">{formatHoursMinutes(props.shieldEndsAt! - now)}</span> left
            </p>
          )}

          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="lg"
              className="flex-1 px-3"
              onClick={props.onNext}
              disabled={short || busy}
              loading={props.pending === "next"}
              aria-label={`Next village for ${next.price} Cobbles${short ? ", not enough Cobbles" : ""}`}
            >
              Next
              <Cobbles value={next.price} size="sm" />
            </Button>
            {props.onSearchAgain ? (
              <Button size="lg" className="flex-[2]" onClick={props.onSearchAgain} disabled={busy || props.searching} loading={props.searching}>
                <Icon name="rotate" size="sm" />
                Search again, free
              </Button>
            ) : (
              <Button size="lg" className="flex-[2]" onClick={props.onAttack} disabled={busy} loading={props.pending === "attacking"}>
                <Icon name="swords" size="sm" />
                Attack
              </Button>
            )}
          </div>
        </section>
      </div>

      <Sheet open={rulesOpen} onOpenChange={setRulesOpen}>
        <SheetContent side={wide ? "right" : "bottom"} className={wide ? "w-full max-w-sm p-4" : "p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"}>
          <SheetHeader className="pr-10">
            <SheetTitle className="font-display text-lg">How an attack works</SheetTitle>
            <SheetDescription>
              {deck
                ? `You play the village's ${deck.placed} tiles and ${Math.max(0, deck.size - deck.placed)} extras, shuffled, on an open board. You see the tile in hand and the next two.`
                : props.openBoard
                  ? "You play the village's tiles, drawn at random, on an open board."
                  : "You play the defender's tiles, drawn at random, on their cells."}
            </SheetDescription>
          </SheetHeader>
          <ul aria-label="Crowns at stake" className="flex flex-col gap-2 text-sm">
            {marks.map((points, i) => (
              <li key={i} className="flex items-center gap-2">
                <StarRow stars={i + 1} size="xs" label={`${i + 1} ${i === 0 ? "star" : "stars"}`} />
                <span className="flex-1">
                  <span className="numeric font-semibold">{formatInteger(points)}</span> points
                </span>
                <Crowns value={stakes.win[i]!} signed size="sm" />
              </li>
            ))}
            <li className="flex items-center gap-2">
              <span className="flex-1">No star</span>
              <Crowns value={-stakes.loss} signed size="sm" />
            </li>
          </ul>
          {shielded && <p className="text-sm text-muted-foreground">Attacking drops your shield.</p>}
        </SheetContent>
      </Sheet>

      {deckSheet && list && (
        <deckSheet.default open={deckOpen} onOpenChange={setDeckOpen} tiles={[]} attack={list} tileArt={props.tileArt} renders={props.tileRenders} skins={props.skins} />
      )}
    </div>
  );
}
