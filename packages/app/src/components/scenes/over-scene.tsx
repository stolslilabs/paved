import { useEffect, useRef, useState } from "react";
import type { GameView, ScoredStructure } from "@paved/chain";
import { CategoryType, type ClosedStructure, type GameStats, type OpenStructure } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { useDeferred } from "../../lib/deferred";
import { failedModuleUrl, reimport } from "../../lib/reimport";
import { errorDetail } from "../../routes/error-detail";
import { toastError } from "../containers/error-toast";
import type { FinalBoardProps } from "../containers/final-board";
import { BoardCovered } from "../containers/board-covered";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { ScrollArea } from "../ui/scroll-area";
import { ScrollRegion } from "../ui/scroll-region";
import { Separator } from "../ui/separator";
import { CLOSING_CATEGORIES, CategoryIcon, categoryInfo } from "../elements/category";
import { Score, formatPoints } from "../elements/score";
import { StatRow } from "../elements/stat-row";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { useSfx } from "../containers/audio-provider";
import { Boundary, useClock } from "../elements/deadline";
import { ClosingLine } from "../containers/closing-feed";
import { GameMissions, type GameMission } from "../containers/game-missions";
import { RewardPanel, type RewardState } from "../containers/reward-panel";
import type { RewardCurve } from "../containers/reward-estimate";
import { GameHud } from "../containers/game-hud";

// The final board (#539) is its own chunk, with the renderer: loaded when the end screen opens (#720), the scores' background.
// The scores never wait for it: they show at once over the board's colour, and the board appears under them once it is in.
// A failed download is asked for again under another URL (`reimport`): the browser would answer the same `import()` with
// the same failure, without a request, for the page's life.
// The load that answered is kept, so a later switch asks for nothing; a failed one is forgotten, and the next tries again.
export type FinalBoardModule = typeof import("../containers/final-board");
let finalBoardLoad: Promise<FinalBoardModule> | null = null;
const loadFinalBoard = (): Promise<FinalBoardModule> =>
  (finalBoardLoad ??= import("../containers/final-board")
    .catch((e: unknown) => reimport<FinalBoardModule>(e))
    .catch((e: unknown) => {
      finalBoardLoad = null;
      throw e;
    }));

/** What the over route shows: the scores over the final board, or the board alone (the toggle switches, one tap each way). */
export type OverView = "scores" | "board";

/**
 * What the settle area shows (P7a, a Challenge game bought with a stake, not settled): `after` (the day cannot be settled
 * yet: "Settles in <time> (<date> UTC)"), `connect` (a guest), `ready` (the player's button), `viewing` (settleable, shown to someone
 * who is not the player: anyone may settle, the button is the player's), `pending` (the wallet or the chain),
 * `refused` (the writer's message, the button again), `settled` (settled from this page) and `done` (settled before).
 */
export type SettleState = "after" | "connect" | "ready" | "viewing" | "pending" | "refused" | "settled" | "done";

export interface SettleProps {
  state: SettleState;
  /** `after`: seconds since the epoch the day can be settled from. */
  at?: number;
  /** `refused`: why. */
  message?: string;
  /** `refused`: its detail for support (typed name, hash, game, version, time). */
  detail?: ErrorDetail;
  onSettle?: () => void;
  onConnect?: () => void;
}

