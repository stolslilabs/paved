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
 * What the last move closed, next to the score. The live region is always there, so that a screen
 * reader hears each new line; it is empty when the move closed nothing.
 */
export function ClosedStructures({ closures }: { closures: readonly Closure[] | null }) {
  const lines = closures ?? [];
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="closures"
      style={{
        display: lines.length > 0 ? "flex" : "none",
        flexDirection: "column",
        gap: 2,
        background: "rgba(0,0,0,0.75)",
        border: "1px solid rgba(245,158,11,0.6)",
        borderRadius: 8,
        padding: "6px 10px",
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
