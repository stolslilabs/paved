import type { GameView, ScoredStructure } from "@paved/chain";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { ScrollArea } from "../ui/scroll-area";
import { Separator } from "../ui/separator";
import { CLOSING_CATEGORIES, categoryInfo } from "../elements/category";
import { Score, formatPoints } from "../elements/score";
import { StatRow } from "../elements/stat-row";
import { Notice } from "../elements/notice";
import { formatLocal, formatUtc } from "../elements/deadline";
import { ClosingLine } from "../containers/closing-feed";
import { RewardPanel, type RewardState } from "../containers/reward-panel";
import { TopBar } from "../containers/top-bar";

/**
 * What the settle area shows (P7a, a Challenge game bought with a stake, not settled): `after` (the day cannot be settled
 * yet: "Settles after <date>"), `connect` (a guest), `ready` (the player's button), `viewing` (settleable, shown to someone
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
  /** The rank this score holds today, Challenge only. */
  rank?: number | null;
  reward: {
    state: RewardState;
    /** PAVED base units. */
    amount?: bigint;
    stake?: number;
    /** Points (`threshold / 1000`). */
    threshold?: number;
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
  /** `expired`: the 24 h deadline the game missed (`terms.time + 86400`), seconds since the epoch. */
  deadline?: number;
  /** Why the list of closings is not shown, when it could not be read. */
  closingsNote?: string;
  /** An IANA zone for the dates; the viewer's own when omitted. Stories and tests fix it. */
  timeZone?: string;
  onPlayAgain?: () => void;
  onHome?: () => void;
}

const duration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
};

/** The end of a game (`/game/:id/over`, `/training/over`): the final score, its metrics, every closing, the reward. */
export function OverScene({ mode, game, closings, previousBest, rank, reward, settling, onSettle, settle, freeGame, deadline, closingsNote, timeZone, onPlayAgain, onHome }: OverSceneProps) {
  const best = previousBest != null && game.score > previousBest;
  const byCategory = CLOSING_CATEGORIES.map((category) => {
    const of = closings.filter((c) => c.category === category);
    return { category, count: of.length, points: of.reduce((s, c) => s + c.points, 0) };
  }).filter((c) => c.count > 0);
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopBar title="Final score" onBack={onHome} />
      <main className="mx-auto grid w-full max-w-md gap-4 px-4 pt-2 pb-8 tablet:max-w-2xl desktop:max-w-5xl desktop:grid-cols-2 desktop:items-start">
        <div className="flex flex-col gap-4">
          <section
            data-slot="card"
            className="flex flex-col items-center gap-2 rounded-2xl border border-gold-900 bg-[radial-gradient(80%_70%_at_50%_0%,var(--color-gold-950),var(--color-ink-900))] px-4 py-6 text-center"
          >
            <span className="text-sm text-muted-foreground">{mode === "challenge" ? `Challenge #${game.id}` : "Training"}</span>
            <Score value={game.score} size="xl" tone="gold" className="items-center" />
            <span className="flex flex-wrap justify-center gap-2">
              {freeGame && <Badge variant="secondary">Free game</Badge>}
              {best && <Badge>New best</Badge>}
              {rank != null && <Badge variant="outline">#{rank} today</Badge>}
            </span>
          </section>

          <section data-slot="card" aria-label="Game metrics" className="rounded-xl border border-border bg-card px-4 py-2">
            <StatRow icon="table-cells-large" label="Tiles placed" value={game.placedCount} />
            {byCategory.map((c) => (
              <StatRow
                key={c.category}
                icon={categoryInfo(c.category).icon}
                label={`${categoryInfo(c.category).plural} closed`}
                hint={`${formatPoints(c.points)} pts`}
                value={c.count}
              />
            ))}
            {game.endTime > 0 && <StatRow icon="clock" label="Time played" value={duration(game.endTime - game.startTime)} />}
          </section>

          {freeGame ? (
            <section aria-label="Reward" data-state="free-game" className="flex flex-col gap-1 rounded-xl border border-border bg-secondary/40 p-4">
              <span className="flex items-center gap-2 font-semibold">
                <Icon name="gift" className="text-primary" size="md" />
                Free game
              </span>
              <p className="text-sm text-muted-foreground">A free game costs no stake and pays no reward: there is nothing to settle.</p>
            </section>
          ) : (
            <>
              <RewardPanel
                state={reward.state}
                reward={reward.amount}
                stake={reward.stake}
                score={game.score}
                threshold={reward.threshold}
                settling={settling}
                onSettle={onSettle}
              />
              {reward.state === "expired" && deadline != null && (
                <p className="-mt-2 px-1 text-sm text-muted-foreground">
                  The 24 h ended <When at={deadline} timeZone={timeZone} />.
                </p>
              )}
              {settle && <SettleArea {...settle} timeZone={timeZone} />}
            </>
          )}
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
                      <ClosingLine closing={c} move={c.tileId} />
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
      </main>
    </div>
  );
}

/** A moment in the viewer's zone, its UTC form on hover (the same `<time>` as the deadline's). */
function When({ at, timeZone }: { at: number; timeZone?: string }) {
  return (
    <time dateTime={new Date(at * 1000).toISOString()} title={formatUtc(at)} className="whitespace-nowrap text-foreground">
      {formatLocal(at, timeZone)}
    </time>
  );
}

/** The settle area under the reward (P7a): when the day can be settled, then the button, its refusal and its outcome. */
function SettleArea({ state, at, message, onSettle, onConnect, timeZone }: SettleProps & { timeZone?: string }) {
  return (
    <section aria-label="Settle" data-state={state} className="flex flex-col gap-3">
      {state === "after" && at != null && (
        <p className="flex items-start gap-2 px-1 text-sm text-muted-foreground">
          <Icon name="clock" size="sm" className="mt-0.5" />
          <span>
            Settles after <When at={at} timeZone={timeZone} />. The day closes with the end of the next day.
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
      {state === "refused" && (
        <Notice tone="danger" title="Settle refused">
          {message}
        </Notice>
      )}
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
