import * as m from "motion/react-m";
import { formatInteger, formatPercent } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { leagueOf, shareOf, type PvpPlayer } from "../../lib/pvp-rules";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Cobbles } from "../elements/cobbles";
import { Countdown } from "../elements/countdown";
import { Crowns } from "../elements/crowns";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { LeagueCrest } from "../elements/league-crest";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { TopBar } from "../containers/top-bar";

/**
 * The village reward after an attack (owner decision, #637: at once, no timer, with a daily cap): `offer` (three tiles, or the
 * Cobbles; the choice is #646's reward sheet), `capped` (the day's rewards are taken: the next at `resetsAt`), `none` (no star).
 */
export type PvpReward = { state: "offer"; plans: readonly [number, number, number]; cobbles: number } | { state: "capped"; resetsAt: number } | { state: "none" };

export interface PvpResultSceneProps {
  defender: PvpPlayer;
  stars: number;
  score: number;
  target: number;
  /** The crowns the attack won (positive) or lost. */
  crowns: number;
  /** The attacker's crowns after it. */
  crownsAfter: number;
  reward: PvpReward;
  /** Seconds since the epoch: the cap's countdown. */
  now: number;
  /** The result is being recorded (#643's finish): the crowns are not final yet. */
  pending?: boolean;
  error?: string | null;
  errorDetail?: ErrorDetail;
  tileArt?: TileArt;
  /** Opens #646's reward sheet: place one of the three tiles, or take the Cobbles. */
  onReward?: () => void;
  onReplay?: () => void;
  /** Another attack: back to the search. */
  onAgain?: () => void;
  onHome?: () => void;
}

const VERDICT = ["Defeat", "Victory", "Victory", "Triumph"] as const;

/**
 * The end of an attack (#647): the stars won, the score against the village's, the crowns won or lost and the league they
 * leave the attacker in (a promotion or a drop said in words), then the village reward. One column on a phone, the same
 * column centred on a desktop.
 */
export function PvpResultScene(props: PvpResultSceneProps) {
  const { stars, score, target, crowns, crownsAfter, reward } = props;
  const before = leagueOf(crownsAfter - crowns);
  const after = leagueOf(crownsAfter);
  const moved = after.id !== before.id ? (after.from > before.from ? "up" : "down") : null;
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopBar title="Attack over" onBack={props.onHome} />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-5 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <section aria-label="Result" className="flex flex-col items-center gap-2 text-center">
          <div role="img" aria-label={`${stars} of 3 stars`} data-stars={stars} className="flex items-end gap-2">
            {[1, 2, 3].map((n) => (
              <m.span
                key={n}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15 + n * 0.25, type: "spring", stiffness: 380, damping: 18 }}
                className={cn(n === 2 && "-translate-y-3")}
              >
                <Icon name="star" size="xl" className={cn("text-[3.5rem]!", n <= stars ? "text-primary drop-shadow-lg" : "text-muted-foreground/30")} />
              </m.span>
            ))}
          </div>
          <h2 className="font-display text-4xl">{VERDICT[Math.min(stars, 3)]}</h2>
          <p className="text-sm text-muted-foreground">
            against <span className="font-semibold text-foreground">{props.defender.name ?? "their village"}</span>
          </p>
        </section>

        <dl className="grid w-full grid-cols-2 gap-2">
          <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card px-3 py-3">
            <dt className="text-xs text-muted-foreground">Score</dt>
            <dd className="numeric text-2xl font-semibold leading-none">{formatInteger(score)}</dd>
            <dd className="text-xs text-muted-foreground">
              <span className="numeric font-semibold text-foreground">{formatPercent(shareOf(score, target), { maxFractionDigits: 0 })}</span> of{" "}
              <span className="numeric">{formatInteger(target)}</span>
            </dd>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card px-3 py-3">
            <dt className="text-xs text-muted-foreground">Crowns</dt>
            <dd>
              <Crowns value={crowns} signed size="lg" />
            </dd>
            <dd className="flex items-center gap-1 text-xs text-muted-foreground">
              now <Crowns value={crownsAfter} size="sm" />
            </dd>
          </div>
        </dl>

        <div className={cn("flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm", moved === "up" ? "bg-primary/15" : "bg-secondary/60")}>
          {moved === "up" && <span className="font-semibold">Promoted to</span>}
          {moved === "down" && <span className="font-semibold">Dropped to</span>}
          {!moved && <span className="text-muted-foreground">League</span>}
          <LeagueCrest league={after} />
        </div>

        <InlineError title="Result" message={props.error} detail={props.errorDetail} className="w-full" />

        <section aria-label="Reward" data-input-surface className="flex w-full flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <h3 className="font-semibold">Village reward</h3>
          {reward.state === "offer" && (
            <>
              <p className="text-sm text-muted-foreground">Pick one tile for your village and place it now, or take the Cobbles.</p>
              <div className="flex items-center justify-center gap-3">
                {reward.plans.map((plan, i) => (
                  <TileChip key={i} plan={plan} art={props.tileArt} size="md" />
                ))}
                <span className="text-xs text-muted-foreground">or</span>
                <Cobbles value={reward.cobbles} sign="+" />
              </div>
              <Button size="lg" onClick={props.onReward} disabled={props.pending}>
                <Icon name="gift" size="sm" />
                Choose
              </Button>
            </>
          )}
          {reward.state === "capped" && (
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              Today's rewards are all taken. The next comes in
              <Countdown expiresAt={reward.resetsAt} now={props.now} label="Next reward" hideLabel className="text-foreground" />
            </p>
          )}
          {reward.state === "none" && <p className="text-sm text-muted-foreground">No star, no reward. Reach 70 % of a village's score for the first star.</p>}
        </section>

        <div className="mt-auto grid w-full grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" onClick={props.onReplay}>
            <Icon name="film" size="sm" />
            Replay
          </Button>
          <Button variant={reward.state === "offer" ? "secondary" : "default"} size="lg" onClick={props.onAgain} loading={props.pending}>
            <Icon name="swords" size="sm" />
            Attack again
          </Button>
        </div>
      </main>
    </div>
  );
}
