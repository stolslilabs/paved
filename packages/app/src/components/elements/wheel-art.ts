/**
 * The season wheel's art (the owner's direction of 2026-10-31, aligned with the player badge's that day): the paving stones and
 * gold of the badge's ring around the four seasons' little planet, the day and night disc at the centre, the gold pointer, the
 * sun and the moon. Images, not drawings: WebP copies in `public/wheel-art/` of the masters in `wheel-sources/`
 * (`scripts/compress-wheel-art.ts`). URLs and measures only: nothing here imports an image, and the module stays plain TypeScript
 * so the script reads it under Node.
 */

/** The wheel's layers, each an image of its own (one per line: `css-sources.test.ts` reads these as members, not classes). */
export type WheelLayer =
  | "season-ring"
  | "time-disc"
  | "icon-sun"
  | "icon-moon"
  | "shade"
  | "inner-bezel"
  | "frame"
  | "pointer"
  | "hub";

interface Frame {
  /** The master's side: every layer is a square. */
  side: number;
  /** The copies' sides. */
  sizes: readonly number[];
}

/** The full-dial layers' frame: one square, the dial centred, so they lie one over the other. */
const DIAL: Frame = { side: 1024, sizes: [192, 288, 432] };
/** The sun's and the moon's: a tenth of the dial wide, so 64 px covers the 144 px dial on a 3x screen. */
const SPRITE: Frame = { side: 512, sizes: [32, 64] };

/** Each layer's frame. The copies cover the 96 px dial on a 2x screen to the 144 px one on a 3x screen. */
export const WHEEL_ART = {
  "season-ring": DIAL,
  "time-disc": DIAL,
  "icon-sun": SPRITE,
  "icon-moon": SPRITE,
  shade: DIAL,
  "inner-bezel": DIAL,
  frame: DIAL,
  pointer: DIAL,
  hub: DIAL,
} as const satisfies Record<WheelLayer, Frame>;

export const WHEEL_ART_DIR = "/wheel-art";

/** A layer's copy at one of its sizes: `/wheel-art/<layer>/<size>.webp`. */
export const wheelArtUrl = (layer: WheelLayer, size: number) => `${WHEEL_ART_DIR}/${layer}/${size}.webp`;

/** The dial's CSS width at each breakpoint (`DIAL_SIZE`): 144 px from tablet up, 108 px from 390 px wide, 96 px below. */
export const DIAL_WIDTHS = [
  { from: "40rem", px: 144 },
  { from: "24.375rem", px: 108 },
  { from: null, px: 96 },
] as const;

/**
 * An `<img>`'s sources for a layer drawn `share` of the dial wide (1 for a full-dial layer): the largest copy as `src`, every copy
 * with its width in `srcSet`, and `sizes` by breakpoint, so a screen picks the smallest copy that stays sharp at its density.
 */
export function wheelArtSources(layer: WheelLayer, share = 1) {
  const { sizes } = WHEEL_ART[layer];
  return {
    src: wheelArtUrl(layer, sizes[sizes.length - 1]!),
    srcSet: sizes.map((s) => `${wheelArtUrl(layer, s)} ${s}w`).join(", "),
    sizes: DIAL_WIDTHS.map((w) => `${w.from ? `(min-width: ${w.from}) ` : ""}${Math.ceil(w.px * share)}px`).join(", "),
  };
}
