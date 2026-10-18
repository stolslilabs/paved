import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";

/** One period's free game (gems-v1.md 3.4): every quest of the kind live in that period done, then claimed once. */
export interface FreeGameClaim {
  /** The quests of the kind live in the period, and how many are done. */
  done: number;
  total: number;
  /** `credit` of the period's slot. */
  claimed: boolean;
  claiming?: boolean;
}

export interface FreeGamesProps {
  /** `AccountView.credits`: free Challenge games left. */
  credits: number;
  /** The day shown; null when no daily is live. */
  daily: FreeGameClaim | null;
  /** The week of the day shown; null when no weekly is live. */
  weekly: FreeGameClaim | null;
  /** Another claim is on its way. */
  busy?: boolean;
  onClaim?: (kind: "daily" | "weekly") => void;
  /** Shown with a credit: spends one (`Challenge.spawn_free`). */
  onPlayFree?: () => void;
  className?: string;
}

const KIND = { daily: { name: "Daily", quests: "daily missions", period: "day" }, weekly: { name: "Weekly", quests: "weekly missions", period: "week" } } as const;

function ClaimRow({ kind, claim, busy, onClaim }: { kind: "daily" | "weekly"; claim: FreeGameClaim; busy?: boolean; onClaim?: (kind: "daily" | "weekly") => void }) {
  const k = KIND[kind];
  const ready = claim.done >= claim.total;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
      <span className="flex min-w-0 flex-1 flex-col wrap-anywhere">
        <span className="text-sm font-semibold">{k.name} free game</span>
        <span className="text-xs text-muted-foreground">
          {claim.claimed ? `Claimed for this ${k.period}` : ready ? `Every ${k.name.toLowerCase()} mission done` : (
            <>
              <span className="numeric">{claim.done}</span> of <span className="numeric">{claim.total}</span> {k.quests} done
            </>
          )}
        </span>
      </span>
      {claim.claimed ? (
        <Icon name="circle-check" size="md" className="text-success" label="Claimed" />
      ) : (
        <Button size="sm" disabled={!ready || busy} loading={claim.claiming} onClick={() => onClaim?.(kind)} aria-label={`Claim the ${k.name.toLowerCase()} free game`}>
          {claim.claiming ? "Claiming…" : "Claim"}
        </Button>
      )}
    </li>
  );
}

/**
 * The free games (B4, gems-v1.md 3.4): all the dailies of a day, or all the weeklies of a week, done in paid games earn
 * one free Challenge game each, claimed here; then the credits left, and Play free that spends one.
 */
export function FreeGames({ credits, daily, weekly, busy, onClaim, onPlayFree, className }: FreeGamesProps) {
  return (
    <section aria-label="Free games" data-slot="card" className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
            <Icon name="ticket" size="md" />
          </span>
          <span className="flex flex-col">
            <span className="text-xs text-muted-foreground">Free games</span>
            <span className="numeric text-lg font-semibold" aria-label={`${credits} free ${credits === 1 ? "game" : "games"} left`}>
              {credits}
            </span>
          </span>
        </span>
        {onPlayFree && credits > 0 && (
          <Button size="sm" variant="outline" onClick={onPlayFree}>
            Play free
          </Button>
        )}
      </div>
      {(daily || weekly) && (
        <ul className="flex flex-col gap-3">
          {daily && <ClaimRow kind="daily" claim={daily} busy={busy} onClaim={onClaim} />}
          {weekly && <ClaimRow kind="weekly" claim={weekly} busy={busy} onClaim={onClaim} />}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Only paid games count towards a free game. A free game ranks like any other and pays no PAVED.</p>
    </section>
  );
}
