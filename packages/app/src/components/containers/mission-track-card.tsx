import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { formatDay, DAY_S } from "../elements/day-picker";
import { Cobbles } from "../elements/cobbles";
import { Countdown } from "../elements/countdown";
import { MilestoneBar, type Milestone, type MilestoneState } from "../elements/milestone-bar";
import type { ProgressReward, ProgressState } from "./progress-card";
import { taskLeft, taskUnit } from "./quest-text";

/** One step of a track: a mission (a tier) of the task, its target and its Cobbles. */
export interface TrackStep {
  /** The mission's id: what its Claim sends. */
  id: number;
  title: string;
  target: number;
  reached: boolean;
  completedAt: number | null;
  /** Its Cobbles; omitted: none (before Cobbles, or a definition without). */
  reward?: ProgressReward;
}

export interface MissionTrackCardProps {
  /** The track's name: its mission's title for one step, the task's name for several ("Builder"). */
  title: string;
  /** One step: the mission's rule. */
  description?: string;
  icon: string;
  taskId: number;
  /** The task's count. */
  count: number;
  /** Lowest target first. */
  steps: TrackStep[];
  retired?: boolean;
  /** The window's countdown when it differs from the section's; omitted on a closed day. */
  ends?: { at: number; now: number; label: string };
  /** A reached step's Claim: the mission's id. */
  onClaim?: (id: number) => void;
  className?: string;
}

/** The step's state on the bar: reached and claimable, claimed or without reward; the first not reached is next. */
export function stepState(step: TrackStep, next: boolean): MilestoneState {
  if (step.reached) return !step.reward ? "done" : step.reward.claimed ? "claimed" : "claimable";
  return next ? "next" : "locked";
}

/**
 * A mission track (#595): the icon, the name, the milestone bar of its steps with their Cobbles, what the next step still
 * needs ("3 more forests") and each reached step's Claim. A mission with one target is a track of one step; the tiers of
 * one task (Small, Public, Great Works) are one track. `data-state` is the track's: complete when every step is reached.
 */
export function MissionTrackCard(props: MissionTrackCardProps) {
  const { title, description, icon, taskId, count, steps, retired, ends, onClaim, className } = props;
  const reached = steps.filter((s) => s.reached).length;
  const complete = reached === steps.length;
  const state: ProgressState = complete ? "complete" : count > 0 ? "progress" : "none";
  const next = steps.find((s) => !s.reached);
  const milestones: Milestone[] = steps.map((s) => ({ key: s.id, label: s.title, target: s.target, state: stepState(s, s === next), cobbles: s.reward?.cobbles }));
  const claimable = steps.filter((s) => s.reached && s.reward && !s.reward.claimed);
  const claimedAll = complete && steps.some((s) => s.reward) && steps.every((s) => !s.reward || s.reward.claimed);
  const last = complete ? steps[steps.length - 1] : undefined;
  return (
    <article
      data-slot="card"
      data-state={state}
      aria-label={title}
      className={cn(
        "relative flex flex-col gap-3 overflow-hidden rounded-xl border bg-card p-4",
        claimable.length > 0 ? "border-primary/60 shadow-[0_0_0_1px_var(--glow)]" : complete ? "border-success/40" : "border-border",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-xl border",
            complete ? "border-success/40 bg-success/10 text-success" : state === "progress" ? "border-primary/40 bg-[radial-gradient(circle_at_50%_30%,var(--glow),var(--secondary))] text-primary" : "border-border bg-secondary text-muted-foreground",
          )}
        >
          <Icon name={icon} size="lg" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 wrap-anywhere">
          <h3 className="font-display text-base leading-tight font-semibold">{title}</h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
          {ends && <Countdown expiresAt={ends.at} now={ends.now} label={ends.label} className="mt-1" />}
        </div>
        <Badge variant={complete ? "default" : state === "progress" ? "secondary" : "outline"} className="shrink-0">
          {complete && <Icon name="check" size="xs" />}
          {steps.length > 1 ? (
            <span className="numeric">
              {reached}/{steps.length}
            </span>
          ) : complete ? (
            "Complete"
          ) : state === "progress" ? (
            "In progress"
          ) : (
            "To do"
          )}
        </Badge>
      </div>

      <MilestoneBar count={count} unit={taskUnit(taskId)} milestones={milestones} />

      <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
        {next ? (
          <>
            <Icon name="flag" size="xs" className="text-primary" />
            {steps.length > 1 && <span className="font-semibold text-foreground">{next.title}:</span>}
            <span>{taskLeft(taskId, next.target - Math.min(count, next.target))}</span>
            {next.reward && (
              <>
                <span>for</span>
                <Cobbles value={next.reward.cobbles} sign="+" size="sm" tone="muted" />
              </>
            )}
          </>
        ) : (
          <>
            <Icon name="circle-check" size="xs" className="text-success" />
            <span>{steps.length > 1 ? "Every step reached" : "Reached"}</span>
            {last?.completedAt != null && <span>· {formatDay(Math.floor(last.completedAt / DAY_S))}</span>}
          </>
        )}
        {retired && <span>· Retired: nothing counts any more</span>}
      </p>

      {(claimable.length > 0 || claimedAll) && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          {claimedAll ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon name="check" size="xs" />
              Cobbles claimed
            </span>
          ) : (
            claimable.map((s) => (
              <Button
                key={s.id}
                size="sm"
                onClick={() => onClaim?.(s.id)}
                loading={s.reward!.claiming}
                disabled={s.reward!.disabled}
                aria-label={`Claim ${s.reward!.cobbles} Cobbles: ${s.title}`}
              >
                {s.reward!.claiming ? "Claiming…" : (
                  <>
                    Claim <Cobbles value={s.reward!.cobbles} size="sm" className="text-primary-foreground" iconClassName="text-primary-foreground" />
                  </>
                )}
              </Button>
            ))
          )}
        </div>
      )}
    </article>
  );
}
