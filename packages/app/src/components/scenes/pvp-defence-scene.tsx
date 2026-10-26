import { formatInteger, formatPercent, formatRelative } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { shareOf, type PvpPlayer } from "../../lib/pvp-rules";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { Countdown } from "../elements/countdown";
import { Crowns } from "../elements/crowns";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { PlayerName } from "../elements/player-name";
import { StarRow } from "../elements/star-row";
import { TabFrame } from "../containers/tab-frame";
import { TopBar } from "../containers/top-bar";
import type { Tab } from "../../routes/pages";

/** One attack on the player's village, as #643 records it. */
export interface DefenceEntry {
  id: number;
  attacker: PvpPlayer;
  stars: number;
  score: number;
  /** The village's score when it was attacked: the target. */
  target: number;
  /** The crowns the defender lost (negative) or won (positive: the attack took no star). */
  crowns: number;
  /** Seconds since the epoch. */
  at: number;
  /** The replay can be played (its moves are readable); false while #643 has not kept them. */
  replay: boolean;
}

export interface PvpDefenceSceneProps {
  /** The attacks on the player's village, newest first; null while they load. */
  attacks: readonly DefenceEntry[] | null;
  /** The village's shield, while it lasts (seconds since the epoch): 8 hours after an attack, dropped by attacking. */
  shieldEndsAt?: number | null;
  now: number;
  error?: string | null;
  errorDetail?: ErrorDetail;
  onBack?: () => void;
  /** A pick in the phone's bar (#763): the page is the League tab's. */
  onNavigate?: (tab: Tab) => void;
  onReplay?: (id: number) => void;
  onRetry?: () => void;
  /** The shield is not known: its read is on its way or failed (`error` says why). Never shown as "No shield". */
  shieldUnknown?: boolean;
}

/** The shield's card: its timer while it lasts, else the village is open to attacks. */
function ShieldCard({ endsAt, now, unknown }: { endsAt: number | null | undefined; now: number; unknown?: boolean }) {
  const on = !unknown && endsAt != null && endsAt > now;
  if (unknown) {
    return (
      <section aria-label="Shield" data-shield="unknown" className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <Icon name="shield-halved" size="xl" className="text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold">Shield not known</span>
          <span className="text-xs text-muted-foreground">Your shield could not be read yet.</span>
        </div>
      </section>
    );
  }
  return (
    <section aria-label="Shield" data-shield={on ? "on" : "off"} className={cn("flex items-center gap-3 rounded-xl border px-4 py-3", on ? "border-info/40 bg-info/10" : "border-border bg-card")}>
      <Icon name="shield-halved" size="xl" className={on ? "text-info" : "text-muted-foreground"} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold">{on ? "Your village is shielded" : "No shield"}</span>
        <span className="text-xs text-muted-foreground">{on ? "No one can attack it until the shield ends. Attacking drops it." : "Your village can be attacked. An attack shields it for 8 hours."}</span>
      </div>
      {on && <Countdown expiresAt={endsAt!} now={now} label="Shield ends in" hideLabel className="text-sm text-foreground" />}
    </section>
  );
}

/**
 * The defence log (#647): the attacks on the player's village, newest first, each with its stars, its score against the
 * village's, the crowns it cost, and its replay; the shield's timer on top.
 */
export function PvpDefenceScene({ attacks, shieldEndsAt, now, error, errorDetail, onBack, onNavigate, onReplay, onRetry, shieldUnknown }: PvpDefenceSceneProps) {
  return (
    <TabFrame tab="league" onNavigate={onNavigate}>
      <TopBar title="Defence log" onBack={onBack} />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <ShieldCard endsAt={shieldEndsAt} now={now} unknown={shieldUnknown} />
        <InlineError
          title="Defence log"
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
        {attacks === null && !error && (
          <div aria-busy className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        )}
        {attacks?.length === 0 && (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">No attack on your village yet.</p>
        )}
        {attacks && attacks.length > 0 && (
          <ul aria-label="Attacks" className="flex flex-col gap-2">
            {attacks.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <PlayerName name={a.attacker.name} address={a.attacker.address} className="font-semibold" />
                    <StarRow stars={a.stars} size="xs" className="shrink-0" />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    <span className="numeric">{formatInteger(a.score)}</span> (
                    <span className="numeric">{formatPercent(shareOf(a.score, a.target), { maxFractionDigits: 0 })}</span>) · {formatRelative(a.at - now)}
                  </span>
                </div>
                <Crowns value={a.crowns} signed />
                <Button variant="secondary" size="icon" aria-label={`Replay the attack of ${a.attacker.name ?? "this player"}`} disabled={!a.replay} onClick={() => onReplay?.(a.id)}>
                  <Icon name="play" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </TabFrame>
  );
}
