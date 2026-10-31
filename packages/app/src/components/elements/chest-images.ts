/**
 * The chests' images (the owner's direction of 2026-10-31, `docs/design/chests.webp`): the three ranks in a Supercell-like mobile
 * game's rendering, each as its closed chest, its open chest in two layers (the lid raised behind, the body in front, so the light
 * comes out between them) and its icon, and the opening's effects (the rays, a sparkle, a dust puff). Images, not drawings: WebP
 * copies in `public/chest-art/` of the masters in `chest-sources/` (`scripts/compress-chest-art.ts`). URLs and measures only:
 * nothing here imports an image, and the module stays plain TypeScript so the script reads it under Node.
 */
import type { ChestRank } from "./chest-designs";

/** A chest's layers, each an image of its own (one per line: `css-sources.test.ts` reads these as members, not classes). */
export type ChestLayer =
  | "closed"
  | "lid"
  | "body"
  | "icon";

/** The opening's effects, shared by the ranks (white, so the code tints the light in the rank's colour). */
export type ChestEffect =
  | "rays"
  | "sparkle"
  | "dust";

interface Frame {
  /** The master's size: an image takes its box before it loads. */
  width: number;
  height: number;
  /** The side the copies are sized on, and their sizes on it (the other side follows the frame). */
  side: "width" | "height";
  sizes: readonly number[];
}

/**
 * The art's frame: one square for the closed chest, the lid and the body, so they lie one over the other and the open chest's body
 * sits exactly where the closed chest stood. The chest's foot is at `CHEST_BASE` of its height, with room above for the raised lid.
 * The copies cover the slots' 4rem chest on a 2x screen to the modal's 16rem one on a 3x screen.
 */
const ART: Frame = { width: 800, height: 800, side: "width", sizes: [160, 320, 480, 768] };
/** The icon's frame: 5 by 4, `ChestIcon`'s box (1.25em by 1em), the chest on its foot; 16 to 60 px high on a 1x to 3x screen. */
const ICON: Frame = { width: 560, height: 448, side: "height", sizes: [48, 96, 192] };

export const CHEST_LAYERS = {
  closed: ART,
  lid: ART,
  body: ART,
  icon: ICON,
} as const satisfies Record<ChestLayer, Frame>;

export const CHEST_EFFECTS = {
  rays: { width: 1024, height: 1024, side: "width", sizes: [320, 640] },
  sparkle: { width: 512, height: 512, side: "width", sizes: [64, 128] },
  dust: { width: 1024, height: 512, side: "width", sizes: [256, 512] },
} as const satisfies Record<ChestEffect, Frame>;

/**
 * Where things are on the art's frame, as shares of its side: the mouth's middle and width once the lid is up (where the light
 * comes from), the hinges' line (the lid's foot, behind the body's back rim), the raised lid's box. Measured on the masters.
 */
export interface ChestMeasures {
  mouth: { x: number; y: number; w: number };
  hinge: number;
  lid: readonly [x: number, y: number, w: number, h: number];
}

export const CHEST_MEASURES: Readonly<Record<ChestRank, ChestMeasures>> = {
  basic: { mouth: { x: 0.4994, y: 0.5969, w: 0.6062 }, hinge: 0.5487, lid: [0.2888, 0.2487, 0.565, 0.3425] },
  rare: { mouth: { x: 0.4838, y: 0.4913, w: 0.4662 }, hinge: 0.4163, lid: [0.295, 0.0788, 0.5975, 0.4138] },
  epic: { mouth: { x: 0.5175, y: 0.545, w: 0.6275 }, hinge: 0.475, lid: [0.27, 0.0575, 0.6675, 0.4775] },
};

/** The chests' foot on the art's frame, as a share of its height: every closed chest and every body stands on it. */
export const CHEST_BASE = 0.95;

export const CHEST_ART_DIR = "/chest-art";

/** A rank's layer at one of its sizes: `/chest-art/<rank>/<layer>/<size>.webp`. */
export const chestImageUrl = (rank: ChestRank, layer: ChestLayer, size: number) => `${CHEST_ART_DIR}/${rank}/${layer}/${size}.webp`;
/** An effect at one of its sizes: `/chest-art/fx/<effect>/<size>.webp`. */
export const chestEffectUrl = (effect: ChestEffect, size: number) => `${CHEST_ART_DIR}/fx/${effect}/${size}.webp`;

/** The smallest of `sizes` that covers `px` device pixels, or the largest. */
export function pickSize(sizes: readonly number[], px: number): number {
  return sizes.find((s) => s >= px) ?? sizes[sizes.length - 1]!;
}

/**
 * The icon's `<img>` sources shown `px` CSS pixels high: the largest copy as `src`, every copy with its width in `srcSet`, and
 * `sizes`, so a screen picks the smallest copy that stays sharp at its density.
 */
export function chestIconSources(rank: ChestRank, px: number) {
  const { sizes, width, height } = CHEST_LAYERS.icon;
  const w = (s: number) => Math.round((s * width) / height);
  return {
    src: chestImageUrl(rank, "icon", sizes[sizes.length - 1]!),
    srcSet: sizes.map((s) => `${chestImageUrl(rank, "icon", s)} ${w(s)}w`).join(", "),
    sizes: `${Math.ceil((px * width) / height)}px`,
  };
}
