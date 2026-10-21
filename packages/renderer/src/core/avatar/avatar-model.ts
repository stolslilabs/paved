import type { Avatar } from "./avatar-format";
import { type AvatarColour, hexOf, shade } from "./avatar-palette";

/**
 * The avatar's head as voxels (AVATAR-LOOK, #626): an 8 x 8 x 8 cube of skin, x to the right of a viewer facing it, y up, z
 * towards the viewer, so the face is the layer z = 7. A part paints the head's surface voxels (eyes, a mouth: what the 8 x 8
 * face grid shows) and may add voxels around it (a fringe, a beard, a hat's brim: what true voxels add). Both looks are drawn
 * from this one model (`avatar-render.ts`): "voxel" draws every voxel, "grid" a plain cube painted with the surface and a
 * second, slightly larger cube painted with what lies around it, as Minecraft's head and hat layers.
 */
export const HEAD = 8;
/** The highest index of the head's cube. */
const M = HEAD - 1;

/** A voxel's key: each coordinate offset by 32 into 6 bits. Room from -32 to 31 on each axis. */
const keyOf = (x: number, y: number, z: number): number => (x + 32) | ((y + 32) << 6) | ((z + 32) << 12);
const coordsOf = (key: number): [number, number, number] => [(key & 63) - 32, ((key >> 6) & 63) - 32, ((key >> 12) & 63) - 32];

export class VoxelHead {
  private readonly cells = new Map<number, number>();

  set(x: number, y: number, z: number, hex: number): void {
    this.cells.set(keyOf(x, y, z), hex);
  }
  get(x: number, y: number, z: number): number | undefined {
    return this.cells.get(keyOf(x, y, z));
  }
  has(x: number, y: number, z: number): boolean {
    return this.cells.has(keyOf(x, y, z));
  }
  delete(x: number, y: number, z: number): void {
    this.cells.delete(keyOf(x, y, z));
  }
  get size(): number {
    return this.cells.size;
  }
  /** Every voxel: its coordinates and colour. */
  *voxels(): IterableIterator<[number, number, number, number]> {
    for (const [key, hex] of this.cells) yield [...coordsOf(key), hex];
  }
  /** Whether a voxel lies in the head's cube (the rest is what the parts add around it). */
  static inHead(x: number, y: number, z: number): boolean {
    return x >= 0 && x <= M && y >= 0 && y <= M && z >= 0 && z <= M;
  }
}

/** The colours a head is painted with: the skin's and the hair's, with their shades. */
interface Tones {
  skin: number;
  skinShade: number;
  lip: number;
  hair: number;
  hairShade: number;
}

/** The colours of each skin and hair colour id (`AVATAR_PARTS.skin`, `.hairColour`). */
const SKINS: readonly AvatarColour[] = ["sand", "wheat", "clay", "ochre", "oak", "walnut", "earth", "moss", "lavender"];
const HAIR_COLOURS: readonly AvatarColour[] = ["coal", "bark", "chestnut", "copper", "straw", "ash"];

/** A face pixel: `row` 0 is the top of the face, `col` 0 its left (as the viewer sees it). */
const front = (head: VoxelHead, row: number, col: number, hex: number) => head.set(col, M - row, M, hex);
/** A whole row of the face, from `from` to `to` (inclusive). */
const frontRow = (head: VoxelHead, row: number, from: number, to: number, hex: number) => {
  for (let col = from; col <= to; col++) front(head, row, col, hex);
};
/** A voxel standing `out` voxels in front of a face pixel (out 1: just in front). */
const before = (head: VoxelHead, row: number, col: number, hex: number, out = 1) => head.set(col, M - row, M + out, hex);
/** A pixel and its mirror across the face's middle. */
const pair = (head: VoxelHead, row: number, col: number, hex: number) => {
  front(head, row, col, hex);
  front(head, row, M - col, hex);
};

/**
 * The hair's cap: the top, and the rows of each side down to a depth. `side(z)` is the side's depth at that depth of the head
 * (0 at the back), so a style can cut the hair back over the ears.
 */
