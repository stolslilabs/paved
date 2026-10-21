import { type AvatarColour, css, hexOf, shade } from "./avatar-palette";

/**
 * The backgrounds behind the head in the avatar's circle (AVATAR-LOOK, #626): 16 x 16 pixel art in the board's palette, scaled
 * up without smoothing, like the head's voxels. Plain colours, patterns, and scenes from the board (fields, forest, city,
 * water, mountains, night, a wonder). Ids follow `AVATAR_PARTS.background`.
 */
export const BACKGROUND_GRID = 16;
const N = BACKGROUND_GRID;

type Pixels = number[];
type Painter = (px: Pixels) => void;

const fill = (hex: number): Pixels => new Array<number>(N * N).fill(hex);
const put = (px: Pixels, x: number, y: number, hex: number) => {
  if (x >= 0 && x < N && y >= 0 && y < N) px[y * N + x] = hex;
};
const rect = (px: Pixels, x0: number, y0: number, w: number, h: number, hex: number) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(px, x, y, hex);
};

/** A plain colour, lighter at the top and darker at the bottom, in four bands. */
const plain =
  (colour: AvatarColour): Painter =>
  (px) => {
    const hex = hexOf(colour);
    for (let y = 0; y < N; y++) rect(px, 0, y, N, 1, shade(hex, 1.12 - Math.floor(y / 4) * 0.07));
  };

/** A sky from `top` to `bottom`, in bands. */
const sky = (px: Pixels, rows: number, top: number, bottom: number) => {
  for (let y = 0; y < rows; y++) {
    const t = y / Math.max(1, rows - 1);
    rect(px, 0, y, N, 1, t < 0.34 ? top : t < 0.67 ? shade(top, 1.08) : bottom);
  }
};

