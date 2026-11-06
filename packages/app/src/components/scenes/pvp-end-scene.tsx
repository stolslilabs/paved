import { useEffect, useState } from "react";
import { formatInteger } from "@paved/game-core";
import { useDeferred } from "../../lib/deferred";
import { leagueOf, type PvpPlayer } from "../../lib/pvp-rules";
import { ATTACK_STAR_PERCENTS } from "../../lib/pvp-v2-rules";
import { LeagueCrest } from "../elements/league-crest";
import type { TileArt } from "../elements/tile-chip";
import { useSfx } from "../containers/audio-provider";
import { BoardCovered } from "../containers/board-covered";
import type { FinalBoardProps } from "../containers/final-board";
import { CrownsRow, END_STARS, EndChestPanel, GameEnd, ShowScores, XpRow, type EndChest } from "../containers/game-end";

// The attack's final board is its own chunk, with the renderer (as the other modes' end, `over-scene.tsx`): the results never
// wait for it, and it appears under them once it is in. A failed load leaves the board's plain colour.
export type EndBoardModule = typeof import("../containers/final-board");
const loadFinalBoard = (): Promise<EndBoardModule> => import("../containers/final-board");
/**
 * When the board under the results starts loading (ms): once the stars are in and lit (the third's turn, its fill and its light). The
 * renderer's start holds the page's thread a moment; begun with the stars, it froze their entrance and their light came late (the
 * owner's note of 2026-11-06).
 */
const BOARD_AFTER_MS = (END_STARS.lead + 2 * END_STARS.gap + 0.9) * 1000;

/**
 * The chest of the attack (#790; END-CHEST, the owner's ask of 2026-11-06: it opens here, the Chests page gone): `won` (its rank, a tap
 * opens it), `opening` (its draw on its way), `kept` (its tile taken), `capped` (stars won, but the day's PvP slots were full: shown
 * disabled, with the slots' reset at `resetsAt`, then "open again" once it passed), `none` (no star, or surrendered: nothing shown).
 */
export type PvpEndChest = EndChest;

export interface PvpEndXp {
  gained: number;
  /** The XP after the attack, and the level's span: its floor and the next level's (the floor itself at the cap). */
  xp: number;
  level: number;
  floor: number;
  next: number;
  /** The level before the attack: a level up is said when it is lower. */
  levelBefore: number;
}

export interface PvpEndSceneProps {
  defender: PvpPlayer;
  stars: number;
  score: number;
  /** The defender's village score: 100 % is 3 stars. */
  target: number;
  /** The attack was given up: "Surrendered", and what it cost. */
  surrendered?: boolean;
  /** The crowns the attack won (positive) or lost. */
  crowns: number;
  /** The attacker's crowns after it. */
  crownsAfter: number;
  /** Null while the level is read. */
  xp: PvpEndXp | null;
  chest: PvpEndChest;
  /** The attack's final board, its rival void: the results' background. None: the board's colour. */
  board?: FinalBoardProps;
  /** The final board's chunk: the scene's own when omitted (stories: one that never answers). */
  loadBoard?: () => Promise<EndBoardModule>;
  /** Seconds since the epoch: the capped chest's wait. */
  now: number;
  /** The tiles' pictures (the kept tile's), by plan key. */
  tileArt?: TileArt;
  /** A tap on the won chest: it opens in the reveal (the route's `ChestModal`). */
  onOpenChest?: () => void;
  /** The book's Village, named Home (the owner's word of 2026-11-06): home. */
  onVillage?: () => void;
  onAgain?: () => void;
}

const VERDICT = ["Defeat", "Victory", "Victory", "Triumph"] as const;

/**
 * Each star's share filled by the score (the stars in the bar's place, the owner's ask of 2026-11-06): the first from nothing to the
 * first mark, each next from the mark before to its own (`ATTACK_STAR_PERCENTS`, 80, 90 and 100 % of the village's score).
 */
export function starFills(score: number, target: number): number[] {
  const share = target > 0 ? score / target : 0;
  return ATTACK_STAR_PERCENTS.map((p, i) => {
    const from = i === 0 ? 0 : ATTACK_STAR_PERCENTS[i - 1]! / 100;
    return Math.min(1, Math.max(0, (share - from) / (p / 100 - from)));
  });
}

