import type { TaskProgress as Task } from "@paved/chain";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Icon } from "../ui/icon";
import { formatDay, DAY_S } from "../elements/day-picker";
import { TaskProgress } from "../elements/task-progress";
import { taskUnit } from "./quest-text";

/**
 * Where a quest or an achievement stands, from the indexer's counts: `complete` (every task at its total), `progress`
 * (something counted), `none` (nothing yet: a quest to do, an achievement locked). Event mode: nothing is claimed on
 * chain and v1 has no reward (quests.md), so complete is the last state.
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
  className?: string;
}

const LABEL = {
  quest: { complete: "Complete", progress: "In progress", none: "To do" },
  achievement: { complete: "Earned", progress: "In progress", none: "Locked" },
} as const;

/** A quest of the day or an achievement: its icon, title and rule, its tasks' bars, and its state. */
export function ProgressCard(props: ProgressCardProps) {
  const { kind, title, description, icon, tasks, completedAt, points, retired, className } = props;
  const state = progressState(props);
  const locked = kind === "achievement" && state === "none";
  return (
    <article
      data-slot="card"
      data-state={state}
      aria-label={title}
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4",
        state === "complete" ? "border-gold-800 bg-gold-950/40" : "border-border bg-card",
        locked && "opacity-75",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-lg",
            state === "complete" ? "bg-gold-900 text-gold-200" : "bg-secondary text-muted-foreground",
          )}
        >
          <Icon name={locked ? "lock" : icon} size="md" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-display text-sm font-semibold">{title}</h3>
            {points != null && (
              <span className="numeric text-xs text-muted-foreground">
                {points} pts
              </span>
            )}
          </div>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
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
        <p className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
          {state === "complete" && completedAt != null && (
            <span>
              {kind === "quest" ? "Completed" : "Earned"} {formatDay(Math.floor(completedAt / DAY_S))}
            </span>
          )}
          {retired && <span>Retired: nothing counts any more</span>}
        </p>
      ) : null}
    </article>
  );
}