function cap(head: VoxelHead, tones: Tones, frontRows: number, side: (z: number) => number, backRows: number) {
  const hex = (a: number, b: number) => ((a * 3 + b * 5) % 7 === 0 ? tones.hairShade : tones.hair);
  for (let x = 0; x <= M; x++) for (let z = 0; z <= M; z++) head.set(x, M, z, hex(x, z));
  for (let row = 0; row < frontRows; row++) for (let x = 0; x <= M; x++) head.set(x, M - row, M, hex(x, row));
  for (let row = 0; row < backRows; row++) for (let x = 0; x <= M; x++) head.set(x, M - row, 0, hex(x, row));
  for (let z = 0; z <= M; z++) {
    for (let row = 0; row < side(z); row++) {
      head.set(0, M - row, z, hex(z, row));
      head.set(M, M - row, z, hex(z, row + 1));
    }
  }
}

/** A layer of voxels over the top of the head, at height `y`, where `where(x, z)` holds. */
function topLayer(head: VoxelHead, y: number, hex: (x: number, z: number) => number, where: (x: number, z: number) => boolean = () => true, from = 0, to = M) {
  for (let x = from; x <= to; x++) for (let z = from; z <= to; z++) if (where(x, z)) head.set(x, y, z, hex(x, z));
}

const HAIRS: readonly ((head: VoxelHead, t: Tones) => void)[] = [
  // Short: the classic cap, flush with the head.
  (head, t) => {
    cap(head, t, 1, (z) => (z < 5 ? 3 : 2), 4);
    pair(head, 1, 0, t.hair);
  },
  // Bald: a shine on the crown.
  (head, t) => head.set(3, M, 3, shade(t.skin, 1.12)),
  // Fringe: bangs over the forehead, standing out of the face.
  (head, t) => {
    cap(head, t, 2, () => 3, 5);
    frontRow(head, 2, 0, 2, t.hair);
    topLayer(head, HEAD, (x, z) => ((x + z) % 3 === 0 ? t.hairShade : t.hair));
    for (let col = 0; col <= M; col++) before(head, 0, col, t.hair);
    for (let col = 0; col <= 4; col++) before(head, 1, col, col % 2 ? t.hair : t.hairShade);
  },
  // Long: down the sides and the back, past the chin.
  (head, t) => {
    cap(head, t, 1, (z) => (z < 4 ? HEAD : 2), HEAD);
    pair(head, 1, 0, t.hair);
    topLayer(head, HEAD, (x, z) => ((x * z) % 4 === 1 ? t.hairShade : t.hair));
    for (let y = -2; y <= M; y++) {
      for (let z = -1; z <= 4; z++) {
        const hex = (y + z) % 3 === 0 ? t.hairShade : t.hair;
        head.set(-1, y, z, hex);
        head.set(HEAD, y, z, hex);
      }
      for (let x = -1; x <= HEAD; x++) head.set(x, y, -1, (x + y) % 3 === 0 ? t.hairShade : t.hair);
    }
  },
  // Mohawk: shaved sides, a crest from the brow to the nape.
  (head, t) => {
    cap(head, t, 1, () => 2, 3);
    const shaved = shade(t.skin, 0.84);
    for (let x = 0; x <= M; x++) for (let z = 0; z <= M; z++) if (x < 3 || x > 4) head.set(x, M, z, shaved);
    for (let z = 0; z <= M; z++) {
      head.set(0, M, z, shaved);
      head.set(M, M, z, shaved);
      for (const x of [3, 4]) {
        head.set(x, HEAD, z, t.hair);
        if (z > 0 && z < M) head.set(x, HEAD + 1, z, z % 2 ? t.hair : t.hairShade);
        if (z > 1 && z < M - 1) head.set(x, HEAD + 2, z, t.hair);
      }
    }
    frontRow(head, 0, 0, M, shaved);
    frontRow(head, 0, 3, 4, t.hair);
  },
  // Curly: a bumpy mass over the top and the brow.
  (head, t) => {
    cap(head, t, 2, () => 4, 6);
    topLayer(head, HEAD, (x, z) => ((x + z) % 2 ? t.hair : t.hairShade), () => true, -1, HEAD);
    topLayer(head, HEAD + 1, () => t.hair, (x, z) => (x + z) % 2 === 0, 0, M);
    for (let col = -1; col <= HEAD; col++) {
      before(head, 0, col, col % 2 ? t.hairShade : t.hair);
      if (col % 2 === 0) before(head, 1, col, t.hair);
    }
    for (let z = -1; z <= M; z++) {
      for (let row = 0; row < 3; row++) {
        head.set(-1, M - row, z, (z + row) % 2 ? t.hair : t.hairShade);
        head.set(HEAD, M - row, z, (z + row) % 2 ? t.hairShade : t.hair);
      }
      for (let x = -1; x <= HEAD; x++) for (let row = 0; row < 5; row++) head.set(x, M - row, -1, (x + row) % 2 ? t.hair : t.hairShade);
    }
  },
  // Side part: swept to the left, with some volume on top.
  (head, t) => {
    cap(head, t, 2, (z) => (z < 5 ? 3 : 2), 4);
    frontRow(head, 1, 5, M, shade(t.skin, 1));
    frontRow(head, 1, 0, 4, t.hair);
    frontRow(head, 2, 0, 1, t.hair);
    front(head, 0, 5, t.hairShade);
    topLayer(head, HEAD, (x, z) => (x === 5 ? t.hairShade : t.hair), (x) => x <= 5);
    for (let col = 0; col <= 4; col++) before(head, 0, col, t.hair);
  },
  // Bun: a knot on the crown.
  (head, t) => {
    cap(head, t, 1, (z) => (z < 5 ? 3 : 2), 5);
    for (const x of [3, 4]) {
      for (const y of [HEAD, HEAD + 1]) for (const z of [2, 3]) head.set(x, y, z, (x + y + z) % 2 ? t.hair : t.hairShade);
    }
    head.set(3, HEAD, 4, t.hairShade);
    head.set(4, HEAD, 4, t.hairShade);
  },
];

