import type { GameView, ScoredStructure } from "@paved/chain";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Separator } from "../ui/separator";
import { CLOSING_CATEGORIES, categoryInfo } from "../elements/category";
import { Score, formatPoints } from "../elements/score";
import { StatRow } from "../elements/stat-row";
import { ClosingLine } from "../containers/closing-feed";
import { RewardPanel, type RewardState } from "../containers/reward-panel";
import { TopBar } from "../containers/top-bar";

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
  onPlayAgain?: () => void;
  onHome?: () => void;
}

const duration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
};

/** The end of a game (`/game/:id/over`, `/training/over`): the final score, its metrics, every closing, the reward. */
export function OverScene({ mode, game, closings, previousBest, rank, reward, settling, onSettle, onPlayAgain, onHome }: OverSceneProps) {
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
              {best && <Badge>New best</Badge>}
              {rank != null && <Badge variant="outline">#{rank} today</Badge>}
            </span>
          </section>

          <section data-slot="card" aria-label="Game metrics" className="rounded-xl border border-border bg-card px-4 py-2">
            <StatRow icon="tiles" label="Tiles placed" value={game.placedCount} />
            <StatRow icon="discard" label="Tiles discarded" value={game.discardedCount} tone={game.discardedCount > 0 ? "muted" : "default"} />
            {byCategory.map((c) => (
              <StatRow
                key={c.category}
                icon={categoryInfo(c.category).glyph}
                label={`${categoryInfo(c.category).plural} closed`}
                hint={`${formatPoints(c.points)} pts`}
                value={c.count}
              />
            ))}
            {game.endTime > 0 && <StatRow icon="clock" label="Time played" value={duration(game.endTime - game.startTime)} />}
          </section>

          <RewardPanel
            state={reward.state}
            reward={reward.amount}
            stake={reward.stake}
            score={game.score}
            threshold={reward.threshold}
            settling={settling}
            onSettle={onSettle}
          />
        </div>

        <div className="flex flex-col gap-4">
          <section data-slot="card" aria-label="Closings" className="flex flex-col rounded-xl border border-border bg-card">
            <header className="flex items-center justify-between px-4 pt-3 pb-2">
              <h2 className="text-sm font-semibold">Every closing</h2>
              <span className="text-xs text-muted-foreground">{closings.length}</span>
            </header>
            <Separator />
            {closings.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">No structure closed in this game.</p>
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
