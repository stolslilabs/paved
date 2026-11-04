import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/utils";
import { CheckBadge } from "../elements/check-badge";
import { medallionSources, type MedallionName, type RingName } from "../elements/medallion-art";
import { UiIcon } from "../elements/ui-icon";

/**
 * Where a mission stands, as its tile shows it (#832): `claimable` (done, its Cobbles waiting), `done` (done, claimed or with no
 * Cobbles), `progress` (something counted), `none` (nothing yet: a mission to do), `locked` (a Tutorial step the one before has not
 * opened yet; an achievement is never locked, the owner's ask of 2026-11-04).
 */
export type MissionTileState = "claimable" | "done" | "progress" | "none" | "locked";

export const MISSION_STATE_LABEL: Record<MissionTileState, string> = {
  claimable: "Cobbles to claim",
  done: "Done",
  progress: "In progress",
  none: "To do",
  locked: "Locked",
};

/**
 * Each mission's painting on the Missions page (MISSIONS-PAGE, the owner's ask of 2026-11-04: the book's images, `medallion-art.ts`),
 * by the icon its text names (`quest-text.ts`, a Font Awesome name the toasts and the game's end still draw), or by its task for the
 * two the book paints otherwise (`points`: its coins, `league`: its banner; the scene names them). The book's: the hammer for the roads
 * and cities, the boot for a finished game, the forest, the house for the Settlers, the castle for the large structures, the crown;
 * a painting of their rendering for the rest. An icon the map does not know shows the scroll. Its opening line names no icon: the
 * Font Awesome subset's guard reads the words of a line that does (and the block it opens), and these are images, never the subset's.
 */
const MISSION_ART = {
  "flag-checkered": "boot",
  castle: "hammer",
  hammer: "hammer",
  tree: "forest",
  star: "star",
  "arrow-trend-up": "level",
  trophy: "trophy",
  medal: "trophy",
  swords: "swords",
  "graduation-cap": "book",
  "house-chimney": "house",
  "chess-rook": "castle",
  "landmark-dome": "wonder",
  dice: "dice",
  crown: "crown",
  "treasure-chest": "chest",
  store: "shop",
  gift: "gift",
  scroll: "scroll",
  points: "coins",
  league: "banner",
} as const satisfies Record<string, MedallionName>;

/** A mission's painting, from the icon its text names (or its task's, `points` and `league`). */
export const missionArt = (icon: string): MedallionName => (MISSION_ART as Record<string, MedallionName>)[icon] ?? "scroll";

/**
 * The ring by state, the book's painted ones (`medallion-art.ts`): green once done, gold and full while its Cobbles wait, silver
 * before (under way, the gold one over it, cut to the progress' arc).
 */
const RING: Record<MissionTileState, RingName> = {
  claimable: "ring-gold",
  done: "ring-green",
  progress: "ring-silver",
  none: "ring-silver",
  locked: "ring-silver",
};
/** A ring over the medallion's box, a little past it (its outer edge over the box's outline). */
const RING_BOX: CSSProperties = { inset: "-2%", width: "104%", height: "104%" };

/**
 * The medallion's parts' boxes, inline in the page's chunk (the one stylesheet has no room to spare): a badge at its foot (the book's
 * painted check, the lock), the gift's a step larger, and the selected one's gold point.
 */
const BADGE: CSSProperties = { right: "-4%", bottom: "-4%", width: "36%", height: "36%" };
const GIFT_BADGE: CSSProperties = { right: "-6%", bottom: "-6%", width: "40%", height: "40%" };
const POINT: CSSProperties = { borderLeft: "7px solid transparent", borderRight: "7px solid transparent", borderTop: "8px solid var(--primary)" };

/** The painting inside the ring, a dark line round it. Locked: greyed and dimmed, as the book's locked medallions. */
const PAINTING: CSSProperties = { inset: "11%", width: "78%", height: "78%", boxShadow: "0 0 0 1.5px var(--hud-outline)" };
const LOCKED_PAINTING: CSSProperties = { ...PAINTING, filter: "grayscale(1) brightness(0.75)" };

export interface MissionMedallionProps {
  art: MedallionName;
  state: MissionTileState;
  /** Counted so far, 0 to 1: the gold arc of the ring while in progress. */
  progress?: number;
  /** The selected mission's (the card shows it): a gold halo. */
  selected?: boolean;
  /**
   * Its badge at its foot (the list's): the check once done, the book's gift while its Cobbles wait, the lock while locked. Off, none:
   * the Missions card draws its own, the claim's (`children`).
   */
  badges?: boolean;
  /** Its width in CSS px, for the painting's copy (the box sizes it: `className`). */
  px: number;
  className?: string;
  children?: ReactNode;
}