const EYES: readonly ((head: VoxelHead, t: Tones) => void)[] = [
  // Classic: white and iris, Minecraft's.
  (head) => {
    pair(head, 4, 1, hexOf("white"));
    pair(head, 4, 2, hexOf("water"));
  },
  // Dots.
  (head) => pair(head, 4, 2, hexOf("coal")),
  // Wide: two by two, the pupil low and inward.
  (head) => {
    for (const col of [1, 2]) {
      pair(head, 4, col, hexOf("white"));
      pair(head, 5, col, col === 2 ? hexOf("coal") : hexOf("white"));
    }
  },
  // Sleepy: a lid over a narrow eye.
  (head, t) => {
    for (const col of [1, 2]) pair(head, 4, col, shade(t.skin, 0.62));
    pair(head, 5, 2, hexOf("coal"));
  },
  // Wink: the left eye open, the right shut.
  (head, t) => {
    front(head, 4, 1, hexOf("white"));
    front(head, 4, 2, hexOf("water"));
    front(head, 4, 5, shade(t.skin, 0.55));
    front(head, 4, 6, shade(t.skin, 0.55));
  },
  // Glowing: the wonders' gold.
  (head) => {
    pair(head, 4, 1, hexOf("amber"));
    pair(head, 4, 2, hexOf("gold"));
  },
];

const EYEBROWS: readonly ((head: VoxelHead, t: Tones) => void)[] = [
  () => {},
  // Flat.
  (head, t) => {
    for (const col of [1, 2]) pair(head, 3, col, t.hairShade);
  },
  // Raised: a row higher, curved.
  (head, t) => {
    pair(head, 2, 1, t.hairShade);
    pair(head, 2, 2, t.hairShade);
    pair(head, 3, 0, t.hairShade);
  },
  // Angry: slanted down to the middle.
  (head, t) => {
    pair(head, 2, 1, t.hairShade);
    pair(head, 3, 2, t.hairShade);
    pair(head, 3, 3, t.hairShade);
  },
  // Bushy: thick, standing out of the brow.
  (head, t) => {
    for (const col of [0, 1, 2]) {
      pair(head, 3, col, t.hairShade);
      before(head, 3, col, t.hair);
      before(head, 3, M - col, t.hair);
    }
  },
];

