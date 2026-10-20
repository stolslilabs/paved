import type { TaskProgress as Task } from "@paved/chain";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { formatDay, DAY_S } from "../elements/day-picker";
import { Cobbles } from "../elements/cobbles";
import { TaskProgress } from "../elements/task-progress";
import { Countdown } from "../elements/countdown";
import { taskUnit } from "./quest-text";

/**
 * Where a quest or an achievement stands, from the indexer's counts: `complete` (every task at its total), `progress`
 * (something counted), `none` (nothing yet: a quest to do, an achievement locked). Event mode: nothing is claimed on
 * chain and v1 has no reward (quests.md), so complete is the last state. With Cobbles (P-61, gems-v1.md 3.3), a complete
 * entry's Cobbles are then claimed by the player: `ProgressCardProps.reward`.
 */
export type ProgressState = "complete" | "progress" | "none";

export function progressState(entry: { completed: boolean; tasks: Task[] }): ProgressState {
  if (entry.completed) return "complete";
  return entry.tasks.some((t) => t.count > 0) ? "progress" : "none";
}

export interface ProgressCardProps {
  kind: "quest" | "achievement";
  title: string;
  description?: string;
  icon: string;
  tasks: Task[];
  completed: boolean;
  completedAt: number | null;
  /** An achievement's points, display only. */
  points?: number;
  retired?: boolean;
  /** Its Cobbles (gems-v1.md 3.1) and whether they were claimed; omitted: no Cobbles (before Cobbles, or On the Podium in v1). */
  reward?: ProgressReward;
  /** A limited mission's countdown: when its window closes and the clock to count from; omitted on a closed day or a lifetime mission. */
  ends?: { at: number; now: number; label: string };
  onClaim?: () => void;
  className?: string;
}

export interface ProgressReward {
  cobbles: number;
  claimed: boolean;
  /** The claim is on its way. */
  claiming?: boolean;
  /** Another claim is on its way: this one waits. */
  disabled?: boolean;
}

const LABEL = {
  quest: { complete: "Complete", progress: "In progress", none: "To do" },
  achievement: { complete: "Earned", progress: "In progress", none: "Locked" },
} as const;

/** A quest of the day or an achievement: its icon, title and rule, its tasks' bars, and its state. */
export function ProgressCard(props: ProgressCardProps) {
  const { kind, title, description, icon, tasks, completedAt, points, retired, reward, ends, onClaim, className } = props;
  const state = progressState(props);
  const locked = kind === "achievement" && state === "none";
  return (
    <article
      data-slot="card"
      data-state={state}
      aria-label={title}
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4",
        state === "complete" ? "border-primary/40 bg-card" : "border-border bg-card",
        locked && "opacity-75",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-lg",
            state === "complete" ? "bg-secondary text-primary" : "bg-secondary text-muted-foreground",
          )}
        >
          <Icon name={locked ? "lock" : icon} size="md" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 wrap-anywhere">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-display text-sm font-semibold">{title}</h3>
            {points != null && (
              <span className="numeric text-xs whitespace-nowrap text-muted-foreground">
                {points} pts
              </span>
            )}
            {reward && <Cobbles value={reward.cobbles} sign="+" size="sm" tone="muted" />}
          </div>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
          {ends && <Countdown expiresAt={ends.at} now={ends.now} label={ends.label} className="mt-1" />}
        </div>
        <Badge variant={state === "complete" ? "default" : state === "progress" ? "secondary" : "outline"} className="shrink-0">
          {state === "complete" && <Icon name="check" size="xs" />}
          {LABEL[kind][state]}
        </Badge>
      </div>
      {tasks.map((t) => (
        <TaskProgress key={t.taskId} unit={taskUnit(t.taskId)} count={t.count} total={t.total} />
      ))}
      {(state === "complete" && completedAt != null) || retired ? (
        <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {state === "complete" && completedAt != null && (
            <span>
              {kind === "quest" ? "Completed" : "Earned"} {formatDay(Math.floor(completedAt / DAY_S))}
            </span>
          )}
          {retired && <span>Retired: nothing counts any more</span>}
        </p>
      ) : null}
      {reward && state === "complete" && (
        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          {reward.claimed ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon name="check" size="xs" />
              Cobbles claimed
            </span>
          ) : (
            <Button size="sm" onClick={onClaim} loading={reward.claiming} disabled={reward.disabled} aria-label={`Claim ${reward.cobbles} Cobbles: ${title}`}>
              {reward.claiming ? "Claiming…" : (
                <>
                  Claim <Cobbles value={reward.cobbles} size="sm" className="text-primary-foreground" />
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
