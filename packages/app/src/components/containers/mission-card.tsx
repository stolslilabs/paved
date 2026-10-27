import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { formatDay, DAY_S } from "../elements/day-picker";
import { Cobbles } from "../elements/cobbles";
import { TaskProgress } from "../elements/task-progress";
import { MISSION_STATE_LABEL, type MissionTileState } from "./mission-tile";

/** A mission's Cobbles (gems-v1.md 3.1) and whether they were claimed. */
export interface ProgressReward {
  cobbles: number;
  claimed: boolean;
  /** The claim is on its way. */
  claiming?: boolean;
  /** Another claim is on its way: this one waits. */
  disabled?: boolean;
}

/** Which list a mission is of (#832): the day's, the week's, or the lifetime ones. */
export type MissionKind = "daily" | "weekly" | "lifetime";

/** A mission as the Missions page shows it, a quest, an achievement or a period's bonus, from the scene's reads. */
export interface Mission {
  key: string;
  kind: MissionKind;
  /** The period's bonus (every mission of the period done): Cobbles, no free game since #738. */
  bonus?: boolean;
  title: string;
  description: string;
  icon: string;
  state: MissionTileState;
  /** Each task's count against its total, as the bars show it. */
  progress: readonly { unit: string; count: number; total: number }[];
  completedAt: number | null;
  retired?: boolean;
  reward?: ProgressReward;
}

const KIND = {
  daily: { label: "Daily", icon: "sun" },
  weekly: { label: "Weekly", icon: "crown" },
  lifetime: { label: "Lifetime", icon: "medal" },
} as const;

/** The short line of a mission not done yet, where its Claim will be. */
const TO_DO: Record<MissionKind, string> = {
  daily: "Play today to finish it: it resets at 00:00 UTC.",
  weekly: "Play this week to finish it: it resets on Monday at 00:00 UTC.",
  lifetime: "Every game counts toward it, for good.",
};

export interface MissionCardProps {
  mission: Mission;
  /** False: the player cannot sign yet (P6): a done mission's Claim says "Connect to claim". */
  canClaim?: boolean;
  onClaim?: () => void;
  className?: string;
}

/**
 * The selected mission, at the top of the Missions page (#832): its icon, title and description, Daily, Weekly or Lifetime, its
 * progress (a bar and "3 / 5" per task), its Cobbles, and its action: Claim when done, a short line when not.
 */
export function MissionCard({ mission, canClaim = true, onClaim, className }: MissionCardProps) {
  const { kind, title, description, icon, state, progress, completedAt, retired, reward } = mission;
  const done = state === "claimable" || state === "done";
  return (
    <article
      data-slot="card"
      data-state={state}
      aria-label={title}
      className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4", done ? "border-primary/40" : "border-border", className)}
    >
      <div className="flex items-start gap-3">
        <span className={cn("grid size-12 shrink-0 place-items-center rounded-lg bg-secondary", done ? "text-primary" : "text-muted-foreground")}>
          <Icon name={state === "locked" ? "lock" : icon} size="lg" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1 wrap-anywhere">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge variant="outline">
              <Icon name={mission.bonus ? "gift" : KIND[kind].icon} size="xs" />
              {mission.bonus ? `${KIND[kind].label} bonus` : KIND[kind].label}
            </Badge>
            <span className={cn("text-xs", done ? "text-success" : "text-muted-foreground")}>{MISSION_STATE_LABEL[state]}</span>
          </div>
          <h2 className="font-display text-base font-semibold">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {reward && <Cobbles value={reward.cobbles} sign="+" size="md" className="shrink-0" />}
      </div>
      {progress.map((p) => (
        <TaskProgress key={p.unit} unit={p.unit} count={p.count} total={p.total} />
      ))}
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        {retired ? (
          <span>Retired: nothing counts any more</span>
        ) : done ? (
          <span>{completedAt != null ? `Done ${formatDay(Math.floor(completedAt / DAY_S))}` : "Done"}</span>
        ) : (
          <span>{TO_DO[kind]}</span>
        )}
        {reward && done && (reward.claimed ? (
          <span className="flex items-center gap-1.5">
            <Icon name="check" size="xs" />
            Cobbles claimed
          </span>
        ) : canClaim ? (
          <Button size="sm" onClick={onClaim} loading={reward.claiming} disabled={reward.disabled} aria-label={`Claim ${reward.cobbles} Cobbles: ${title}`}>
            {reward.claiming ? "Claiming…" : (
              <>
                Claim <Cobbles value={reward.cobbles} size="sm" className="text-primary-foreground" />
              </>
            )}
          </Button>
        ) : (
          <span>Connect to claim</span>
        ))}
      </div>
    </article>
  );
}