const MOUTHS: readonly ((head: VoxelHead, t: Tones) => void)[] = [
  // Smile: its corners up, clear of the eyes.
  (head, t) => {
    pair(head, 6, 2, t.lip);
    frontRow(head, 7, 3, 4, t.lip);
  },
  // Neutral.
  (head, t) => frontRow(head, 6, 2, 5, t.lip),
  // Grin: teeth.
  (head, t) => {
    pair(head, 6, 2, t.lip);
    frontRow(head, 6, 3, 4, hexOf("white"));
    frontRow(head, 7, 3, 4, t.lip);
  },
  // Open: surprise.
  (head) => {
    frontRow(head, 6, 3, 4, shade(hexOf("wine"), 0.6));
    frontRow(head, 7, 3, 4, hexOf("wine"));
  },
  // Smirk: one corner up.
  (head, t) => {
    frontRow(head, 7, 2, 4, t.lip);
    front(head, 6, 5, t.lip);
  },
  // Frown.
  (head, t) => {
    frontRow(head, 6, 3, 4, t.lip);
    pair(head, 7, 2, t.lip);
  },
];

/** The rows of a full beard on the face, around the mouth (which it keeps). */
function fullBeard(head: VoxelHead, t: Tones) {
  const keep = (row: number, col: number) => head.get(col, M - row, M) !== t.skin;
  for (let row = 5; row <= M; row++) {
    for (let col = 0; col <= M; col++) {
      if (row === 5 && col > 0 && col < M) continue;
      if (row === 6 && col > 1 && col < M - 1 && keep(row, col)) continue;
      if (row === M && col > 2 && col < 5 && keep(row, col)) continue;
      front(head, row, col, (row + col) % 3 ? t.hair : t.hairShade);
    }
  }
  for (let z = 3; z <= M; z++) {
    for (let row = 3; row <= M; row++) {
      if (row < 5 && z > 4) continue;
      head.set(0, M - row, z, t.hair);
      head.set(M, M - row, z, t.hair);
    }
  }
  for (let x = 0; x <= M; x++) for (let z = 3; z <= M; z++) head.set(x, 0, z, t.hairShade);
  // Its volume: a layer under the chin and in front of the jaw.
  for (let x = 0; x <= M; x++) {
    for (let z = 3; z <= HEAD; z++) head.set(x, -1, z, (x + z) % 3 ? t.hair : t.hairShade);
    if (x < 2 || x > 5) before(head, 6, x, t.hair);
    before(head, M, x, (x * 2) % 3 ? t.hair : t.hairShade);
  }
}

const BEARDS: readonly ((head: VoxelHead, t: Tones) => void)[] = [
  () => {},
  // Stubble: the jaw a shade towards the hair.
  (head, t) => {
    const stubble = mix(t.skin, t.hair, 0.35);
    for (let row = 6; row <= M; row++) {
      for (let col = 0; col <= M; col++) if (head.get(col, M - row, M) === t.skin) front(head, row, col, stubble);
    }
    for (let z = 4; z <= M; z++) {
      for (const row of [5, 6, 7]) {
        head.set(0, M - row, z, stubble);
        head.set(M, M - row, z, stubble);
      }
    }
  },
  // Moustache: under the nose, standing out.
  (head, t) => {
    frontRow(head, 5, 1, 6, t.hair);
    pair(head, 6, 1, t.hairShade);
    for (let col = 1; col <= 6; col++) before(head, 5, col, col === 1 || col === 6 ? t.hairShade : t.hair);
  },
  // Goatee: on the chin, and a tuft below.
  (head, t) => {
    frontRow(head, M, 2, 5, t.hair);
    before(head, M, 3, t.hair);
    before(head, M, 4, t.hairShade);
    head.set(3, -1, M, t.hair);
    head.set(4, -1, M, t.hair);
    head.set(3, -1, HEAD, t.hairShade);
    head.set(4, -1, HEAD, t.hair);
  },
  // Full.
  fullBeard,
  // Long: a full beard down to the chest.
  (head, t) => {
    fullBeard(head, t);
    for (let x = 1; x <= 6; x++) for (let z = 5; z <= HEAD; z++) head.set(x, -2, z, (x + z) % 3 ? t.hair : t.hairShade);
    for (let x = 2; x <= 5; x++) for (let z = 6; z <= HEAD; z++) head.set(x, -3, z, (x + z) % 2 ? t.hair : t.hairShade);
    for (let z = 7; z <= HEAD; z++) for (const x of [3, 4]) head.set(x, -4, z, t.hairShade);
  },
];