const PAINTERS: readonly Painter[] = [
  plain("amber"),
  plain("grass"),
  plain("water"),
  plain("ink"),
  plain("brick"),
  plain("violet"),
  // Checker: gold and amber squares.
  (px) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) put(px, x, y, (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? hexOf("gold") : hexOf("amber"));
  },
  // Stripes: diagonal, the river's blues.
  (px) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) put(px, x, y, Math.floor((x + y) / 3) % 2 ? hexOf("water") : hexOf("lake"));
  },
  // Dots: the meadow's green, spotted.
  (px) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) put(px, x, y, (x % 4 === 1 && y % 4 === 1) || (x % 4 === 3 && y % 4 === 3) ? shade(hexOf("grass"), 1.25) : hexOf("grass"));
  },
  // Rays: a sunburst from the middle.
  (px) => {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const angle = Math.atan2(y - N / 2 + 0.5, x - N / 2 + 0.5) + Math.PI;
        put(px, x, y, Math.floor((angle / (2 * Math.PI)) * 12) % 2 ? hexOf("brick") : hexOf("amber"));
      }
    }
  },
  // Fields: a sky with a cloud, green hills, flowers.
  (px) => {
    sky(px, 10, hexOf("shallows"), shade(hexOf("shallows"), 1.15));
    rect(px, 2, 2, 4, 1, hexOf("white"));
    rect(px, 1, 3, 6, 1, hexOf("white"));
    rect(px, 11, 4, 3, 1, shade(hexOf("white"), 0.94));
    for (let x = 0; x < N; x++) {
      const hill = 9 + Math.round(1.5 * Math.sin(x / 2.6));
      for (let y = hill; y < N; y++) put(px, x, y, y > 12 ? hexOf("leaf") : hexOf("grass"));
    }
    for (const [x, y] of [
      [2, 12],
      [6, 14],
      [11, 13],
      [14, 15],
    ] as const)
      put(px, x, y, hexOf("gold"));
  },
  // Forest: pines against the sky.
  (px) => {
    sky(px, N, hexOf("lake"), shade(hexOf("lake"), 1.2));
    rect(px, 0, 13, N, 3, hexOf("leaf"));
    for (const [cx, top, colour] of [
      [2, 4, "pine"],
      [7, 2, "leaf"],
      [12, 5, "pine"],
      [15, 7, "leaf"],
    ] as const) {
      for (let y = top; y < 13; y++) {
        const half = Math.floor((y - top) / 2);
        rect(px, cx - half, y, half * 2 + 1, 1, (y - top) % 2 ? hexOf(colour) : shade(hexOf(colour), 0.85));
      }
      rect(px, cx, 13, 1, 2, hexOf("trunk"));
    }
  },
  // City: walls and towers, the cities' roofs.
  (px) => {
    sky(px, N, hexOf("shallows"), shade(hexOf("shallows"), 1.2));
    const wall = hexOf("wall");
    rect(px, 0, 10, N, 6, wall);
    for (let x = 0; x < N; x += 2) put(px, x, 9, wall);
    for (const [x0, top] of [
      [1, 4],
      [10, 3],
    ] as const) {
      rect(px, x0, top + 2, 5, 16 - top, shade(wall, 0.92));
      for (let k = 0; k < 3; k++) rect(px, x0 + k, top + 2 - k, 5 - 2 * k, 1, hexOf("brick"));
      put(px, x0 + 2, top - 1, hexOf("brick"));
      rect(px, x0 + 2, top + 5, 1, 2, hexOf("coal"));
    }
    rect(px, 7, 12, 2, 4, hexOf("roof"));
    for (let x = 0; x < N; x++) put(px, x, 15, shade(wall, 0.8));
  },
  // Water: waves under a strip of sky.
  (px) => {
    sky(px, 5, hexOf("shallows"), shade(hexOf("shallows"), 1.15));
    rect(px, 0, 5, N, N - 5, hexOf("water"));
    for (let y = 6; y < N; y += 3) for (let x = (y * 2) % 5; x < N; x += 5) rect(px, x, y, 2, 1, hexOf("lake"));
    rect(px, 0, 5, N, 1, hexOf("lake"));
  },
  // Mountains: stone peaks with snow.
  (px) => {
    sky(px, N, hexOf("shallows"), shade(hexOf("shallows"), 1.2));
    for (const [cx, peak, colour] of [
      [4, 4, "slate"],
      [11, 2, "stone"],
    ] as const) {
      for (let y = peak; y < N; y++) {
        const half = y - peak;
        rect(px, cx - half, y, half * 2 + 1, 1, y - peak < 2 ? hexOf("white") : banded(colour, y));
      }
    }
    rect(px, 0, 13, N, 3, hexOf("grass"));
  },
  // Night: stars, a moon, dark hills.
  (px) => {
    sky(px, N, hexOf("navy"), shade(hexOf("navy"), 1.2));
    for (const [x, y] of [
      [1, 2],
      [5, 1],
      [8, 4],
      [3, 6],
      [13, 7],
      [7, 8],
      [15, 1],
    ] as const)
      put(px, x, y, hexOf("gold"));
    rect(px, 11, 2, 3, 3, hexOf("gold"));
    put(px, 13, 2, hexOf("navy"));
    for (let x = 0; x < N; x++) {
      const hill = 12 + Math.round(Math.sin(x / 3));
      for (let y = hill; y < N; y++) put(px, x, y, hexOf("pine"));
    }
  },
  // Wonder: a stepped monument under a violet sky.
  (px) => {
    sky(px, N, hexOf("plum"), hexOf("violet"));
    for (let k = 0; k < 5; k++) rect(px, 2 + k, 15 - k * 2, 12 - 2 * k, 2, k % 2 ? hexOf("rust") : hexOf("wine"));
    rect(px, 7, 4, 2, 2, hexOf("gold"));
    put(px, 7, 2, hexOf("amber"));
    put(px, 8, 3, hexOf("amber"));
    put(px, 3, 3, hexOf("gold"));
    put(px, 12, 2, hexOf("gold"));
  },
];

function banded(colour: AvatarColour, y: number): number {
  return y % 3 === 0 ? shade(hexOf(colour), 0.88) : hexOf(colour);
}

export const BACKGROUND_COUNT = PAINTERS.length;

/** The background's 16 x 16 colours, in rows from the top. */
export function backgroundPixels(id: number): number[] {
  const px = fill(0);
  (PAINTERS[id] ?? PAINTERS[0])(px);
  return px;
}

/** Draws a background over `size` x `size` px of a 2D canvas, without smoothing. */
export function drawBackground(ctx: CanvasRenderingContext2D, id: number, size: number): void {
  const px = backgroundPixels(id);
  const cell = size / N;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      ctx.fillStyle = css(px[y * N + x]);
      // Each cell reaches the next one's edge, so no seam shows between them at a fractional scale.
      const x0 = Math.floor(x * cell);
      const y0 = Math.floor(y * cell);
      ctx.fillRect(x0, y0, Math.ceil((x + 1) * cell) - x0, Math.ceil((y + 1) * cell) - y0);
    }
  }
}
