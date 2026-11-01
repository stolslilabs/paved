import { useId, useLayoutEffect, useRef, useState } from "react";
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

/** Which list a mission is of (#832): the Tutorial's steps (#977), the day's, the week's, or the lifetime ones. */
export type MissionKind = "tutorial" | "daily" | "weekly" | "lifetime";

/**
 * A Tutorial step's own parts (#977): its number, the step before it (while it is locked: "Unlocks after Raider"), its Go (the
 * open step's way to where its action is done; none for Rising), and the line where its Go would be when it has none.
 */
export interface TutorialPart {
  step: number;
  /** The title of the step before, said while this one is locked; null for the first. */
  after: string | null;
  /** Go, on the open step: it opens the place where its action is done. Omitted: no Go (Rising, or a step not open). */
  onGo?: () => void;
  /** The open step's line without a Go (Rising: how XP comes). */
  hint?: string;
}

/** A mission as the Missions page shows it, a quest or an achievement, from the scene's reads. */
export interface Mission {
  key: string;
  kind: MissionKind;
  title: string;
  description: string;
  icon: string;
  state: MissionTileState;
  /** Each task's count against its total, as the bars show it. */
  progress: readonly { unit: string; count: number; total: number }[];
  completedAt: number | null;
  retired?: boolean;
  reward?: ProgressReward;
  /** A Tutorial step's parts (`kind` "tutorial"). */
  tutorial?: TutorialPart;
}

const KIND = {
  tutorial: { label: "Tutorial", icon: "graduation-cap" },
  daily: { label: "Daily", icon: "sun" },
  weekly: { label: "Weekly", icon: "crown" },
  lifetime: { label: "Lifetime", icon: "medal" },
} as const;

/** The short line of a mission not done yet, where its Claim will be: one line at 320 px, so the card keeps its height (#975). */
const TO_DO: Record<MissionKind, string> = {
  tutorial: "Steps open in order: each one opens the next.",
  daily: "Play today: it resets at 00:00 UTC.",
  weekly: "Play this week: it resets Monday 00:00 UTC.",
  lifetime: "Every game counts toward it, for good.",
};

/** A weekly that pays nothing on its own (#976): the week pays at its milestones, the gifts of the bar above the Weekly row. */
const WEEK_PAYS = { toDo: "It counts toward the week's milestones.", done: "Paid at the week's milestones" } as const;

export interface MissionCardProps {
  mission: Mission;
  /** False: the player cannot sign yet (P6): a done mission's Claim says "Connect to claim". */
  canClaim?: boolean;
  onClaim?: () => void;
  className?: string;
}

/**
 * Whether the folded text overflows its two lines, on the rendered text (its scroll height against its box), checked again when
 * its width changes. While unfolded, the last folded answer holds, so "less" stays.
 */
function useClamped(text: string, open: boolean) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [value, setValue] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const check = () => setValue(el.scrollHeight > el.clientHeight + 1);
    check();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, open]);
  return { ref, value };
}

/**
 * The selected mission, at the top of the Missions page (#832): its icon, title and description, Daily, Weekly or Lifetime, its
 * progress (a bar and "3 / 5" per task), its Cobbles, and its action: Claim when done, a short line when not. Its height is the
 * same whatever the mission (#975): the title on one line, two lines of description (an ellipsis and "more" beyond), one task's
 * row and the footer. "More" unfolds the description, with no motion (so none to reduce); another mission folds it.
 */
export function MissionCard({ mission, canClaim = true, onClaim, className }: MissionCardProps) {
  const { kind, title, description, icon, state, progress, completedAt, retired, reward, tutorial } = mission;
  const done = state === "claimable" || state === "done";
  // A weekly with no Cobbles of its own (#976) says where the week pays instead.
  const weekPays = kind === "weekly" && !reward && !retired;
  // "More" unfolds the shown mission only (#975): selecting another folds it again, reset while rendering (no effect, no flash).
  const [open, setOpen] = useState(false);
  const [shownKey, setShownKey] = useState(mission.key);
  if (shownKey !== mission.key) {
    setShownKey(mission.key);
    setOpen(false);
  }
  const cut = useClamped(description, open);
  const textId = useId();
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
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* One line, so the card keeps its height (#975): the state gives way to an ellipsis on a narrow phone. */}
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant="outline" className="shrink-0">
              <Icon name={KIND[kind].icon} size="xs" />
              {KIND[kind].label}
            </Badge>
            <span title={MISSION_STATE_LABEL[state]} className={cn("min-w-0 truncate text-xs", done ? "text-success" : "text-muted-foreground")}>
              {MISSION_STATE_LABEL[state]}
            </span>
          </div>
          <h2 title={title} className="truncate font-display text-base font-semibold">{title}</h2>
        </div>
        {reward && <Cobbles value={reward.cobbles} sign="+" size="md" className="shrink-0" />}
      </div>
      {/* Two lines kept even when the description is shorter or empty, so the card keeps its height (#975). The clamp is
          visual only: the whole text stays in the DOM for assistive technology, and in `title`. The description takes the card's
          whole width, under the icon. */}
      <div className="flex items-end gap-1.5 wrap-anywhere">
        <p
          ref={cut.ref}
          id={textId}
          title={description || undefined}
          aria-hidden={description ? undefined : true}
          className={cn("min-h-[2lh] min-w-0 flex-1 text-xs text-muted-foreground", !open && "line-clamp-2")}
        >
          {description}
        </p>
        {(cut.value || open) && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={textId}
            onClick={() => setOpen(!open)}
            className="relative shrink-0 cursor-pointer rounded text-xs font-semibold text-primary outline-none after:absolute after:-inset-3 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {open ? "less" : "more"}
          </button>
        )}
      </div>
      {progress.map((p) => (
        <TaskProgress key={p.unit} unit={p.unit} count={p.count} total={p.total} />
      ))}
      {/* The room of a Claim (36 px), its padding and its border, whether the Claim shows or not (#975). A done weekly's two lines
          (its date, and where the week pays, #976) wrap within it on a phone: 16 px each and 2 between. */}
      <div className="flex min-h-[calc(--spacing(12)+1px)] flex-wrap items-center justify-between gap-x-2 gap-y-0.5 border-t border-border pt-3 text-xs text-muted-foreground">
        {retired ? (
          <span>Retired: nothing counts any more</span>
        ) : done ? (
          <span>{completedAt != null ? `Done ${formatDay(Math.floor(completedAt / DAY_S))}` : "Done"}</span>
        ) : tutorial ? (
          <span>{state === "locked" ? (tutorial.after ? `Unlocks after ${tutorial.after}` : "Locked") : (tutorial.hint ?? `Step ${tutorial.step} of the Tutorial`)}</span>
        ) : (
          <span>{weekPays ? WEEK_PAYS.toDo : TO_DO[kind]}</span>
        )}
        {tutorial?.onGo && !done && state !== "locked" && (
          <Button size="sm" onClick={tutorial.onGo} aria-label={`Go: ${title}`}>
            Go
            <Icon name="chevron-right" size="xs" />
          </Button>
        )}
        {weekPays && done && (
          <span className="flex items-center gap-1.5">
            <Icon name="gift" size="xs" />
            {WEEK_PAYS.done}
          </span>
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