export interface OverSceneProps {
  mode: "challenge" | "training";
  game: GameView;
  /** Every closing of the game in move order, with the tile that closed it (the PM's P7 addition). */
  closings: (ScoredStructure & { tileId: number })[];
  /** The player's best before this game: "New best" when beaten. */
  previousBest?: number | null;
  reward: {
    state: RewardState;
    /** PAVED base units. */
    amount?: bigint;
    stake?: number;
    /** Points (`threshold / 1000`). */
    threshold?: number;
    /** `awaiting` and `settle`: the game's curve, for the reward its score earns (#705, `RewardPanel`). */
    curve?: RewardCurve | null;
  };
  settling?: boolean;
  onSettle?: () => void;
  /**
   * A Challenge game's settlement (P7a). Without it the reward panel alone is shown, with its own button in the `settle`
   * state (the scene's first mocks).
   */
  settle?: SettleProps;
  /** A free Challenge game (`GameSpawned.price == 0`): the label "Free game" and no reward, no settle. */
  freeGame?: boolean;
  /** The reward cannot be read (no economy on this network): a neutral line replaces the reward panel. */
  rewardUnavailable?: boolean;
  /** `expired`: the 24 h deadline the game missed (`terms.time + 86400`), seconds since the epoch. */
  deadline?: number;
  /** Why the list of closings is not shown, when it could not be read. */
  closingsNote?: string;
  /**
   * The game's figures (`gameStats` of game-core): the largest structures, the most valuable closing, the discards, what
   * was left open. Without them the metrics are the closings' alone, as before.
   */
  stats?: GameStats;
  /** The finished game's board: the Board / Scores toggle shows it. None: no toggle (the board cannot be read). */
  board?: FinalBoardProps;
  /** The final board's chunk: the scene's own when omitted (stories: one that never answers, the board still loading). */
  loadBoard?: () => Promise<FinalBoardModule>;
  /** Which of the two shows (controlled by the route, so the system Back returns from the board to the scores). Uncontrolled when omitted. */
  view?: OverView;
  onViewChange?: (view: OverView) => void;
  /** Seconds since the epoch: the scene's clock for the relative times (the browser's when omitted). Stories and tests fix it. */
  now?: number;
  /** The missions this game completed (#595), Challenge only: listed under the reward. None or empty: no list. */
  missions?: readonly GameMission[];
  /** The list's way to the Missions page, where their Cobbles are claimed. */
  onMissions?: () => void;
  onPlayAgain?: () => void;
  onHome?: () => void;
}

const CATEGORY_CODES = Object.values(CategoryType);
const info = (category: CategoryType) => categoryInfo(CATEGORY_CODES.indexOf(category));
const tilesOf = (n: number) => `${n} ${n === 1 ? "tile" : "tiles"}`;

const duration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
};

/**
 * The end of a game (`/game/:id/over`, `/training/over`): the final score, its figures, every closing, the reward, as a
 * translucent overlay over the final board (#539, #720). The board is the background from the start; "Board" hides the
 * overlay and frees the board to pan and zoom, "Scores" shows it again. One bar for both, the board's own HUD (`GameHud`):
 * Back, the mode ("Training", "Challenge #id"), the score. Mobile first: one column, the headline figures first; two columns
 * on desktop.
 */
