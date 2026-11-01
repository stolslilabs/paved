import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";

/**
 * Where a mission stands, as its tile shows it (#832): `claimable` (done, its Cobbles waiting), `done` (done, claimed or with no
 * Cobbles), `progress` (something counted), `none` (nothing yet: a limited mission to do), `locked` (a lifetime mission with
 * nothing counted).
 */
export type MissionTileState = "claimable" | "done" | "progress" | "none" | "locked";

export const MISSION_STATE_LABEL: Record<MissionTileState, string> = {
  claimable: "Cobbles to claim",
  done: "Done",
  progress: "In progress",
  none: "To do",
  locked: "Locked",
};

export interface MissionTileProps {
  title: string;
  icon: string;
  state: MissionTileState;
  /** Counted so far, 0 to 1: a thin bar under the icon while in progress. */
  progress?: number;
  /** The tile the card at the top shows: ringed. */
  selected?: boolean;
  onSelect?: () => void;
  className?: string;
}

/**
 * A mission of the Missions page as an icon (#832): a square tile with the mission's icon and its state (a check once done, a glow
 * while its Cobbles wait, a lock while a lifetime mission has nothing counted). No Cobbles under it (#988): the card at the top is
 * the one place that shows a mission's Cobbles; a tile is its square alone. A tap selects it: the
 * card at the top shows it, and the tile is ringed (`aria-pressed`). No animation: the glow (a lit fill) is still, so reduced motion has
 * nothing to stop.
 */
export function MissionTile({ title, icon, state, progress, selected = false, onSelect, className }: MissionTileProps) {
  const done = state === "claimable" || state === "done";
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${title}: ${MISSION_STATE_LABEL[state]}`}
      data-state={state}
      onClick={onSelect}
      className={cn("flex min-w-0 cursor-pointer flex-col items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      <span
        className={cn(
          "relative grid aspect-square w-full place-items-center rounded-xl border bg-card",
          state === "claimable" ? "border-primary bg-primary/15 shadow-lg" : done ? "border-primary/40" : "border-border",
          selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        )}
      >
        <Icon
          name={state === "locked" ? "lock" : icon}
          size="lg"
          className={cn(done ? "text-primary" : state === "progress" ? "text-foreground" : "text-muted-foreground")}
        />
        {done && (
          <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-success text-background">
            <Icon name="check" size="xs" />
          </span>
        )}
        {state === "progress" && progress !== undefined && (
          <span aria-hidden className="absolute inset-x-2 bottom-1 h-1 overflow-hidden rounded-full bg-input">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }} />
          </span>
        )}
      </span>
    </button>
  );
}
