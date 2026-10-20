import { cn } from "../../lib/utils";
import { TileChip, planCode } from "./tile-chip";

/**
 * Where a build-time render is served (`scripts/render-tiles.ts`, the manifest's `renders`): a plan key or `cover` in a
 * theme (its `u8` id, 0 the base models), resolved by the page (`useTileRenders`), or null when the manifest lists none.
 */
export type TileRenders = (theme: number, key: string) => string | null;

/** A tile's name for the player: its plan number (1 to 19), as the shop and My tiles show it. */
export const tileName = (plan: number): string => `Tile ${plan}`;

export interface TileRenderProps {
  plan: number;
  /** The theme the render shows (0 the base models). */
  theme: number;
  renders?: TileRenders;
  /** The image's name; unset: the tile's name. */
  alt?: string;
  className?: string;
}

/**
 * One tile as the board draws it, from its build-time render: one image, no WebGL context (THEMES-RENDERS). Without a
 * render (no manifest, a plan it does not list) it is the plan's chip, so the cell is never blank.
 */
export function TileRender({ plan, theme, renders, alt, className }: TileRenderProps) {
  const src = renders?.(theme, planCode(plan).toLowerCase()) ?? null;
  if (!src) return <TileChip plan={plan} className={cn("size-full rounded-none border-0", className)} />;
  return <img src={src} alt={alt ?? tileName(plan)} loading="lazy" decoding="async" draggable={false} className={cn("block size-full object-cover", className)} />;
}

export interface ThemeCoverProps {
  theme: number;
  renders?: TileRenders;
  /** Coming soon: the render under a strong blur, so no art that does not exist is shown. */
  blurred?: boolean;
  alt: string;
  className?: string;
}

/** A theme's cover: a few of its tiles side by side, from the build (`cover.<theme>`); the board's backdrop without it. */
export function ThemeCover({ theme, renders, blurred, alt, className }: ThemeCoverProps) {
  const src = renders?.(theme, "cover") ?? null;
  return (
    <span className={cn("relative block aspect-[2/1] overflow-hidden bg-board", className)}>
      {src && (
        <img
          src={src}
          alt={blurred ? "" : alt}
          aria-hidden={blurred || undefined}
          loading="lazy"
          decoding="async"
          draggable={false}
          className={cn("absolute inset-0 size-full object-cover", blurred && "scale-110 blur-xl saturate-50")}
        />
      )}
    </span>
  );
}

export interface TileMosaicProps {
  /** The plans to show (chain ids, `PlanType`'s index), in reading order: two rows of four. */
  plans: readonly number[];
  theme?: number;
  renders?: TileRenders;
  className?: string;
}

/**
 * A patch of board from build-time tile renders (a Story campaign card): up to eight tiles in two rows of four, images only (no WebGL
 * context), each the plan's chip without a render. Decorative: the card it sits in names it.
 */
export function TileMosaic({ plans, theme = 0, renders, className }: TileMosaicProps) {
  return (
    <span aria-hidden className={cn("grid aspect-[2/1] grid-cols-4 grid-rows-2 overflow-hidden bg-board", className)}>
      {plans.slice(0, 8).map((plan, i) => (
        <TileRender key={`${plan}-${i}`} plan={plan} theme={theme} renders={renders} alt="" />
      ))}
    </span>
  );
}