const ACCESSORIES: readonly ((head: VoxelHead, t: Tones) => void)[] = [
  () => {},
  // Glasses: a frame in front of the eyes, its arms back to the ears.
  (head) => {
    const frame = hexOf("coal");
    for (let col = 0; col <= M; col++) {
      front(head, 3, col, frame);
      before(head, 3, col, frame);
    }
    for (const col of [0, 3, 4, M]) {
      front(head, 4, col, frame);
      before(head, 4, col, frame);
    }
    for (let z = 3; z <= HEAD; z++) {
      head.set(-1, M - 3, z, frame);
      head.set(HEAD, M - 3, z, frame);
    }
  },
  // Sunglasses: dark lenses and a bar.
  (head) => {
    const frame = hexOf("coal");
    const lens = hexOf("black");
    for (let col = 0; col <= M; col++) {
      front(head, 3, col, frame);
      before(head, 3, col, frame);
    }
    for (const col of [1, 2, 5, 6]) {
      front(head, 4, col, lens);
      before(head, 4, col, col === 1 || col === 5 ? hexOf("ink") : lens);
    }
    for (let z = 3; z <= HEAD; z++) {
      head.set(-1, M - 3, z, frame);
      head.set(HEAD, M - 3, z, frame);
    }
  },
  // Monocle: a gold ring round the right eye, a chain down the cheek.
  (head) => {
    const gold = hexOf("gold");
    for (const [row, col] of [
      [3, 5],
      [3, 6],
      [5, 5],
      [5, 6],
      [4, 4],
      [4, 7],
    ] as const) {
      front(head, row, col, gold);
      before(head, row, col, gold);
    }
    front(head, 6, M, hexOf("amber"));
    front(head, 7, M, hexOf("amber"));
  },
  // Eyepatch: over the left eye, its strap round the head.
  (head) => {
    const patch = hexOf("coal");
    for (const row of [3, 4, 5]) for (const col of [1, 2]) front(head, row, col, patch);
    for (const col of [1, 2]) before(head, 4, col, patch);
    for (let col = 3; col <= M; col++) front(head, col < 5 ? 3 : 2, col, patch);
    for (let z = 0; z <= M; z++) {
      head.set(0, M - 3, z, patch);
      head.set(M, M - 2, z, patch);
    }
    for (let x = 0; x <= M; x++) head.set(x, M - 2 - (x > 3 ? 0 : 1), 0, patch);
  },
  // Scar: across the right brow and cheek.
  (head, t) => {
    const scar = mix(t.skin, hexOf("wine"), 0.6);
    for (const [row, col] of [
      [2, 6],
      [3, 6],
      [5, 5],
      [6, 5],
    ] as const)
      front(head, row, col, scar);
  },
  // War paint: two stripes on each cheek and one on the brow.
  (head) => {
    const paint = hexOf("sky");
    for (const row of [5, 6]) for (const col of [0, 1]) pair(head, row, col, row === 5 ? paint : hexOf("navy"));
    frontRow(head, 2, 3, 4, hexOf("brick"));
  },
  // Freckles.
  (head, t) => {
    const dot = shade(t.skin, 0.74);
    for (const [row, col] of [
      [5, 1],
      [5, 6],
      [6, 0],
      [6, 7],
      [5, 0],
    ] as const)
      front(head, row, col, dot);
  },
];

