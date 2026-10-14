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

/** One colour per area letter, from the theme's scales (city, forest, road, stop, wonder). */
const AREA_FILL: Record<string, string> = {
  C: "var(--color-ink-300)",
  F: "var(--color-meadow-600)",
  R: "var(--color-gold-200)",
  S: "var(--color-ember-500)",
  W: "var(--color-river-400)",
};

/** The nine letters of a chain plan id (`PlanType`'s index, as `TileView.plan` and `GameView.plan` give it). */
export function planCode(plan: number): string {
  const type = Object.values(PlanType)[plan];
  return type && type !== PlanType.None ? type : "";
}

const chipVariants = cva("relative inline-grid shrink-0 overflow-hidden rounded-md border-2 bg-ink-800 transition-colors", {
  variants: {
    size: { sm: "size-8", md: "size-14", lg: "size-24" },
    state: {
      default: "border-border",
      selected: "border-primary shadow-[0_0_0_3px_var(--color-gold-950)]",
      pending: "border-info animate-pulse motion-reduce:animate-none",
      refused: "border-destructive-text",
    },
  },
  defaultVariants: { size: "md", state: "default" },
});

export interface TileChipProps extends VariantProps<typeof chipVariants> {
  /** Chain plan id; 0 (None) draws an empty slot. */
  plan: number;
  /** Chain orientation, 1 North to 4 West; the chip turns a quarter per step. */
  orientation?: number;
  className?: string;
}

/**
 * A tile seen from above: its plan's nine areas on a 3x3 grid, turned to its orientation. The 2D PNGs and the 3D models
 * live in app-web's `public/` (not served by this package yet): the chip draws the plan from its letters instead.
 */
export function TileChip({ plan, orientation = 1, size, state, className }: TileChipProps) {
  const code = planCode(plan);
  const label = code ? `Tile ${code.toLowerCase()}, ${["north", "east", "south", "west"][(orientation - 1 + 4) % 4]}` : "No tile";
  return (
    <span role="img" aria-label={label} data-state={state ?? "default"} className={cn(chipVariants({ size, state }), className)}>
      {code && (
        <svg
          viewBox="0 0 3 3"
          className="size-full transition-transform duration-200 motion-reduce:transition-none"
          style={{ transform: `rotate(${(orientation - 1) * 90}deg)` }}
          shapeRendering="crispEdges"
        >
          {code.split("").map((area, i) => {
            const [row, col] = SPOT_CELLS[i];
            return <rect key={i} x={col} y={row} width={1} height={1} fill={AREA_FILL[area] ?? "transparent"} />;
          })}
          <path d="M1 0v3M2 0v3M0 1h3M0 2h3" stroke="var(--color-ink-950)" strokeWidth={0.04} opacity={0.35} />
        </svg>
      )}
    </span>
  );
}