export function OverScene(props: OverSceneProps) {
  const { board, onViewChange, loadBoard = loadFinalBoard } = props;
  const [inner, setInner] = useState<OverView>("scores");
  const view = board ? (props.view ?? inner) : "scores";
  const setView = (next: OverView) => {
    setInner(next);
    onViewChange?.(next);
  };
  const shown = useRef(view);
  shown.current = view;
  // Wanted as soon as there is a board (the route may read its tiles after the scores), then kept mounted under the scores:
  // the canvas keeps its context and its models. A failed load is wanted again at the next "Board".
  const hasBoard = board !== undefined;
  const [wanted, setWanted] = useState(hasBoard);
  useEffect(() => {
    if (hasBoard) setWanted(true);
  }, [hasBoard]);
  useEffect(() => {
    if (view === "board") setWanted(true);
  }, [view]);
  const finalBoard = useDeferred(loadBoard, wanted, (e) => {
    setWanted(false);
    // Under the scores the board stays the plain background, and the next "Board" loads it again; asked for, it says why.
    if (shown.current !== "board") return;
    setView("scores");
    // Where the failure names no URL (Safari), a new try cannot fetch it again: only a reload can.
    const message = failedModuleUrl(e) ? "The board could not load. Check your connection and try again." : "The board could not load. Check your connection and reload the page.";
    toastError({ title: "Final board", message, detail: errorDetail(e) });
  });

  const onBoard = view === "board";
  return (
    <div className="relative h-dvh min-h-[32rem] overflow-hidden bg-board text-foreground">
      {board && wanted && (
        // Under the scores it takes no input (`inert`), and its ambient effects stop (#572); "Board" frees it.
        <div data-testid="final-board" aria-hidden={!onBoard} inert={!onBoard} className={cn("absolute inset-0", !onBoard && "pointer-events-none")}>
          {finalBoard ? (
            <BoardCovered.Provider value={!onBoard}>
              <finalBoard.default {...board} />
            </BoardCovered.Provider>
          ) : (
            onBoard && (
              <p role="status" className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
                Loading the board…
              </p>
            )
          )}
        </div>
      )}
      {/* The bar where the board's HUD stands (`board-scene.tsx`), so the move from the board to its end does not jump. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <div className="flex justify-center p-2 pt-[max(0.5rem,env(safe-area-inset-top))] tablet:p-4">
          <GameHud
            title={props.mode === "challenge" ? `Challenge #${props.game.id}` : "Training"}
            score={props.game.score}
            now={0}
            onBack={onBoard ? () => setView("scores") : props.onHome}
            className="pointer-events-auto w-full max-w-2xl"
          />
        </div>
        <ScrollRegion aria-hidden={onBoard} className={cn("pointer-events-auto min-h-0 flex-1", onBoard && "invisible")}>
          <Scores {...props} />
        </ScrollRegion>
      </div>
      {board && (
        // Over the scores, a bar under the toggle so the rows it passes over do not show through; over the board, none.
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
            !onBoard && "border-t border-border bg-card/95 pt-3 backdrop-blur",
          )}
        >
          <ToggleGroup
            type="single"
            variant="outline"
            size="lg"
            aria-label="Show"
            value={view}
            onValueChange={(next) => next && setView(next as OverView)}
            className="pointer-events-auto rounded-xl bg-card/95 p-1 shadow-lg backdrop-blur"
          >
            <ToggleGroupItem value="scores" className="min-w-32">
              <Icon name="star" fixedWidth />
              Scores
            </ToggleGroupItem>
            <ToggleGroupItem value="board" className="min-w-32">
              <Icon name="table-cells-large" fixedWidth />
              Board
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}
    </div>
  );
}

/** The scores: the over screen's overlay, a translucent panel (as the HUD) scrolled on its own over the board. */
function Scores({ game, closings, previousBest, reward, settling, onSettle, settle, freeGame, rewardUnavailable, deadline, closingsNote, now, stats, board, missions, onMissions, onPlayAgain, onHome }: OverSceneProps) {
  const clock = useClock(now);
  const play = useSfx();
  useEffect(() => play("gameover"), [play]);
  useEffect(() => {
    if (reward.state === "rewarded") play("cobbles");
  }, [reward.state, play]);
  const best = previousBest != null && game.score > previousBest;
  const byCategory = CLOSING_CATEGORIES.map((category) => {
    const of = closings.filter((c) => c.category === category);
    return { category, count: of.length, points: of.reduce((s, c) => s + c.points, 0) };
  }).filter((c) => c.count > 0);
  return (
    <main className={cn("mx-auto w-full max-w-md px-2 pb-8 tablet:max-w-2xl tablet:px-4 desktop:max-w-5xl", board && "pb-28")}>
      <div
        data-slot="card"
        data-testid="scores-overlay"
        className="grid gap-4 rounded-xl border border-border bg-card/90 p-2 shadow-lg backdrop-blur mobile:p-3 tablet:p-4 desktop:grid-cols-2 desktop:items-start"
      >
        <div className="flex flex-col gap-4">
          <section
            data-slot="card"
            data-testid="final-score"
            className="flex flex-col items-center gap-2 rounded-xl border border-primary/30 bg-[radial-gradient(80%_70%_at_50%_0%,var(--glow),var(--card))] px-4 py-6 text-center"
          >
            <Score value={game.score} size="xl" tone="gold" className="items-center" />
            <span className="flex flex-wrap justify-center gap-2">
              {freeGame && <Badge variant="secondary">Free game</Badge>}
              {best && <Badge>New best</Badge>}
            </span>
            {previousBest != null && !best && previousBest > 0 && <span className="text-xs text-muted-foreground">Best: <span className="numeric">{formatPoints(previousBest)}</span></span>}
          </section>

          {stats && <Highlights stats={stats} />}

          <section data-slot="card" aria-label="Game metrics" className="rounded-xl border border-border bg-card px-4 py-2">
            {stats ? (
              <>
                <StatRow icon="table-cells-large" label="Tiles placed" hint="The starter tile not counted" value={stats.placed} />
                <StatRow
                  icon="xmark"
                  label="Tiles discarded"
                  hint={stats.discarded > 0 ? `${formatPoints(stats.discardPenalty)} pts taken` : undefined}
                  value={stats.discarded}
                  tone={stats.discardPenalty > 0 ? "danger" : "default"}
                />
                {stats.categories.map((c) => (
                  <StatRow key={c.category} icon={<CategoryIcon category={CATEGORY_CODES.indexOf(c.category)} size="sm" />} label={`${info(c.category).plural} closed`} hint={`${formatPoints(c.points)} pts`} value={c.closed} />
                ))}
                <StatRow icon="flag" label="Left open" hint={openHint(stats.open.largest)} value={stats.open.count} tone="muted" />
              </>
            ) : (
              <>
                <StatRow icon="table-cells-large" label="Tiles placed" value={game.placedCount} />
                {byCategory.map((c) => (
                  <StatRow
                    key={c.category}
                    icon={<CategoryIcon category={c.category} size="sm" />}
                    label={`${categoryInfo(c.category).plural} closed`}
                    hint={`${formatPoints(c.points)} pts`}
                    value={c.count}
                  />
                ))}
              </>
            )}
            {game.endTime > 0 && game.startTime > 0 && <StatRow icon="clock" label="Time played" value={duration(game.endTime - game.startTime)} />}
          </section>

          {freeGame ? (
            <section aria-label="Reward" data-state="free-game" className="flex flex-col gap-1 rounded-xl border border-border bg-secondary/40 p-4">
              <span className="flex items-center gap-2 font-semibold">
                <Icon name="gift" className="text-primary" size="md" />
                Free game
              </span>
              <p className="text-sm text-muted-foreground">A free game costs no stake and pays no reward: there is nothing to settle.</p>
            </section>
          ) : rewardUnavailable ? (
            <Notice title="Reward unavailable">The reward cannot be read on this network.</Notice>
          ) : (
            <>
              <RewardPanel
                state={reward.state}
                reward={reward.amount}
                stake={reward.stake}
                score={game.score}
                threshold={reward.threshold}
                curve={reward.curve}
                settling={settling}
                onSettle={onSettle}
              />
              {/* The chain says it expired: a slow browser clock must not read "in 3 min", so the clock is clamped past it. */}
              {reward.state === "expired" && deadline != null && (
                <p className="-mt-2 px-1 text-sm text-muted-foreground">
                  The 24 h{" "}
                  <When at={deadline} now={Math.max(clock, deadline + 1)} ended />.
                </p>
              )}
              {settle && <SettleArea {...settle} now={clock} />}
            </>
          )}

          {missions && <GameMissions missions={missions} onOpen={onMissions} />}
        </div>

        <div className="flex flex-col gap-4">
          <section data-slot="card" aria-label="Closings" className="flex flex-col rounded-xl border border-border bg-card">
            <header className="flex items-center justify-between px-4 pt-3 pb-2">
              <h2 className="font-display text-sm font-semibold">Every closing</h2>
              <span className="text-xs text-muted-foreground">{closings.length}</span>
            </header>
            <Separator />
            {closings.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">{closingsNote ?? "No structure closed in this game."}</p>
            ) : (
              <ScrollArea className={closings.length > 8 ? "h-80 desktop:h-[28rem]" : undefined}>
                <ol className="flex flex-col divide-y divide-border px-4">
                  {closings.map((c, i) => (
                    <li key={i} className="py-2">
                      <ClosingLine closing={c} move={c.tileId} tiles={stats?.closings.length === closings.length ? stats.closings[i]?.tiles : undefined} />
                    </li>
                  ))}
                </ol>
              </ScrollArea>
            )}
          </section>
          <div className="grid grid-cols-2 gap-3">
            <Button size="lg" onClick={onPlayAgain}>Play again</Button>
            <Button size="lg" variant="secondary" onClick={onHome}>Home</Button>
          </div>
        </div>
      </div>
    </main>
  );
}

/** "Largest: a forest of 6 tiles", or nothing when no structure was left. */
function openHint(largest: OpenStructure | null): string | undefined {
  return largest ? `Largest: a ${info(largest.category).label.toLowerCase()} of ${tilesOf(largest.tiles)}` : undefined;
}

/**
 * The headline figures (#539): the largest closed city, the longest road, the largest forest (in tiles, the distinct tiles
 * D-19 counts), the wonders, the most valuable closing. Two columns from 375 px; a figure with nothing closed says so.
 */
function Highlights({ stats }: { stats: GameStats }) {
  const of = (category: CategoryType) => stats.categories.find((c) => c.category === category);
  const wonders = of(CategoryType.Wonder);
  const cells: { key: string; category: CategoryType; label: string; value: string; hint: string }[] = [
    structureCell("Largest city", CategoryType.City, of(CategoryType.City)?.largest ?? null),
    structureCell("Longest road", CategoryType.Road, of(CategoryType.Road)?.largest ?? null),
    structureCell("Largest forest", CategoryType.Forest, of(CategoryType.Forest)?.largest ?? null),
    {
      key: "wonders",
      category: CategoryType.Wonder,
      label: "Wonders",
      value: `${wonders?.closed ?? 0}`,
      hint: wonders && wonders.closed > 0 ? `${formatPoints(wonders.points)} pts` : "None closed",
    },
  ];
  return (
    <section data-slot="card" aria-label="Highlights" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <dl className="grid grid-cols-2 gap-2">
        {cells.map((c) => (
          <div key={c.key} data-testid={`highlight-${c.key}`} className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-secondary/40 px-3 py-2">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CategoryIcon category={CATEGORY_CODES.indexOf(c.category)} size="xs" />
              <span className="wrap-anywhere">{c.label}</span>
            </dt>
            <dd className="numeric text-base font-semibold">{c.value}</dd>
            <dd className="text-xs wrap-anywhere text-muted-foreground">{c.hint}</dd>
          </div>
        ))}
      </dl>
      <BestClosing best={stats.best} />
      <p className="px-1 text-xs text-muted-foreground">Sizes count the tiles a structure spans.</p>
    </section>
  );
}

/** Keyed by the category's name (`highlight-city`), not a literal: a string in the icon table above would read as an icon. */
function structureCell(label: string, category: CategoryType, largest: ClosedStructure | null) {
  return {
    key: info(category).label.toLowerCase(),
    category,
    label,
    value: largest ? tilesOf(largest.tiles) : "—",
    hint: largest ? `${formatPoints(largest.points)} pts` : "None closed",
  };
}

/** The closing worth the most points, with the move that closed it. */
function BestClosing({ best }: { best: ClosedStructure | null }) {
  if (!best) return null;
  const { label } = info(best.category);
  return (
    <div data-testid="highlight-best" className="flex items-center gap-3 rounded-lg border border-primary/30 bg-secondary/40 px-3 py-2">
      <Icon name="medal" className="text-primary" fixedWidth />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs text-muted-foreground">Best closing</span>
        <span className="flex items-center gap-1.5 text-sm wrap-anywhere">
          <CategoryIcon category={CATEGORY_CODES.indexOf(best.category)} size="xs" />
          {best.category === CategoryType.Wonder ? label : `${label} of ${tilesOf(best.tiles)}`}, tile {best.tileId}
        </span>
      </span>
      <span className="numeric text-sm font-semibold whitespace-nowrap text-primary">{formatPoints(best.points)} pts</span>
    </div>
  );
}

/** A game boundary: how long ago or from now, then its UTC time (the deadline's `<time>`). */
function When({ at, now, ended }: { at: number; now: number; ended?: boolean }) {
  return <Boundary at={at} now={now} ended={ended} join="paren" />;
}

/** The settle area under the reward (P7a): when the day can be settled, then the button, its refusal and its outcome. */
function SettleArea({ state, at, message, detail, onSettle, onConnect, now }: SettleProps & { now: number }) {
  return (
    <section aria-label="Settle" data-state={state} className="flex flex-col gap-3">
      {state === "after" && at != null && (
        <p className="flex items-start gap-2 px-1 text-sm text-muted-foreground">
          <Icon name="clock" size="sm" className="mt-0.5" />
          <span>
            {at > now ? <>Settles <When at={at} now={now} />.</> : "This game can be settled now."} The day closes with the end of the next day.
          </span>
        </p>
      )}
      {state === "viewing" && <p className="px-1 text-sm text-muted-foreground">This game can be settled now. The player settles it from their own account.</p>}
      {state === "connect" && <Button onClick={onConnect}>Connect to settle</Button>}
      {(state === "ready" || state === "pending" || state === "refused") && (
        <Button onClick={onSettle} loading={state === "pending"}>
          {state === "pending" ? "Settling…" : "Settle and claim"}
        </Button>
      )}
      <InlineError title="Settle refused" message={state === "refused" ? message : null} detail={detail} />
      {state === "settled" && (
        <p className="flex items-center gap-2 px-1 text-sm text-success">
          <Icon name="circle-check" size="sm" />
          Settled
        </p>
      )}
      {state === "done" && <p className="px-1 text-sm text-muted-foreground">Already settled.</p>}
    </section>
  );
}
