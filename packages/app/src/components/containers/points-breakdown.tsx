import type { Ref } from "react";
import { CategoryType, formatInteger, type LayoutBreakdown } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { formatPoints } from "../elements/score";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";
import { ClosingLine } from "./closing-feed";

// The village's points by structure (#758): the lines of a game's score screen (`ClosingLine`), each a toggle that lights its
// structure on the scene. In view, a panel from the score chip under the profile; in edit mode, a fold in the editor's panel.

const CATEGORIES = Object.values(CategoryType);

export interface PointsListProps {
  breakdown: LayoutBreakdown;
  /** The line lit (its structure's `key`), or none. */
  selected: string | null;
  /** A line tapped: its key to light it, null to turn the light off (the lit line tapped again). */
  onSelect: (key: string | null) => void;
  className?: string;
}

/**
 * The lines, the most points first: a tap lights the line's structure (`aria-pressed`), a tap on the lit line turns it off, a
 * tap on another moves the light. Points no structure holds take a line of their own, not a toggle. No entry animation.
 */
export function PointsList({ breakdown, selected, onSelect, className }: PointsListProps) {
  const { lines, other } = breakdown;
  if (lines.length === 0 && other === 0) return <p className={cn("px-1 py-2 text-xs text-muted-foreground", className)}>No structure closed yet: close a road, a city or a forest to score.</p>;
  return (
    <ul aria-label="Points by structure" className={cn("flex flex-col gap-1", className)}>
      {lines.map((line) => {
        const on = line.key === selected;
        return (
          <li key={line.key}>
            <button
              type="button"
              aria-pressed={on}
              data-line={line.key}
              onClick={() => onSelect(on ? null : line.key)}
              className={cn(
                "state-layer flex min-h-11 w-full items-center rounded-lg border px-3 py-1.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-primary bg-primary/15" : "border-transparent",
              )}
            >
              <ClosingLine closing={{ category: CATEGORIES.indexOf(line.category), size: line.size, points: line.points }} tiles={line.tiles} className="w-full" />
            </button>
          </li>
        );
      })}
      {other !== 0 && (
        <li className="flex min-h-11 items-center justify-between px-3 text-sm">
          <span className="text-muted-foreground">Other</span>
          <span className="numeric font-semibold">
            {other > 0 ? "+" : "−"}
            {formatPoints(Math.abs(other))}
          </span>
        </li>
      )}
    </ul>
  );
}

/** The heading's total: the village's score, the lines' sum. */
function Total({ score }: { score: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <Icon name="house-chimney" size="xs" className="text-primary" />
      <span className="numeric font-semibold">{formatInteger(score)}</span>
    </span>
  );
}

export interface PointsPanelProps extends PointsListProps {
  onClose: () => void;
  ref?: Ref<HTMLElement>;
}

/**
 * The view's panel (#758), opened by the score chip under the profile: not modal, so the scene stays in sight (and in hand: pan,
 * zoom) while a line lights its structure. A bottom panel on a phone, a card under the chip from `tablet`. Close (or Escape, or
 * a tap outside, #792: the caller's) turns the light off.
 */
export function PointsPanel({ onClose, className, ref, ...list }: PointsPanelProps) {
  return (
    <section
      ref={ref}
      id="village-points"
      aria-label="Village points"
      className={cn("pointer-events-auto flex max-h-[min(24rem,45dvh)] flex-col gap-2 rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur", className)}
    >
      <header className="flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold">Village points</h2>
        <Total score={list.breakdown.score} />
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close the points" className="-my-1">
          <Icon name="xmark" size="sm" />
        </Button>
      </header>
      <ScrollRegion className="-mx-1 min-h-0 px-1">
        <PointsList {...list} />
      </ScrollRegion>
    </section>
  );
}

export interface PointsFoldProps extends PointsListProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Edit mode's fold (#758), above the inventory: the total, a tap unfolds the lines (folded on a phone, open from `desktop`). */
export function PointsFold({ open, onOpenChange, className, ...list }: PointsFoldProps) {
  return (
    <section aria-label="Village points" className={cn("flex min-h-0 flex-col gap-1", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="editor-points"
        onClick={() => onOpenChange(!open)}
        className="state-layer flex min-h-11 items-center gap-2 rounded-lg px-1 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon name="chevron-right" size="xs" fixedWidth className={cn("text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className="flex-1 font-semibold">Points</span>
        <Total score={list.breakdown.score} />
      </button>
      {open && (
        <ScrollRegion id="editor-points" className="max-h-[30dvh] min-h-0 desktop:max-h-[40dvh]">
          <PointsList {...list} />
        </ScrollRegion>
      )}
    </section>
  );
}