/** Removes every voxel above the head's top: a hat replaces the hair's volume there. */
function clearAbove(head: VoxelHead) {
  for (const [x, y, z] of [...head.voxels()]) if (y > M) head.delete(x, y, z);
}

/** The highest voxel over the head's middle, for a crown to sit on. */
function topOf(head: VoxelHead): number {
  let top = M;
  for (const [x, y, z] of head.voxels()) if (x >= 0 && x <= M && z >= 0 && z <= M && y > top && y <= HEAD) top = y;
  return top;
}

/** A ring of voxels round the head at height `y`, `out` voxels out from its cube (0: on its edge). */
function ring(head: VoxelHead, y: number, out: number, hex: (x: number, z: number) => number) {
  for (let x = -out; x <= M + out; x++) {
    for (let z = -out; z <= M + out; z++) {
      if (x === -out || x === M + out || z === -out || z === M + out) head.set(x, y, z, hex(x, z));
    }
  }
}

/** Paints the head's top and its side rows down to `rows`, as a hat seen through the grid look. */
function cover(head: VoxelHead, rows: number, hex: number) {
  for (let x = 0; x <= M; x++) for (let z = 0; z <= M; z++) head.set(x, M, z, hex);
  for (let row = 0; row < rows; row++) {
    for (let i = 0; i <= M; i++) {
      head.set(i, M - row, M, hex);
      head.set(i, M - row, 0, hex);
      head.set(0, M - row, i, hex);
      head.set(M, M - row, i, hex);
    }
  }
}

