import type { ReactNode } from "react";
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
  /** The top-down render (`<plan>-top`, the deck sheet's and the coming tiles'), in its default orientation; unset: the angled one. */
  top?: boolean;
  className?: string;
}

/**
 * One tile as the board draws it, from its build-time render: one image, no WebGL context (THEMES-RENDERS). Without a
 * render (no manifest, a plan it does not list) it is the plan's chip, so the cell is never blank.
 */
export function TileRender({ plan, theme, renders, alt, top, className }: TileRenderProps) {
  const src = renders?.(theme, `${planCode(plan).toLowerCase()}${top ? "-top" : ""}`) ?? null;
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

/** A Story background's widths (`scripts/render-tiles.ts`, `STORY_WIDTHS`), 16:10: the phone's card at DPR 3, the grid's at DPR 2. */
export const STORY_BACKGROUND_WIDTHS = [720, 1040] as const;
/**
 * The card's width on the page (`StoryScene`): about 86 % of a phone's width (the carousel) or all of it, half the tablet's
 * grid (768 px at most), a third of the desktop's (1024 px at most).
 */
const STORY_BACKGROUND_SIZES = "(min-width: 64rem) 330px, (min-width: 40rem) min(50vw, 370px), 100vw";

/**
 * A background from the build at each of `widths` (`<name>-<width>` in `theme`): the `src` (the widest) and the `srcSet` the
 * browser picks the width its box needs from. Null when the manifest lists none.
 */
function backgroundRenders(name: string, theme: number, widths: readonly number[], renders: TileRenders | undefined): { src: string; srcSet: string } | null {
  const found: { width: number; src: string }[] = [];
  for (const width of widths) {
    const src = renders?.(theme, `${name}-${width}`);
    if (src) found.push({ width, src });
  }
  if (found.length === 0) return null;
  return { src: found[found.length - 1]!.src, srcSet: found.map(({ width, src }) => `${src} ${width}w`).join(", ") };
}

/**
 * A Story campaign's background (issue 721), from the build (`story-<campaign>-<width>` in the campaign's theme): the browser picks
 * the width its card needs. Null when the manifest lists none (the card draws its tiles instead). Decorative.
 */
export function storyBackground(campaign: number, theme: number, renders: TileRenders | undefined): { src: string; srcSet: string } | null {
  return backgroundRenders(`story-${campaign}`, theme, STORY_BACKGROUND_WIDTHS, renders);
}

/** A background image from the build, filling its box (`object-cover`), decorative; `name` its `data-background`. */
function BackgroundImage({ image, sizes, name, className }: { image: { src: string; srcSet: string }; sizes: string; name: string | number; className?: string }) {
  return (
    <img
      src={image.src}
      srcSet={image.srcSet}
      sizes={sizes}
      alt=""
      aria-hidden
      decoding="async"
      draggable={false}
      data-background={name}
      className={cn("block size-full object-cover", className)}
    />
  );
}

export interface StoryBackgroundProps {
  campaign: number;
  theme: number;
  renders?: TileRenders;
  /** Without a background in the manifest (no manifest, an older build): what draws instead. */
  fallback: ReactNode;
  className?: string;
}

/** A Story campaign's background image, filling its box (`object-cover`), or `fallback` without one. */
export function StoryBackground({ campaign, theme, renders, fallback, className }: StoryBackgroundProps) {
  const image = storyBackground(campaign, theme, renders);
  if (!image) return fallback;
  return <BackgroundImage image={image} sizes={STORY_BACKGROUND_SIZES} name={campaign} className={className} />;
}

/** A battle log's background widths (`scripts/render-tiles.ts`, `BATTLE_WIDTHS`), 3:1: the phone's card at DPR 3, the wide page's at DPR 1 and 2. */
export const BATTLE_BACKGROUND_WIDTHS = [720, 1040, 2000] as const;
/** The battle backgrounds' theme: both in Default (issue 857), told apart by what they draw and how they are framed. */
const BATTLE_BACKGROUND_THEME = 0;
/** The card's width on the page (the League page, `max-w-5xl` less its gutters): the whole width less 2rem, 992 px at most. */
const BATTLE_BACKGROUND_SIZES = "(min-width: 64rem) 992px, calc(100vw - 2rem)";

export interface BattleBackgroundProps {
  /** An attack's background (a village in a warm light) or a defence's (a walled one, cool). */
  side: "attack" | "defence";
  renders?: TileRenders;
  className?: string;
}

/**
 * A battle log card's background (issue 857), from the build as the Story's (`battle-<side>-<width>`): renders of the game's own
 * boards, the browser picking the width the card needs. Nothing when the manifest lists none (the card's own colour shows).
 */
export function BattleBackground({ side, renders, className }: BattleBackgroundProps) {
  const image = backgroundRenders(`battle-${side}`, BATTLE_BACKGROUND_THEME, BATTLE_BACKGROUND_WIDTHS, renders);
  if (!image) return null;
  return <BackgroundImage image={image} sizes={BATTLE_BACKGROUND_SIZES} name={`battle-${side}`} className={className} />;
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
