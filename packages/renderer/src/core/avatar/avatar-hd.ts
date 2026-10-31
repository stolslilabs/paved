import { VoxelHead } from "./avatar-model";

/**
 * AVATAR-LIVING (exploration): an HD bust, the head 16 voxels on a side (twice the catalogue's), drawn after the Codex render
 * target's king and Codex's critique of the first renders: large calm eyes (an ivory white, a dark pupil), brows staggered a
 * voxel, a nose a voxel out, a light mouth framed by the moustache, a beard tapered to the chin, locks of hair at the temples, a
 * crown of five tall points with a ruby set in a raised socket, small sloped pauldrons over dark sleeves, a teal-blue tunic with
 * a strap and a buckle. Each material is a ramp of tones: skin barely varies (a few percent), cloth, hair and gold vary in broad
 * patches (two voxels wide), never in a checker.
 */
export const HD = 16;
const M = HD - 1;

type Ramp = readonly number[];
const RAMPS = {
  skin: [0xf2ad6c, 0xeaa15f, 0xe39858],
  skinShade: [0xc77a45, 0xbd713d],
  blush: [0xf0a27a, 0xeb9a72],
  lip: [0xefa569, 0xe89a5e],
  mouth: [0x5a2418, 0x4a1d14],
  teeth: [0xfff3df, 0xf4e8d2],
  hair: [0x643a24, 0x55311f, 0x49291b, 0x3d2218],
  hairDark: [0x321e17],
  white: [0xfffaf0, 0xf6f1e6],
  pupil: [0x241810],
  gold: [0xffe080, 0xf2c14a, 0xe9a72d, 0xd8962a, 0xc0822a],
  goldDark: [0xa96f22, 0x96611d],
  ruby: [0xf04a29, 0xce261c, 0xa81d15, 0x85150f],
  cloth: [0x4d86de, 0x4179d2, 0x376cc2, 0x2e60b0, 0x27549c],
  sleeve: [0x2e3a45, 0x28333d, 0x232c35],
  trim: [0xf2c14a, 0xe2ad3a],
  leather: [0x8a5a34, 0x7a4c2b, 0x6b4124, 0x5c371e],
  rivet: [0xfff0b8],
} as const satisfies Record<string, Ramp>;
type Material = keyof typeof RAMPS;

/** Materials that vary in patches two voxels wide (cloth, hair, metal); the others voxel by voxel (skin barely varies). */
const PATCHED = new Set<Material>(["hair", "hairDark", "cloth", "sleeve", "gold", "leather"]);

