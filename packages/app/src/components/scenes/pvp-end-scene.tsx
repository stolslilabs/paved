import { useEffect } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import type { ScoredStructure } from "@paved/chain";
import { formatInteger, formatPercent } from "@paved/game-core";
import { useDeferred } from "../../lib/deferred";
import { cn } from "../../lib/utils";
import { leagueOf, shareOf, type PvpPlayer } from "../../lib/pvp-rules";
import { ATTACK_STAR_PERCENTS } from "../../lib/pvp-v2-rules";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Progress } from "../ui/progress";
import { CHEST_NAME, ChestBadge, type ChestRank } from "../elements/chest-badge";
import { Crowns } from "../elements/crowns";
import { LeagueCrest } from "../elements/league-crest";
import { StarMeter } from "../elements/star-meter";
import { useSfx } from "../containers/audio-provider";
import { BoardCovered } from "../containers/board-covered";
import { ClosingLine } from "../containers/closing-feed";
import type { FinalBoardProps } from "../containers/final-board";
import { TopBar } from "../containers/top-bar";

// The attack's final board is its own chunk, with the renderer (as the other modes' end, `over-scene.tsx`): the results never
// wait for it, and it appears under them once it is in. A failed load leaves the board's plain colour.
export type EndBoardModule = typeof import("../containers/final-board");
const loadFinalBoard = (): Promise<EndBoardModule> => import("../containers/final-board");

/**
 * The chest of the attack (#790): `won` (its rank, opened on the Chests page), `capped` (stars won, but the day's PvP slots were
 * full: shown disabled, with the time to the slots' return at `resetsAt`, then "open again" once it passed), `none` (no star,
 * or surrendered: nothing shown).
 */
export type PvpEndChest = { state: "won"; rank: ChestRank } | { state: "capped"; rank: ChestRank; resetsAt: number } | { state: "none" };

/** The XP of the attack and where it leaves the player's level. */
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
  /** Every closing of the attack in move order, with the move that closed it. */
  closings: readonly (ScoredStructure & { move: number })[];
  /** The attack's final board, its rival void: the results' background. None: the board's colour. */
  board?: FinalBoardProps;
  /** The final board's chunk: the scene's own when omitted (stories: one that never answers). */
  loadBoard?: () => Promise<EndBoardModule>;
  /** Seconds since the epoch: the capped chest's wait. */
  now: number;
  onOpenChest?: () => void;
  onAgain?: () => void;
  onLeague?: () => void;
  onBack?: () => void;
}

const VERDICT = ["Defeat", "Victory", "Victory", "Triumph"] as const;

/** The wait for the next chest slot: "5 h" from an hour, "12 min" under it. */
export function waitText(seconds: number): string {
  const s = Math.max(0, seconds);
  return s >= 3_600 ? `${Math.ceil(s / 3_600)} h` : `${Math.max(1, Math.ceil(s / 60))} min`;
}

/**
 * The end of a PvP v2 attack (#790, `/pvp/result/:id`): over the attack's final board, the stars won (animated in one by one,
 * at once under reduced motion) and the score against the village's, the crowns and the league they leave the player in, the
 * XP and the level bar, the chest won (or disabled with its reason when the day's slots are full), every closing, then Open
 * chest, Attack again and League. One column on a phone; two from `desktop`.
 */
