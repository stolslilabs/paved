import { PlanType } from "@paved/game-core";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

/**
 * A plan's nine letters are its spots in the contracts' order (`SpotType` without None): Center, NW, N, NE, E, SE, S,
 * SW, W. Each maps to its cell of the 3x3 grid, [row, column].
 */
const SPOT_CELLS: readonly (readonly [number, number])[] = [
  [1, 1], [0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0], [1, 0],
];

/** One colour per area letter, from the semantic tokens (city, forest, road, stop, wonder). */
const AREA_FILL: Record<string, string> = {
  C: "var(--muted-foreground)",
  F: "var(--success)",
  R: "var(--primary)",
  S: "var(--destructive)",
  W: "var(--info)",
};

/** The nine letters of a chain plan id (`PlanType`'s index, as `TileView.plan` and `GameView.plan` give it). */
export function planCode(plan: number): string {
  const type = Object.values(PlanType)[plan];
  return type && type !== PlanType.None ? type : "";
}

export const chipVariants = cva("relative inline-grid shrink-0 overflow-hidden rounded-md border-2 bg-secondary transition-colors", {
  variants: {
    size: { sm: "size-8", md: "size-14", lg: "size-24", xl: "size-32" },
    state: {
      default: "border-border",
      selected: "border-primary shadow-[0_0_0_3px_var(--state-selected)]",
      pending: "border-info animate-pulse motion-reduce:animate-none",
      refused: "border-destructive-text",
    },
  },
  defaultVariants: { size: "md", state: "default" },
});

/** A plan's image URL by its nine letters (lower case), or null when it has none. */
export type TileArt = (key: string) => string | null;

export interface TileChipProps extends VariantProps<typeof chipVariants> {
  /** Chain plan id; 0 (None) draws an empty slot. */
  plan: number;
  /** Chain orientation, 1 North to 4 West; the chip turns a quarter per step. */
  orientation?: number;
  /**
   * The image of a plan, given its nine letters in lower case: a URL (the 256 px copy the renderer draws: the chip then shows
   * the same art as the board, so the player recognises the tile they place, the PM's ruling, 2026-10-14), or null for a plan
   * with no image. Resolved by the page (`useTileArt`); the chip only draws. Without it, with `view="areas"`, or for a plan
   * with no image, the chip draws the plan's nine areas: a debug and accessibility view, and the fallback.
   */
  art?: TileArt;
  view?: "art" | "areas";
  className?: string;
}

/** A tile seen from above, turned to its orientation: the board's art, or its plan's nine areas on a 3x3 grid. */
export function TileChip({ plan, orientation = 1, art, view = "art", size, state, className }: TileChipProps) {
  const code = planCode(plan);
  const label = code ? `Tile ${code.toLowerCase()}, ${["north", "east", "south", "west"][(orientation - 1 + 4) % 4]}` : "No tile";
  const turn = { transform: `rotate(${(orientation - 1) * 90}deg)` };
  const src = code && view === "art" && art ? art(code.toLowerCase()) : null;
  const drawn = src != null;
  return (
    <span role="img" aria-label={label} data-state={state ?? "default"} data-view={drawn ? "art" : "areas"} className={cn(chipVariants({ size, state }), className)}>
      {drawn && (
        <img
          src={src}
          alt=""
          draggable={false}
          className="size-full object-cover transition-transform duration-200 motion-reduce:transition-none"
          style={turn}
        />
      )}
      {code && !drawn && (
        <svg
          viewBox="0 0 3 3"
          className="size-full transition-transform duration-200 motion-reduce:transition-none"
          style={turn}
          shapeRendering="crispEdges"
        >
          {code.split("").map((area, i) => {
            const [row, col] = SPOT_CELLS[i];
            return <rect key={i} x={col} y={row} width={1} height={1} fill={AREA_FILL[area] ?? "transparent"} />;
          })}
          <path d="M1 0v3M2 0v3M0 1h3M0 2h3" stroke="var(--background)" strokeWidth={0.04} opacity={0.35} />
        </svg>
      )}
    </span>
  );
}