/**
 * A mission's medallion (MISSIONS-PAGE, the Paved UX Book's Missions): the mission's painting (`medallion-art.ts`, the book's), in
 * the book's painted ring that says where it stands: silver before anything counts, the gold over it to the arc of its progress,
 * gold and full with a glow while its Cobbles wait (the book's gift at its foot), green once done (a green check at its foot);
 * locked, its painting greyed and a lock at its foot. Its pictures are decorative: its button or its card names it; the card puts its
 * claim's badge in it (`children`).
 */
export function MissionMedallion({ art, state, progress = 0, selected = false, badges = true, px, className, children }: MissionMedallionProps) {
  const done = state === "claimable" || state === "done";
  const arc = done ? 1 : state === "progress" ? Math.min(1, Math.max(0.06, progress)) : 0;
  // The shadows, the first on top: the ring's outline, the selection's gold circle round it, then the medallion's lip (its drop
  // shadow) under both, peeking below the gold circle when selected, never over it; the glow last. The ring itself is painted.
  const box: CSSProperties = {
    boxShadow: [
      "0 0 0 1.5px var(--hud-outline)",
      selected ? "0 0 0 3.5px var(--primary)" : null,
      selected ? "0 2px 0 3.5px var(--hud-outline)" : "0 2px 0 1.5px var(--hud-outline)",
      selected || state === "claimable" ? "0 0 14px 2px color-mix(in oklab, var(--primary) 55%, transparent)" : null,
    ]
      .filter(Boolean)
      .join(", "),
  };
  return (
    <span data-slot="mission-medallion" data-state={state} className={cn("relative grid aspect-square place-items-center rounded-full", className)} style={box}>
      <img {...medallionSources(RING[state], px * 1.04)} alt="" decoding="async" draggable={false} data-slot="mission-ring" data-ring={RING[state]} className="absolute" style={RING_BOX} />
      {state === "progress" && (
        // Under way: the gold ring over the silver, cut to the arc of what is counted.
        <img
          {...medallionSources("ring-gold", px * 1.04)}
          alt=""
          decoding="async"
          draggable={false}
          data-slot="mission-arc"
          className="absolute"
          style={{ ...RING_BOX, maskImage: `conic-gradient(var(--hud-outline) ${arc}turn, transparent 0)`, WebkitMaskImage: `conic-gradient(var(--hud-outline) ${arc}turn, transparent 0)` }}
        />
      )}
      <img
        {...medallionSources(art, px * 0.78)}
        alt=""
        decoding="async"
        draggable={false}
        data-slot="mission-painting"
        data-medallion={art}
        className="absolute rounded-full"
        style={state === "locked" ? LOCKED_PAINTING : PAINTING}
      />
      {badges && state === "done" && (
        <CheckBadge px={px * 0.36} className="absolute" style={BADGE} />
      )}
      {badges && state === "claimable" && (
        <span className="absolute" style={GIFT_BADGE}>
          <UiIcon name="invite" px={px * 0.4} className="drawer-icon block size-full" />
        </span>
      )}
      {badges && state === "locked" && (
        <span className="absolute" style={BADGE}>
          <UiIcon name="lock" px={px * 0.36} className="drawer-icon block size-full" />
        </span>
      )}
      {children}
    </span>
  );
}

export interface MissionTileProps {
  title: string;
  icon: string;
  state: MissionTileState;
  /** Counted so far, 0 to 1: the gold arc of the ring while in progress. */
  progress?: number;
  /** The tile the card at the top shows: haloed in gold, a gold point under it. */
  selected?: boolean;
  /** A Tutorial step's number (#977): said with its name ("Step 2, Challenger"); the steps read in order on the grid. */
  step?: number;
  onSelect?: () => void;
  className?: string;
}

/**
 * A mission of the Missions page (#832) as its medallion (MISSIONS-PAGE, the Paved UX Book's Missions): five a row, the ring saying
 * where it stands (`MissionMedallion`). No Cobbles under it (#988): the card at the top is the one place that shows a mission's
 * Cobbles. A tap selects it: the card at the top shows it, and the medallion takes a gold halo and a gold point under it, as the
 * book's (`aria-pressed`). No animation: the glow is still, so reduced motion has nothing to stop.
 */
export function MissionTile({ title, icon, state, progress, selected = false, step, onSelect, className }: MissionTileProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${step !== undefined ? `Step ${step}, ` : ""}${title}: ${MISSION_STATE_LABEL[state]}`}
      data-state={state}
      onClick={onSelect}
      className={cn("relative flex w-full min-w-0 cursor-pointer flex-col items-center rounded-full pb-2.5 outline-none", className)}
    >
      <MissionMedallion art={missionArt(icon)} state={state} progress={progress} selected={selected} px={64} className="w-full max-w-16" />
      {selected && (
        <span aria-hidden data-slot="mission-pointer" className="absolute bottom-0 left-1/2 size-0 -translate-x-1/2" style={POINT} />
      )}
    </button>
  );
}