const HEADWEAR: readonly ((head: VoxelHead, t: Tones) => void)[] = [
  () => {},
  // Cap: a worker's cap with a peak.
  (head) => {
    const cloth = hexOf("brick");
    const dark = shade(cloth, 0.78);
    clearAbove(head);
    cover(head, 2, cloth);
    topLayer(head, HEAD, (x, z) => (x === 3 || x === 4 ? dark : cloth));
    for (let x = 0; x <= M; x++) for (const z of [HEAD, HEAD + 1, HEAD + 2]) head.set(x, M - 1, z, z === HEAD + 2 ? shade(dark, 0.9) : dark);
  },
  // Straw hat: a wide brim and a band.
  (head) => {
    const straw = hexOf("straw");
    const light = hexOf("gold");
    clearAbove(head);
    cover(head, 1, straw);
    for (let x = -2; x <= HEAD + 1; x++) for (let z = -2; z <= HEAD + 1; z++) head.set(x, HEAD, z, (x + z) % 2 ? straw : light);
    for (const y of [HEAD + 1, HEAD + 2]) topLayer(head, y, (x, z) => ((x + z) % 2 ? light : straw), () => true, 1, M - 1);
    ring(head, HEAD + 1, -1, () => hexOf("brick"));
  },
  // Hood: cloth over the top, the sides and the back, the face in its opening.
  (head) => {
    const cloth = hexOf("pine");
    const fold = shade(cloth, 0.8);
    clearAbove(head);
    for (let x = -1; x <= HEAD; x++) {
      for (let z = -1; z <= HEAD; z++) {
        head.set(x, HEAD, z, (x + z) % 4 ? cloth : fold);
        if (z === -1) for (let y = -1; y <= M; y++) head.set(x, y, z, (x + y) % 4 ? cloth : fold);
      }
    }
    for (let z = -1; z <= HEAD; z++) {
      for (let y = -1; y <= M; y++) {
        head.set(-1, y, z, (y + z) % 4 ? cloth : fold);
        head.set(HEAD, y, z, (y + z) % 4 ? cloth : fold);
      }
    }
    for (let x = -1; x <= HEAD; x++) head.set(x, M, HEAD, fold);
    for (const x of [3, 4]) head.set(x, HEAD + 1, -1, fold);
    cover(head, 1, cloth);
    for (let row = 1; row <= M; row++) {
      front(head, row, 0, cloth);
      front(head, row, M, cloth);
    }
  },
  // Helmet: iron, a brow band and a nose guard.
  (head) => {
    const iron = hexOf("iron");
    const steel = hexOf("steel");
    clearAbove(head);
    cover(head, 2, iron);
    topLayer(head, HEAD, (x, z) => ((x === 3 || x === 4) && z % 2 === 0 ? steel : iron), () => true, -1, HEAD);
    for (let y = 3; y <= M; y++) {
      for (let z = -1; z <= HEAD; z++) {
        head.set(-1, y, z, y === 5 ? steel : iron);
        head.set(HEAD, y, z, y === 5 ? steel : iron);
      }
      for (let x = -1; x <= HEAD; x++) head.set(x, y, -1, y === 5 ? steel : iron);
    }
    for (let x = -1; x <= HEAD; x++) head.set(x, M - 1, HEAD, x % 3 === 0 ? steel : iron);
    for (let x = -1; x <= HEAD; x++) head.set(x, M, HEAD, iron);
    for (let row = 2; row <= 5; row++) for (const col of [3, 4]) before(head, row, col, row === 2 ? iron : steel);
  },
  // Horned helm: a helmet with two horns.
  (head) => {
    const iron = hexOf("slate");
    const horn = hexOf("ash");
    const tip = shade(horn, 1.12);
    clearAbove(head);
    cover(head, 2, iron);
    topLayer(head, HEAD, (x, z) => ((x + z) % 4 === 0 ? hexOf("iron") : iron), () => true, 0, M);
    ring(head, M - 1, 1, (x, z) => ((x + z) % 2 ? hexOf("gold") : hexOf("amber")));
    for (const z of [3, 4]) {
      for (const [dx, y, hex] of [
        [1, M - 1, horn],
        [2, M, horn],
        [3, HEAD, horn],
        [3, HEAD + 1, horn],
        [3, HEAD + 2, tip],
        [2, HEAD + 3, tip],
      ] as const) {
        head.set(-dx, y, z, hex);
        head.set(M + dx, y, z, hex);
      }
    }
  },
  // Crown: gold, with points and gems, sitting on the hair.
  (head) => {
    const gold = hexOf("gold");
    const deep = hexOf("amber");
    const base = topOf(head) + 1;
    ring(head, base, 0, (x, z) => ((x + z) % 2 ? gold : deep));
    ring(head, base + 1, 0, () => gold);
    for (let i = 0; i <= M; i += 1) {
      if (i % 7 === 0 || i === 3 || i === 4) {
        head.set(i, base + 2, 0, gold);
        head.set(i, base + 2, M, gold);
        head.set(0, base + 2, i, gold);
        head.set(M, base + 2, i, gold);
      }
    }
    head.set(3, base + 1, M, hexOf("ruby"));
    head.set(4, base + 1, M, hexOf("ruby"));
    head.set(M, base + 1, 3, hexOf("shallows"));
    head.set(0, base + 1, 4, hexOf("shallows"));
    if (base === HEAD) for (let x = 0; x <= M; x++) head.set(x, M, M, deep);
  },
  // Wizard hat: a tall cone with gold stars, its tip bent back.
  (head) => {
    const cloth = hexOf("violet");
    const dark = hexOf("plum");
    const star = hexOf("gold");
    clearAbove(head);
    cover(head, 1, cloth);
    for (let x = -1; x <= HEAD; x++) for (let z = -1; z <= HEAD; z++) head.set(x, HEAD, z, dark);
    const tiers: [number, number][] = [
      [0, 2],
      [1, 2],
      [2, 2],
      [3, 1],
    ];
    let y = HEAD + 1;
    for (const [inset, tall] of tiers) {
      for (let k = 0; k < tall; k++, y++) topLayer(head, y, (x, z) => ((x * 7 + z * 3 + y) % 11 === 0 ? star : cloth), () => true, inset, M - inset);
    }
    head.set(3, y, 2, cloth);
    head.set(4, y, 2, cloth);
    head.set(3, y + 1, 1, dark);
    head.set(3, y + 1, 0, star);
    ring(head, HEAD + 1, 0, () => star);
  },
];

