import { Category, CategoryType } from "@paved/game-core";

/** One `Scored` event of a move: a structure that closed (D-18). */
export interface Closure {
  category: number;
  size: number;
  points: number;
}

/** "Road closed: size 3, +6 points"; a closure for 0 points still says it closed. */
export function closureLine({ category, size, points }: Closure): string {
  const name = Category.from(category)?.value;
  const label = name && name !== CategoryType.None ? name : "Structure";
  return `${label} closed: size ${size}, ${points > 0 ? "+" : ""}${points} points`;
}

/**
 * What the last move closed, next to the score. The live region stays mounted and in the
 * accessibility tree, so that a screen reader hears each new line; when the move closed nothing it
 * is empty and collapsed (no padding, border or background).
 */
export function ClosedStructures({ closures }: { closures: readonly Closure[] | null }) {
  const lines = closures ?? [];
  const shown = lines.length > 0;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="closures"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        background: shown ? "rgba(0,0,0,0.75)" : "transparent",
        border: shown ? "1px solid rgba(245,158,11,0.6)" : "none",
        borderRadius: 8,
        padding: shown ? "6px 10px" : 0,
        color: "#fde68a",
        fontSize: 13,
      }}
    >
      {lines.map((c, i) => (
        <span key={i}>{closureLine(c)}</span>
      ))}
    </div>
  );
}