export function PvpEndScene(props: PvpEndSceneProps) {
  const { stars, score, target, crowns, crownsAfter, chest, board, loadBoard = loadFinalBoard } = props;
  const reduced = useReducedMotionConfig() ?? false;
  const play = useSfx();
  useEffect(() => play("gameover"), [play]);
  const finalBoard = useDeferred(loadBoard, board !== undefined);
  const before = leagueOf(crownsAfter - crowns);
  const after = leagueOf(crownsAfter);
  const moved = after.index !== before.index ? (after.from > before.from ? "up" : "down") : null;
  const verdict = props.surrendered ? "Surrendered" : VERDICT[Math.min(Math.max(stars, 0), 3)];
  const won = chest.state === "won";
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
      <div className="relative flex min-h-dvh flex-col">
        <TopBar title="Attack over" onBack={props.onBack} balances={false} />
        <main className="mx-auto grid w-full max-w-md flex-1 content-start gap-3 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] tablet:max-w-2xl desktop:max-w-5xl desktop:grid-cols-2 desktop:items-start desktop:gap-4">
          <div className="flex flex-col gap-3">
            <section aria-label="Result" data-verdict={verdict} className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card/95 px-4 py-5 text-center shadow-lg backdrop-blur">
              <div role="img" aria-label={`${stars} of 3 stars`} data-stars={stars} className="flex items-end gap-2">
                {[1, 2, 3].map((n) => (
                  <m.span
                    key={n}
                    data-lit={n <= stars}
                    initial={reduced ? false : { scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.15 + n * 0.3, type: "spring", stiffness: 380, damping: 18 }}
                    className={cn(n === 2 && "-translate-y-3")}
                  >
                    <Icon name="star" size="xl" className={cn("text-[3.5rem]!", n <= stars ? "text-primary drop-shadow-lg" : "text-muted-foreground/30")} />
                  </m.span>
                ))}
              </div>
              <h2 className="font-display text-4xl">{verdict}</h2>
              <p className="text-sm text-muted-foreground">
                against <span className="font-semibold text-foreground">{props.defender.name ?? "their village"}</span>
              </p>
              <p aria-label="Score" className="numeric text-lg">
                <span className="font-semibold">{formatInteger(score)}</span>
                <span className="text-muted-foreground"> / {formatInteger(target)}, </span>
                <span className="font-semibold">{formatPercent(shareOf(score, target), { maxFractionDigits: 0 })}</span>
              </p>
              <StarMeter score={score} target={target} percents={ATTACK_STAR_PERCENTS} className="w-full max-w-xs" />
            </section>

            <section aria-label="Crowns" className="flex flex-col gap-2 rounded-xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Crowns</span>
                <Crowns value={crowns} signed size="lg" />
              </div>
              <p className={cn("flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm", moved === "up" ? "bg-primary/15" : "bg-secondary/60")}>
                {moved === "up" && <span className="font-semibold">Promoted to</span>}
                {moved === "down" && <span className="font-semibold">Dropped to</span>}
                {!moved && <span className="text-muted-foreground">Still in</span>}
                <LeagueCrest league={after} />
                <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                  now <Crowns value={crownsAfter} size="sm" />
                </span>
              </p>
            </section>

            <XpCard xp={props.xp} />

            {chest.state !== "none" && (
              <section
                aria-label="Chest"
                data-state={chest.state}
                aria-disabled={chest.state === "capped" || undefined}
                className={cn("flex items-center gap-4 rounded-xl border bg-card/95 p-4 shadow-lg backdrop-blur", won ? "border-primary/40" : "border-border")}
              >
                <ChestBadge rank={chest.rank} size="lg" glow={won} className={cn(!won && "border-border text-muted-foreground opacity-60 grayscale")} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {won ? (
                    <>
                      <span className="font-semibold">{CHEST_NAME[chest.rank]} won</span>
                      <span className="text-sm text-muted-foreground">It waits in your chests.</span>
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-muted-foreground">{CHEST_NAME[chest.rank]}</span>
                      <span className="text-sm text-muted-foreground">
                        {chest.resetsAt > props.now ? `No slot left today, next in ${waitText(chest.resetsAt - props.now)}.` : "No slot was left that day. Your chest slots are open again."}
                      </span>
                    </>
                  )}
                </div>
              </section>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <section data-slot="card" aria-label="Closings" className="flex flex-col rounded-xl border border-border bg-card/95 shadow-lg backdrop-blur">
              <header className="flex items-center justify-between px-4 pt-3 pb-2">
                <h2 className="font-display text-sm font-semibold">Every closing</h2>
                <span className="text-xs text-muted-foreground">{props.closings.length}</span>
              </header>
              {props.closings.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-muted-foreground">No structure closed in this attack.</p>
              ) : (
                <ol className="flex flex-col divide-y divide-border px-4 pb-1">
                  {props.closings.map((c, i) => (
                    <li key={i} className="py-2">
                      <ClosingLine closing={c} move={c.move} />
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {won && (
              <Button size="lg" onClick={props.onOpenChest}>
                <Icon name="treasure-chest" size="sm" />
                Open chest
              </Button>
            )}
            <div className="grid gap-2 mobile:grid-cols-2">
              <Button variant={won ? "secondary" : "default"} size="lg" onClick={props.onAgain}>
                <Icon name="swords" size="sm" />
                Attack again
              </Button>
              <Button variant="secondary" size="lg" onClick={props.onLeague}>
                <Icon name="trophy" size="sm" />
                League
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/** The XP gained and the level bar's fill (full at the cap); a level up said in words. */
function XpCard({ xp }: { xp: PvpEndXp | null }) {
  const span = xp ? xp.next - xp.floor : 0;
  const fill = !xp ? 0 : span > 0 ? Math.min(100, ((xp.xp - xp.floor) / span) * 100) : 100;
  return (
    <section aria-label="Experience" className="flex flex-col gap-2 rounded-xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{xp && xp.level > xp.levelBefore ? <span className="font-semibold text-foreground">Level up: {xp.level}</span> : `Level ${xp?.level ?? "…"}`}</span>
        <span className="numeric text-lg font-semibold text-primary">+{formatInteger(xp?.gained ?? 0)} XP</span>
      </div>
      <Progress value={fill} aria-label="Level progress" />
      {xp && (
        <span className="numeric text-xs text-muted-foreground">
          {span > 0 ? `${formatInteger(xp.xp - xp.floor)} / ${formatInteger(span)} XP to level ${xp.level + 1}` : "Highest level"}
        </span>
      )}
    </section>
  );
}
