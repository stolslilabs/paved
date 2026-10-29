import { useState } from "react";
import * as m from "motion/react-m";
import { formatInteger, formatPercent } from "@paved/game-core";
import { useDeferred } from "../../lib/deferred";
import { cn } from "../../lib/utils";
import { errorDetail } from "../../routes/error-detail";
import { leagueOf, shareOf, type PvpPlayer } from "../../lib/pvp-rules";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { Cobbles } from "../elements/cobbles";
import { Countdown } from "../elements/countdown";
import { Crowns } from "../elements/crowns";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { LeagueCrest } from "../elements/league-crest";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { toastError } from "../containers/error-toast";
import type { RewardOffer } from "../containers/reward-sheet";
import { TopBar } from "../containers/top-bar";
import type { Village } from "../containers/village-rules";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import type { VillagePlace } from "./village-scene";

// The village and its reward sheet (#646) are their own chunk: loaded at the first Choose, never with the result.
const loadVillage = () => import("./village-scene");

/**
 * The village reward after an attack (owner decision, #637: at once, no timer, with a daily cap): `offer` (three tiles, or the
 * Cobbles; chosen on #646's reward sheet, over the player's village), `taken` (chosen: a tile placed or copied, or the
 * Cobbles), `capped` (the day's rewards are taken: the next at `resetsAt`), `none` (no star), `loading` (the reward is being
 * read), `error` (its read failed: said, with Retry, never taken for a capped day).
 */
export type PvpReward =
  | { state: "offer"; offer: RewardOffer }
  /** Granted, its three tiles not drawn yet (#642's `open_reward`, a VRF draw): Open draws them. */
  | { state: "sealed"; pending: number }
  | { state: "taken"; plan: number | null; cobbles: number | null }
  | { state: "capped"; resetsAt: number }
  | { state: "none" }
  | { state: "loading" }
  | { state: "error"; message: string; detail?: ErrorDetail };

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
  /** The player's own village: the reward sheet places its tile there. */
  village: Village;
  /** The player's Cobbles, on the village's top bar. */
  balance: number;
  /** Seconds since the epoch: the cap's countdown. */
  now: number;
  /** The result is being recorded (#643's finish): the crowns are not final yet. */
  pending?: boolean;
  error?: string | null;
  errorDetail?: ErrorDetail;
  tileArt?: TileArt;
  /** The reward's tile placed on a free cell of the village (#646's sheet). */
  onPlace?: (place: VillagePlace) => void;
  /** The Cobbles taken instead of a tile. */
  onTakeCobbles?: () => void;
  /** `sealed`: the reward's three tiles drawn. */
  onOpenReward?: () => void;
  /** `sealed`: the draw is on its way. */
  opening?: boolean;
  onReplay?: () => void;
  /** `error`: the reward is read again. */
  onRetryReward?: () => void;
  /** Another attack: back to the search. */
  onAgain?: () => void;
  onHome?: () => void;
}

const VERDICT = ["Defeat", "Victory", "Victory", "Triumph"] as const;

/**
 * The end of an attack (#647): the stars won, the score against the village's, the crowns won or lost and the league they
 * leave the attacker in (a promotion or a drop said in words), then the village reward: Choose opens the player's village
 * with #646's reward sheet (drag a tile to a lit cell, or take the Cobbles), full screen;
 * a choice closes it. One column on a phone, the same column centred on a desktop.
 */
export function PvpResultScene(props: PvpResultSceneProps) {
  const { stars, score, target, crowns, crownsAfter, reward } = props;
  const [choosing, setChoosing] = useState(false);
  const open = choosing && reward.state === "offer";
  const villageScene = useDeferred(loadVillage, open, (e) => {
    setChoosing(false);
    toastError({ title: "Reward", message: "Your village could not load. Check your connection and try again.", detail: errorDetail(e) });
  });
  const chosen = <A,>(callback: ((a: A) => void) | undefined) => (a: A) => {
    setChoosing(false);
    callback?.(a);
  };
  const before = leagueOf(crownsAfter - crowns);
  const after = leagueOf(crownsAfter);
  const moved = after.index !== before.index ? (after.from > before.from ? "up" : "down") : null;
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* No balances in its bar: the result shows its Cobbles in place (#720, `routes/header-balances.ts`). */}
      <TopBar title="Attack over" onBack={props.onHome} balances={false} />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-5 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {/* The verdict on a card, as every page's content starts (HEADER-HEIGHT, #676): at the one line under the header. */}
        <section aria-label="Result" className="flex w-full flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-5 text-center">
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
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
                {reward.offer.plans.map((plan, i) => (
                  <TileChip key={i} plan={plan} art={props.tileArt} size="md" />
                ))}
                <span className="text-xs text-muted-foreground">or</span>
                <Cobbles value={reward.offer.cobbles} sign="+" />
              </div>
              <Button size="lg" onClick={() => setChoosing(true)} disabled={props.pending} loading={choosing && !villageScene}>
                <Icon name="treasure-chest" size="sm" />
                Choose
              </Button>
            </>
          )}
          {reward.state === "sealed" && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">Your reward is waiting: open it to draw its three tiles.</p>
              <Button size="lg" onClick={props.onOpenReward} disabled={props.pending} loading={props.opening}>
                <Icon name="treasure-chest" size="sm" />
                Open the reward
              </Button>
            </div>
          )}
          {reward.state === "taken" && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Icon name="check" size="sm" className="text-success" />
              {reward.plan != null ? (
                <>
                  <TileChip plan={reward.plan} art={props.tileArt} size="sm" />
                  Placed in your village.
                </>
              ) : (
                <>
                  <Cobbles value={reward.cobbles ?? 0} sign="+" /> taken.
                </>
              )}
            </p>
          )}
          {reward.state === "capped" && (
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              Today's rewards are all taken. The next comes in
              <Countdown expiresAt={reward.resetsAt} now={props.now} label="Next reward" hideLabel className="text-foreground" />
            </p>
          )}
          {reward.state === "none" && <p className="text-sm text-muted-foreground">No star, no reward. Reach 70 % of a village's score for the first star.</p>}
          {reward.state === "loading" && <Skeleton aria-label="Reading your reward" className="h-10 rounded-lg" />}
          {reward.state === "error" && (
            <InlineError
              title="Village reward"
              message={reward.message}
              detail={reward.detail}
              action={
                props.onRetryReward && (
                  <Button size="sm" variant="secondary" onClick={props.onRetryReward}>
                    Try again
                  </Button>
                )
              }
            />
          )}
        </section>

        <div className="mt-auto grid w-full gap-2 mobile:grid-cols-2">
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

      {villageScene && (
        <Dialog open={open} onOpenChange={setChoosing}>
          <DialogContent
            showClose={false}
            aria-describedby={undefined}
            className="inset-0 top-0 left-0 h-dvh max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-background p-0 sm:max-w-none"
          >
            <DialogTitle className="sr-only">Village reward</DialogTitle>
            <villageScene.VillageScene
              village={props.village}
              reward={reward.state === "offer" ? reward.offer : null}
              tileArt={props.tileArt}
              onBack={() => setChoosing(false)}
              onPlace={chosen(props.onPlace)}
              onTakeCobbles={() => {
                setChoosing(false);
                props.onTakeCobbles?.();
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