const hash = (x: number, y: number, z: number, salt = 0) => {
  let h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (salt * 2654435761);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** A voxel set painted by materials: `put` picks the material's tone for the place (`bias` > 0 leans light, < 0 dark). */
class Painter {
  readonly cells = new VoxelHead();
  put(x: number, y: number, z: number, material: Material, bias = 0) {
    const ramp: Ramp = RAMPS[material];
    const patch = PATCHED.has(material);
    const h = patch ? hash(Math.floor(x / 2), Math.floor(y / 2), Math.floor(z / 2), material.length) : hash(x, y, z, material.length);
    // Near the ramp's middle, a tone or so off it: a painted surface, not noise.
    const t = Math.min(0.999, Math.max(0, 0.5 + (h - 0.5) * (patch ? 0.35 : 0.3) - bias * 0.35));
    this.cells.set(x, y, z, ramp[Math.floor(t * ramp.length)]!);
  }
  clear(x: number, y: number, z: number) {
    this.cells.delete(x, y, z);
  }
}

/** What the mouth shows: closed (a calm smile), a grin (teeth), open (a cheer), a frown. */
export type HdMouth = "closed" | "grin" | "open" | "frown";

/** A colour that reads as hair (a dark warm brown): such pixels of a painted face stand a voxel out (fringe, brows, beard). */
const hairLike = (hex: number) => {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return r < 150 && g < 105 && b < 80 && r >= g && g >= b;
};

/**
 * The king's head, 16 voxels on a side: x to the right of a viewer facing it, y up, z towards the viewer (the face at z = 15).
 * `face`, 16 x 16 colours in rows from the top, replaces the drawn face's front plane (a painted face: Codex's pixel art), its
 * hair-coloured pixels standing a voxel out.
 */
export function kingHead(mouth: HdMouth = "closed", face?: readonly number[]): VoxelHead {
  const p = new Painter();
  // The skull: skin, a shade under the jaw and at the back.
  for (let x = 0; x <= M; x++) for (let y = 0; y <= M; y++) for (let z = 0; z <= M; z++) p.put(x, y, z, "skin", (y - 8) / 24 + (z - 8) / 40);
  // Warm cheeks.
  for (const x of [2, 3, 12, 13]) for (const y of [7, 8]) p.put(x, y, M, "blush");
  // The eyes: ivory, three by three, a dark pupil one wide and two high, inside and low (the gaze to the viewer).
  for (const [x0, pupil] of [
    [3, 5],
    [10, 10],
  ] as const) {
    for (let x = x0; x <= x0 + 2; x++) for (const y of [9, 10, 11]) p.put(x, y, M, x === pupil && y <= 10 ? "pupil" : "white");
  }
  // The brows: three by one over each eye, the viewer-left one a voxel higher (a raised brow), out of the brow ridge.
  for (const [x0, y] of [
    [3, 13],
    [10, 12],
  ] as const) {
    for (let x = x0; x <= x0 + 2; x++) {
      p.put(x, y, M, "hairDark");
      p.put(x, y, M + 1, "hairDark");
    }
  }
  // The nose: a voxel out, two wide, two high; its shade under it.
  for (const x of [7, 8]) {
    p.put(x, 7, M + 1, "skin", 0.25);
    p.put(x, 6, M, "skinShade");
  }
  // The hair: a cap over the top, thick at the back and the sides, a fringe out of the forehead.
  for (let x = -1; x <= HD; x++) {
    for (let z = -1; z <= HD; z++) {
      p.put(x, HD, z, "hair", 0.25);
      if (hash(Math.floor(x / 2), 0, Math.floor(z / 2), 7) > 0.5) p.put(x, HD + 1, z, "hair", 0.35);
    }
  }
  // The back down to the nape, the sides down to the ears (a square head, as the target's).
  for (let y = 5; y <= M; y++) {
    for (let x = -1; x <= HD; x++) for (const z of [-1, 0]) p.put(x, y, z, "hair", (y - 10) / 20);
    for (let z = -1; z <= 14; z++) for (const x of [-1, HD]) if ((y >= 9 && (z <= 9 || y >= 11)) || z <= 3) p.put(x, y, z, "hair", (y - 10) / 20);
  }
  // The fringe in three broad steps over the brows, and one lock down beside the viewer-left eye.
  for (let x = 0; x <= M; x++) {
    const low = x <= 2 ? 14 : x <= 6 ? 15 : x <= 9 ? 14 : 13;
    for (let y = low; y <= M; y++) {
      p.put(x, y, M + 1, "hair", 0.1 + (y - 14) * 0.1);
      p.put(x, y, M, "hair");
    }
  }
  for (const x of [0, 1]) {
    for (let y = 9; y <= 13; y++) {
      p.put(x, y, M + 1, "hair", (y - 12) / 14);
      p.put(x, y, M, "hair");
    }
  }
  // Sideburns, down into the beard.
  for (let y = 4; y <= 10; y++) for (const x of [-1, HD]) for (let z = 8; z <= M; z++) p.put(x, y, z, "hairDark", 0.3);
  // The ears.
  for (const y of [7, 8]) for (const z of [6, 7]) for (const x of [-1, HD]) p.put(x, y, z, "skinShade");
  // The beard: over the jaw and the chin, a voxel out, tapered a voxel a side at the chin, stepped down in the middle.
  for (let y = -1; y <= 5; y++) {
    const [x0, x1] = y === -1 ? [5, 10] : y === 0 ? [2, 13] : y === 1 ? [1, 14] : [0, 15];
    for (let x = x0; x <= x1; x++) {
      if (y >= 4 && x >= 3 && x <= 12) continue;
      const side = x <= 1 || x >= 14;
      for (let z = side ? 7 : 12; z <= M + 1; z++) p.put(x, y, z, "hair", (y - 2) / 14);
    }
  }
  // The moustache: a mass six by two over the mouth.
  for (let x = 5; x <= 10; x++) {
    for (const y of [4, 5]) {
      p.put(x, y, M, "hair", -0.3);
      p.put(x, y, M + 1, "hair", y === 5 ? 0.1 : -0.2);
    }
  }
  if (face) {
    const luma = (hex: number) => 0.3 * ((hex >> 16) & 255) + 0.59 * ((hex >> 8) & 255) + 0.11 * (hex & 255);
    for (let x = 0; x <= M; x++) {
      for (let y = 0; y <= M; y++) {
        for (const z of [M + 1, M + 2]) p.clear(x, y, z);
        let hex = face[(M - y) * HD + x]!;
        const row = M - y;
        // The fringe (the top rows) in two tones, so it reads as large locks, not noise.
        if (row <= 3 && hairLike(hex)) hex = luma(hex) > 60 ? 0x6e4128 : 0x4a2a1a;
        // The eyes (their whites and their pupils, in the eyes' rows) a voxel into the head: the sockets shade them.
        const eye = row >= 5 && row <= 9 && (luma(hex) > 200 || luma(hex) < 45);
        if (eye) {
          p.clear(x, y, M);
          p.cells.set(x, y, M - 1, hex);
          continue;
        }
        p.cells.set(x, y, M, hex);
        if (hairLike(hex)) {
          p.cells.set(x, y, M + 1, hex);
          // The brows and the beard's lower rows a second voxel out.
          if ((row >= 4 && row <= 6) || row >= 13) p.cells.set(x, y, M + 2, hex);
        }
      }
    }
    if (mouth === "closed") return crown(p);
  }
  // The mouth, cut into the beard between the moustache's corners.
  const cells: [number, number, Material][] = [];
  if (mouth === "closed") for (let x = 6; x <= 8; x++) cells.push([x, 3, "lip"]);
  if (mouth === "grin") for (let x = 6; x <= 9; x++) cells.push([x, 3, "teeth"], [x, 2, "lip"]);
  if (mouth === "open") for (let x = 6; x <= 9; x++) cells.push([x, 3, "teeth"], [x, 2, "mouth"], [x, 1, "mouth"]);
  if (mouth === "frown") for (let x = 6; x <= 9; x++) cells.push([x, x === 6 || x === 9 ? 2 : 3, "lip"]);
  for (const [x, y, material] of cells) {
    p.clear(x, y, M + 1);
    p.put(x, y, M, material);
  }
  return crown(p);
}

/** The crown on the hair, added to the head `p` paints. */
function crown(p: Painter): VoxelHead {
  // The crown on the hair: a band three high round the cap (no overhang in front); five broad points across the front, the
  // middle one four above the band, the next three, the outer two; low points behind and at the sides; a ruby two by three a
  // voxel out of a gold socket.
  const band = (x: number, z: number) => x === -1 || x === HD || z === -1 || z === HD;
  for (let x = -1; x <= HD; x++) {
    for (let z = -1; z <= HD; z++) {
      if (!band(x, z)) continue;
      for (let y = HD + 1; y <= HD + 3; y++) p.put(x, y, z, y === HD + 1 ? "goldDark" : "gold", (y - HD - 2) * 0.35);
    }
  }
  const point = (a0: number, a1: number, at: number, tall: number, side = false) => {
    for (let k = 0; k < tall; k++) {
      const y = HD + 4 + k;
      const inset = k === tall - 1 && a1 - a0 >= 2 ? 1 : 0;
      for (let a = a0 + inset; a <= a1 - inset; a++) p.put(side ? at : a, y, side ? a : at, "gold", 0.15 + k * 0.15);
    }
  };
  point(-1, 1, HD, 2);
  point(3, 5, HD, 3);
  point(6, 9, HD, 4);
  point(10, 12, HD, 3);
  point(14, 16, HD, 2);
  for (const a0 of [-1, 6, 15]) point(a0, a0 + 1, -1, 1);
  point(6, 9, -1, 1, true);
  point(6, 9, HD, 1, true);
  // The socket and the ruby, a voxel out of the band: the stone lit at its top, deep on its shaded side.
  for (let x = 6; x <= 9; x++) for (let y = HD + 1; y <= HD + 5; y++) p.put(x, y, HD + 1, "goldDark", 0.2);
  for (const x of [7, 8]) {
    for (let y = HD + 2; y <= HD + 4; y++) {
      p.clear(x, y, HD + 1);
      p.put(x, y, HD + 1, "ruby", y === HD + 4 ? 1 : x === 8 ? -1 : 0);
      p.put(x, y, HD + 2, "ruby", y === HD + 4 ? 1 : x === 8 ? -1 : 0);
    }
  }
  // Small rubies at the sides of the band.
  for (const x of [-2, HD + 1]) for (const z of [7, 8]) p.put(x, HD + 2, z, "ruby", z === 7 ? 0.3 : -0.3);
  return p.cells;
}

/** The torso, 16 wide, 24 high and 8 deep under the head (z 4..11): the tunic, its collar, the strap and its buckle, the belt. */
export function kingTorso(): VoxelHead {
  const p = new Painter();
  for (let x = 0; x <= M; x++) {
    for (let y = -24; y <= -1; y++) for (let z = 4; z <= 11; z++) p.put(x, y, z, "cloth", (y + 10) / 30);
  }
  // The neck's opening and its gold collar.
  for (let y = -3; y <= -1; y++) for (let x = 7 - (y === -3 ? 0 : 1); x <= 8 + (y === -3 ? 0 : 1); x++) p.put(x, y, 11, "skin", 0.1);
  for (const [x, y] of [
    [5, -1],
    [10, -1],
    [5, -2],
    [10, -2],
    [6, -3],
    [9, -3],
    [7, -4],
    [8, -4],
  ] as const)
    p.put(x, y, 11, "trim");
  // The strap, three voxels wide, from the viewer's right shoulder to the left hip, out of the cloth; its buckle on the chest.
  for (let y = -1; y >= -22; y--) {
    const x = Math.round(14 - (-1 - y) * 0.62);
    for (const dx of [-2, -1, 0, 1]) {
      if (x + dx < 0 || x + dx > M) continue;
      p.put(x + dx, y, 12, "leather", dx === -2 ? 0.3 : dx === 1 ? -0.3 : 0);
      p.put(x + dx, y, 3, "leather");
    }
  }
  // A large square buckle: a gold frame six wide, its middle leather, a voxel proud of the strap.
  for (let x = 6; x <= 11; x++) {
    for (let y = -11; y <= -6; y++) {
      const frame = x === 6 || x === 11 || y === -11 || y === -6;
      p.put(x, y, 13, frame ? "trim" : "leather", frame ? (y + 8) * 0.15 : 0.3);
    }
  }
  // The belt.
  for (let x = 0; x <= M; x++) for (const y of [-20, -19]) for (const z of [3, 12]) p.put(x, y, z, "leather", y === -19 ? 0.2 : -0.1);
  return p.cells;
}

/** The arms' width: six voxels, narrower than Minecraft's eight, so the shoulders stay in proportion with the head. */
export const ARM_W = 6;

/** An arm (x from `x0`, `ARM_W` wide): a dark sleeve, a gold cuff, the hand; a small pauldron sloping out over the shoulder. */
export function kingArm(x0: number, outward: 1 | -1): VoxelHead {
  const p = new Painter();
  for (let x = x0; x < x0 + ARM_W; x++) {
    for (let y = -24; y <= -1; y++) {
      for (let z = 4; z <= 11; z++) {
        const material: Material = y >= -14 ? "sleeve" : y >= -16 ? "trim" : "skin";
        p.put(x, y, z, material, material === "sleeve" ? (y + 8) / 24 : 0);
      }
    }
  }
  // The pauldron: a contiguous gold cap over the shoulder (the arm's width and a voxel out, three high, a voxel proud front and
  // back), its outer edge dropping two voxels more.
  const inner = outward === -1 ? x0 + ARM_W - 1 : x0;
  for (let k = 0; k <= ARM_W; k++) {
    const x = inner + outward * k;
    const bottom = k === ARM_W ? -4 : -2;
    for (let y = bottom; y <= 0; y++) {
      // Stepped: the top plate a voxel proud front and back, the rows under it flush with the arm.
      const [z0, z1] = y === 0 ? [3, 12] : [4, 11];
      for (let z = z0; z <= z1; z++) {
        const rim = z === z0 || z === z1 || k === ARM_W;
        p.put(x, y, z, y === bottom ? "goldDark" : "gold", y === 0 ? 0.45 : rim ? -0.3 : -0.05);
      }
    }
  }
  for (const z of [5, 10]) p.put(inner + outward * (ARM_W + 1), -2, z, "rivet");
  return p.cells;
}

/** The HD bust: the head (its face painted by `face` if given), the torso, the right arm (on the viewer's left) and the left one. */
export function kingBust(mouth: HdMouth = "closed", face?: readonly number[]) {
  return { head: kingHead(mouth, face), torso: kingTorso(), armRight: kingArm(-ARM_W, -1), armLeft: kingArm(HD, 1) };
}