/**
 * The end of a PvP v2 attack (#790, `/pvp/result/:id`), after the Paved UX Book's `attack-end` (END-SCREENS, the owner's ask of
 * 2026-11-06): over the attack's final board, blurred, the book's window (`GameEnd`): the three painted stars popping in (at once
 * under reduced motion), filling with gold as the score goes, the verdict, the rival, the score against the village's; a carved card of the crowns
 * (won or lost; before and after and the league's crest, shining on a promotion) and the XP (the level's star, the gain, the level's bar, a
 * level up said); the chest's panel (`EndChestPanel`: won, a tap opens it here; capped, the slots' reset counting down); then the
 * book's answers, Home and Again (the owner's words of 2026-11-06). The cross at its top right closes the scores on the board, clear,
 * and the gold Scores pill brings them back (the owner's asks of 2026-11-06: no League, no closings' window, the board kept).
 */
export function PvpEndScene(props: PvpEndSceneProps) {
  const { stars, score, target, crowns, crownsAfter, chest, board, loadBoard = loadFinalBoard } = props;
  const play = useSfx();
  // The scores closed on the board (`peek`); once back, they show at once, the stars' beats and sounds not played again.
  const [peek, setPeek] = useState(false);
  const [back, setBack] = useState(false);
  useEffect(() => play("gameover"), [play]);
  const [boardTime, setBoardTime] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setBoardTime(true), BOARD_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  const finalBoard = useDeferred(loadBoard, board !== undefined && boardTime);
  const before = leagueOf(crownsAfter - crowns);
  const after = leagueOf(crownsAfter);
  const moved = after.index !== before.index ? (after.from > before.from ? "up" : "down") : null;
  const verdict = props.surrendered ? "Surrendered" : VERDICT[Math.min(Math.max(stars, 0), 3)];
  const xp = props.xp;
  return (
    <div className="relative min-h-dvh bg-board text-foreground">
      {board && finalBoard && (
        // The board under the results takes no input, and its ambient effects stop (#572).
        <div data-testid="final-board" aria-hidden inert className="pointer-events-none fixed inset-0">
          <BoardCovered.Provider value>
            <finalBoard.default {...board} />
          </BoardCovered.Provider>
        </div>
      )}
      {/* The page's name for a reader: the book's window draws no title bar. */}
      <h1 className="sr-only">Attack over</h1>
      {peek ? (
        <ShowScores
          onClick={() => {
            setBack(true);
            setPeek(false);
          }}
        />
      ) : (
        <>
          {/* The book's backdrop: the board blurred and dimmed under the window. */}
          <div aria-hidden className="pointer-events-none fixed inset-0 bg-background/40 backdrop-blur-sm" />
          <main className="relative mx-auto grid min-h-dvh w-full max-w-md content-center gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <GameEnd
              stars={stars}
              instant={back}
              fills={props.surrendered ? [0, 0, 0] : starFills(score, target)}
              verdict={verdict}
              subtitle={
                <>
                  against <span className="text-foreground">{props.defender.name ?? "their village"}</span>
                </>
              }
              score={
                <>
                  {formatInteger(score)} / {formatInteger(target)}
                </>
              }
              rows={[
                <section key="crowns" aria-label="Crowns" className="flex min-w-0 flex-1 items-center gap-3">
                  <CrownsRow
                    crowns={crowns}
                    after={crownsAfter}
                    league={<LeagueCrest league={after} size="lg" iconOnly />}
                    promoted={moved === "up"}
                    moved={moved === "up" ? `Promoted to ${after.name}` : moved === "down" ? `Dropped to ${after.name}` : undefined}
                  />
                </section>,
                <section key="xp" aria-label="Experience" className="flex min-w-0 flex-1 items-center gap-3">
                  <XpRow gained={xp?.gained ?? 0} progress={xp ? { level: xp.level, xp: xp.xp - xp.floor, xpForNext: xp.next - xp.floor } : undefined} levelUp={xp != null && xp.level > xp.levelBefore} />
                </section>,
              ]}
              chest={
                chest.state !== "none" && (
                  <section aria-label="Chest" data-state={chest.state} aria-disabled={chest.state === "capped" || undefined} className="w-full">
                    <EndChestPanel chest={chest} now={props.now} tileArt={props.tileArt} onOpen={props.onOpenChest} />
                  </section>
                )
              }
              secondary={{ label: "Home", onClick: props.onVillage }}
              primary={{ label: "Again", onClick: props.onAgain }}
              onClose={() => setPeek(true)}
            />
          </main>
        </>
      )}
    </div>
  );
}