/** `a` towards `b` by `t` (0: a, 1: b), channel by channel in sRGB. */
export function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** How many variants each painted part has: the format's lists must match them (a test checks it). */
export const PAINTED_VARIANTS = {
  skin: SKINS.length,
  hairColour: HAIR_COLOURS.length,
  eyes: EYES.length,
  eyebrows: EYEBROWS.length,
  mouth: MOUTHS.length,
  hair: HAIRS.length,
  beard: BEARDS.length,
  headwear: HEADWEAR.length,
  accessory: ACCESSORIES.length,
};

/** The head of an avatar: the skin, then each part in turn (the hat last, over the hair). Pure: the same avatar, the same voxels. */
export function buildHead(avatar: Avatar): VoxelHead {
  const skin = hexOf(SKINS[avatar.skin] ?? SKINS[0]);
  const hair = hexOf(HAIR_COLOURS[avatar.hairColour] ?? HAIR_COLOURS[0]);
  const tones: Tones = { skin, skinShade: shade(skin, 0.86), lip: shade(skin, 0.55), hair, hairShade: shade(hair, 0.78) };
  const head = new VoxelHead();
  for (let x = 0; x < HEAD; x++) for (let y = 0; y < HEAD; y++) for (let z = 0; z < HEAD; z++) head.set(x, y, z, skin);
  // The ears.
  for (const z of [3, 4]) {
    head.set(-1, 3, z, tones.skinShade);
    head.set(HEAD, 3, z, tones.skinShade);
  }
  (HAIRS[avatar.hair] ?? HAIRS[0])(head, tones);
  (EYES[avatar.eyes] ?? EYES[0])(head, tones);
  (EYEBROWS[avatar.eyebrows] ?? EYEBROWS[0])(head, tones);
  (MOUTHS[avatar.mouth] ?? MOUTHS[0])(head, tones);
  (BEARDS[avatar.beard] ?? BEARDS[0])(head, tones);
  (ACCESSORIES[avatar.accessory] ?? ACCESSORIES[0])(head, tones);
  (HEADWEAR[avatar.headwear] ?? HEADWEAR[0])(head, tones);
  return head;
}

/** The six faces of the head's cube, in three's `BoxGeometry` order (+x, -x, +y, -y, +z, -z). */
export const FACES = ["right", "left", "top", "bottom", "front", "back"] as const;
export type Face = (typeof FACES)[number];

/**
 * The voxel behind each pixel of a face's 8 x 8 grid, `col` from the left and `row` from the top of the face as three's
 * `BoxGeometry` maps a texture onto it (top: the back at the top; bottom: the front at the top). `depth` 0 is the head's
 * surface; 1 and more are the voxels standing out of it, outwards.
 */
export function faceVoxel(face: Face, col: number, row: number, depth: number): [number, number, number] {
  switch (face) {
    case "front":
      return [col, M - row, M + depth];
    case "back":
      return [M - col, M - row, -depth];
    case "right":
      return [M + depth, M - row, M - col];
    case "left":
      return [-depth, M - row, col];
    case "top":
      return [col, M + depth, row];
    case "bottom":
      return [col, -depth, M - row];
  }
}

/** How far out of the head the grid look's outer layer looks for a voxel to show. */
const MAX_DEPTH = 12;

/**
 * The grid look's two layers of one face, 8 x 8 colours each in rows from the top: the surface (every pixel), and the
 * outermost voxel standing out of each pixel (`undefined` where none), which the slightly larger cube shows.
 */
export function faceGrids(head: VoxelHead, face: Face): { surface: number[]; outer: (number | undefined)[] } {
  const surface: number[] = [];
  const outer: (number | undefined)[] = [];
  for (let row = 0; row < HEAD; row++) {
    for (let col = 0; col < HEAD; col++) {
      surface.push(head.get(...faceVoxel(face, col, row, 0)) ?? 0);
      let found: number | undefined;
      for (let depth = MAX_DEPTH; depth >= 1 && found === undefined; depth--) found = head.get(...faceVoxel(face, col, row, depth));
      outer.push(found);
    }
  }
  return { surface, outer };
}
