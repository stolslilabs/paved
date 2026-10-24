import type { ReactNode } from "react";
import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { STAR_PERCENTS, type CrownStakes, type PvpPlayer, type PvpVillage } from "../../lib/pvp-rules";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Cobbles } from "../elements/cobbles";
import { Countdown } from "../elements/countdown";
import { Crowns } from "../elements/crowns";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { StarRow } from "../elements/star-row";
import { BoardMap } from "../containers/board-map";
import { PvpPlayerRow } from "../containers/pvp-player-row";

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
 * The PvP scout (#647): the defender's village seen before the attack, its score the target, the points of each star, the
 * crowns at stake for a win (by stars) and for a loss, and "Next" for another village at its Cobble price. The board fills
 * the screen; the scout's card sits at the bottom on a phone and on the right from desktop up.
 */
export function PvpScoutScene(props: PvpScoutSceneProps) {
  const { defender, village, stakes, next, now } = props;
  const percents = props.starPercents ?? STAR_PERCENTS;
  // The least whole score of each mark, in integers.
  const marks = percents.map((p) => Math.floor((p * village.score + 99) / 100));
  const deck = props.deck ?? null;
  const shielded = props.shieldEndsAt != null && props.shieldEndsAt > now;
  const short = next.balance < next.price;
  const busy = props.pending != null;
  return (
    // A column on a phone: the header, the board in the space left, the card under it (the board is never under the card,
    // whatever the card holds). From desktop up the board takes the screen and the card floats on its right.
    <div className="relative flex h-dvh min-h-[36rem] flex-col overflow-hidden bg-board text-foreground">
      <div data-scout-board className="relative min-h-0 flex-1 desktop:absolute desktop:inset-0">
        {props.canvas ?? (
          <BoardMap tiles={[...village.tiles]} territory={deck ? undefined : village.cells} highlight={false} fit className="p-3 tablet:p-6 desktop:pt-20 desktop:pr-[27rem]" />
        )}
      </div>

      <header className="pointer-events-none order-first flex justify-center p-2 pt-[max(0.5rem,env(safe-area-inset-top))] tablet:p-4 desktop:absolute desktop:inset-x-0 desktop:top-0 desktop:justify-start">
        <div className="pointer-events-auto flex w-full max-w-2xl items-center gap-2 rounded-xl border border-border bg-card/90 px-2 py-2 shadow-lg backdrop-blur desktop:max-w-md">
          <Button variant="ghost" size="icon" className="size-10" aria-label="Back" onClick={props.onBack}>
            <Icon name="chevron-left" />
          </Button>
          <h1 className="flex-1 font-display text-lg">Scout</h1>
          <Cobbles value={next.balance} className="pr-2" />
        </div>
      </header>

      <section
        aria-label="Attack"
        data-input-surface
        className="relative mx-2 mb-[max(0.5rem,env(safe-area-inset-bottom))] flex shrink-0 flex-col gap-3 self-center rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur w-[calc(100%-1rem)] max-w-xl tablet:mx-4 tablet:mb-4 tablet:p-4 desktop:absolute desktop:right-4 desktop:bottom-4 desktop:m-0 desktop:w-[25rem]"
      >
        <PvpPlayerRow player={defender} />

        <div className="flex items-end justify-between gap-3 border-t border-border pt-3">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Village score</span>
            <span className="numeric text-3xl font-semibold leading-none">{formatInteger(village.score)}</span>
          </div>
          {deck ? (
            <span data-deck className="text-right text-xs text-muted-foreground">
              <span className="numeric text-sm font-semibold text-foreground">{deck.size}</span> tiles to play
              <br />
              <span className="numeric">{deck.slots}</span> slots, on an open board
            </span>
          ) : (
          <span className="text-right text-xs text-muted-foreground">
            <span className="numeric">{props.tilesToPlay ?? village.tiles.length}</span> tiles to play
            <br />
            {props.openBoard ? (
              "on an open board"
            ) : (
              <>
                on <span className="numeric">{village.cells.length}</span> cells
              </>
            )}
          </span>
          )}
        </div>

        <ul aria-label="Stars" className="grid grid-cols-3 gap-2">
          {marks.map((points, i) => (
            <li key={i} className="flex flex-col items-center gap-1 rounded-lg bg-secondary/60 px-1 py-2">
              <StarRow stars={i + 1} size="xs" label={`${i + 1} ${i === 0 ? "star" : "stars"}`} />
              <span className="numeric text-sm font-semibold">{formatInteger(points)}</span>
              <Crowns value={stakes.win[i]!} signed size="sm" />
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          <p className="flex flex-wrap items-center gap-x-1.5">
            No star: you lose <Crowns value={-stakes.loss} signed size="sm" />
          </p>
          {deck ? (
            <p>
              You play the village's <span className="numeric">{deck.placed}</span> tiles and{" "}
              <span className="numeric">{Math.max(0, deck.size - deck.placed)}</span> from the base deck, shuffled. You see the tile in
              hand and the next two.
            </p>
          ) : (
            <p>You play the defender's tiles, drawn at random, on their cells.</p>
          )}
        </div>

        {shielded && (
          <Notice tone="warning" title="Attacking drops your shield" icon="shield-halved">
            <span className="inline-flex flex-wrap items-center gap-1.5">
              Your village is shielded for
              <Countdown expiresAt={props.shieldEndsAt!} now={now} label="Shield" hideLabel className="text-foreground" />
            </span>
          </Notice>
        )}
        <InlineError title="Scout" message={props.error} detail={props.errorDetail} />

        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="lg"
            className={cn("flex-1 px-3")}
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
  );
}
