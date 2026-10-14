import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Amount } from "../elements/amount";
import { Icon } from "../ui/icon";
import { formatPoints } from "../elements/score";

/**
 * A finished game's reward, from `Economy.terms(id)`: `rewarded` (settled, minted), `awaiting` (recorded, its day not
 * closed), `settle` (its day closed, not settled yet), `below` (under the threshold: the stake is lost), `expired` (not
 * recorded within 24 h), `free` (Training: no stake, no reward).
 */
export type RewardState = "rewarded" | "awaiting" | "settle" | "below" | "expired" | "free";

export interface RewardPanelProps {
  state: RewardState;
  /** PAVED base units minted (`TermsView.reward`). */
  reward?: bigint;
  stake?: number;
  score: number;
  /** Points to beat (`threshold / 1000`). */
  threshold?: number;
  settling?: boolean;
  onSettle?: () => void;
  className?: string;
}

const COPY: Record<RewardState, { title: string; tone: string; icon: string }> = {
  rewarded: { title: "Reward", tone: "border-gold-800 bg-gold-950/60", icon: "trophy" },
  awaiting: { title: "Reward after the day closes", tone: "border-border bg-secondary/40", icon: "clock" },
  settle: { title: "Ready to settle", tone: "border-gold-800 bg-gold-950/60", icon: "trophy" },
  below: { title: "No reward", tone: "border-ember-900 bg-ember-950/50", icon: "triangle-exclamation" },
  expired: { title: "Expired", tone: "border-ember-900 bg-ember-950/50", icon: "triangle-exclamation" },
  free: { title: "Training", tone: "border-border bg-secondary/40", icon: "circle-info" },
};

/** The reward or its absence, with the threshold the score was measured against. */
export function RewardPanel({ state, reward = 0n, stake, score, threshold, settling, onSettle, className }: RewardPanelProps) {
  const copy = COPY[state];
  const above = threshold != null && score >= threshold;
  return (
    <section aria-label="Reward" data-state={state} className={cn("flex flex-col gap-3 rounded-xl border p-4", copy.tone, className)}>
      <div className="flex items-center gap-2">
        <Icon name={copy.icon} className={state === "below" || state === "expired" ? "text-destructive-text" : "text-primary"} size="md" />
        <span className="font-semibold">{copy.title}</span>
        {stake ? <span className="ml-auto text-xs text-muted-foreground">Stake {stake}</span> : null}
      </div>
      {state === "rewarded" && <Amount value={reward} token="paved" className="text-3xl text-primary" />}
      {threshold != null && state !== "free" && (
        <p className="text-sm text-muted-foreground">
          Threshold <span className="font-mono text-foreground tabular-nums">{formatPoints(threshold)}</span>
          {" · "}
          {above ? (
            <span className="text-success">beaten by {formatPoints(score - threshold)}</span>
          ) : (
            <span className="text-destructive-text">missed by {formatPoints(threshold - score)}</span>
          )}
        </p>
      )}
      {state === "awaiting" && <p className="text-sm text-muted-foreground">The day's mean fixes the reward. Settle when it closes.</p>}
      {state === "below" && <p className="text-sm text-muted-foreground">Below the threshold the stake is lost.</p>}
      {state === "expired" && <p className="text-sm text-muted-foreground">The game was not finished within 24 h of its purchase: no reward.</p>}
      {state === "free" && <p className="text-sm text-muted-foreground">Training plays for practice: no stake, no reward.</p>}
      {state === "settle" && (
        <Button onClick={onSettle} loading={settling}>
          Settle and claim
        </Button>
      )}
    </section>
  );
}
