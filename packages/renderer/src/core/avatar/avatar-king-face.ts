import type { Cuboid } from "./avatar-boxes";

/**
 * AVATAR-LIVING (exploration, v4): the king's face and side, painted at 16 x 16 (two texels a head unit) after the target's: the
 * fringe in locks, then, square to the face and symmetric about its middle, on whole units (two texels): the brows, the eyes (a
 * white outside, the pupil inside), the moustache, the light mouth between the beard's sides, the beard along the jaw. The
 * target's head is turned and tilted, so its features slant in the picture; here they are level, and the 3D turn slants them. Each letter is a
 * tone of the target's (sampled from it); hair, brows, moustache and beard stand out of the face as cuboids (`faceRelief`).
 */
export const FRONT = [
  "HHHHHHHHHHHHHHHH",
  "HHHHHHHHHHHHHHHH",
  "HHHSSSSHHHHHHHHH",
  "HHSSSSSSHSSSSHHH",
  "SSBBBBSSSSBBBBSS",
  "SSBBBBSSSSBBBBSS",
  "SSWWPPSSSSPPWWSS",
  "SSWWPPSSSSPPWWSS",
  "SSSSSSSSSSSSSSSS",
  "SSSSSSSSSSSSSSSS",
  "SSSSMMMMMMMMSSSS",
  "SSSSMMMMMMMMSSSS",
  "SSDDDDLLLLDDDDSS",
  "SSDDDDLLLLDDDDSS",
  "DDDDDDDDDDDDDDDD",
  "DDDDDDDDDDDDDDDD",
];

/** A side, its columns from the back of the head to its front (the left side; the right one mirrored). */
export const SIDE = [
  "HHHHHHHHHHHHHHHH",
  "HHHHHHHHHHHHHHHH",
  "HHHHHHHHHHHHHHHH",
  "HHHHHHHHHHHHHHHH",
  "HHHHHHHHHHHHHHHH",
  "HHHHHHHHHHHHHHHH",
  "HHHHHHHHHHHHHHHH",
  "HHHHHHHHHHHHHHHH",
  "HHHHHHHHSSSSHHSS",
  "HHHHHHHHSSSSHHSS",
  "HHHHHHHSSSSSHSDD",
  "HHHHHHHSSSSSSDDD",
  "HHHHHHHHSSSDDDDD",
  "HHHHHHHHSSDDDDDD",
  "HHHHHHHHSSDDDDDD",
  "HHHHHHHHDDDDDDDD",
];

/** The target's tones, a few each (picked by place, so the faces keep its mosaic). */
const TONES: Record<string, readonly number[]> = {
  H: [0x6d3420, 0x7a3a22, 0x854026, 0x6a3320, 0x92492a, 0x7a3a22],
  F: [0xd9884c, 0xe0925a],
  S: [0xfdba72, 0xfcb66d, 0xfdbc75, 0xfcb870],
  s: [0xf5a45e, 0xf09c58],
  B: [0x5c2d1d, 0x532a1b],
  W: [0xfde9cb],
  P: [0x2c1b17],
  M: [0x763a22, 0x7c3d25, 0x7a3c24],
  L: [0xfcab63, 0xfcae67],
  T: [0xfff6e8],
  O: [0x5c2418],
  D: [0x6d341f, 0x763921, 0x622f1d, 0x6d341f, 0x803f25],
};

/** The mouth an emote shows (the catalogue's ids: 2 grin, 3 open, 5 frown), as the grid's letters. */
export function withMouth(grid: readonly string[], mouth?: number): string[] {
  if (mouth === 2) return grid.map((row) => row.replaceAll("L", "T"));
  if (mouth === 3) return grid.map((row) => row.replaceAll("L", "O"));
  if (mouth === 5) return grid.map((row, r) => (r === 12 ? row.replaceAll("L", "D") : r === 13 ? row.replace("LLLL", "LDDL") : row));
  return [...grid];
}

/** A grid's colours, in rows from the top; `salt` varies the mosaic from one face to the next. */
export function colours(grid: readonly string[], salt = 0): number[] {
  // One tone a unit (two texels by two), picked by a hash of the unit: the target's blocks, not a checker of texels.
  const pick = (r: number, k: number, n: number) => {
    let h = Math.imul((r >> 1) * 73856093 ^ (k >> 1) * 19349663 ^ salt * 83492791, 1274126177);
    h ^= h >>> 15;
    return (h >>> 0) % n;
  };
  return grid.flatMap((row, r) => [...row].map((c, k) => TONES[c]![pick(r, k, TONES[c]!.length)]!));
}

/** How far each kind of pixel stands out of the face, in head units. */
const DEPTH: Record<string, number> = { H: 0.32, F: 0.32, B: 0.24, M: 0.3, D: 0.34 };

/**
 * The reliefs of a painted face, as the target builds them: the hair in locks (a unit wide, down to two units long, each its own
 * tone and depth), the brows, the moustache and the beard in horizontal runs of whole units (each its own depth); a unit that
 * mixes kinds keeps its texels as half-unit blocks. `front`: on the face (z = 8, columns left to right); else on the left side
 * (x = 0, columns from the back to the front), its hair only, shallower.
 */
export function faceRelief(grid: readonly string[], front: boolean, salt = 0): Cuboid[] {
  const px = colours(grid, salt);
  const boxes: Cuboid[] = [];
  const relief = (c: string) => DEPTH[c] !== undefined && (front || c === "H");
  const unitKind = (v: number, u: number) => {
    const c = grid[2 * v]![2 * u]!;
    return [grid[2 * v]![2 * u + 1], grid[2 * v + 1]![2 * u], grid[2 * v + 1]![2 * u + 1]].every((x) => x === c) ? c : null;
  };
  const depthOf = (c: string, a: number, b: number) =>
    DEPTH[c]! * (front ? 1 : 0.55) * (c === "B" || c === "M" ? 1 : 0.55 + 0.9 * (((a * 7 + b * 13 + salt) % 10) / 10));
  // Texel (row r, column k) to a box `n` texels across and `m` down, standing out by `d`.
  const box = (r: number, k: number, n: number, m: number, d: number): Cuboid => {
    const y = 8 - (r + m) * 0.5;
    const colour = px[r * 16 + k]!;
    return front
      ? { from: [k * 0.5, y, 7.95], size: [n * 0.5, m * 0.5, d + 0.05], colour }
      : { from: [-d, y, k * 0.5], size: [d + 0.05, m * 0.5, n * 0.5], colour };
  };
  const done = Array.from({ length: 8 }, () => Array<boolean>(8).fill(false));
  for (let v = 0; v < 8; v++) {
    for (let u = 0; u < 8; u++) {
      if (done[v]![u]) continue;
      const c = unitKind(v, u);
      if (c !== null && relief(c)) {
        if (c === "H") {
          // A lock: down this unit column while it is hair, at most two units.
          let len = 1;
          const most = 1 + ((u * 5 + v * 3 + salt) % 3);
          while (v + len < 8 && len < most && unitKind(v + len, u) === "H" && !done[v + len]![u]) len++;
          for (let i = 0; i < len; i++) done[v + i]![u] = true;
          boxes.push(box(2 * v, 2 * u, 2, 2 * len, depthOf(c, v, u)));
        } else {
          // A run: along this unit row while it is the same kind.
          let len = 1;
          while (u + len < 8 && (len < 2 || c === "B" || c === "M") && unitKind(v, u + len) === c && !done[v]![u + len]) len++;
          for (let i = 0; i < len; i++) done[v]![u + i] = true;
          boxes.push(box(2 * v, 2 * u, 2 * len, 2, depthOf(c, v, u)));
        }
        continue;
      }
      done[v]![u] = true;
      for (const [dr, dk] of [[0, 0], [0, 1], [1, 0], [1, 1]] as const) {
        const r = 2 * v + dr;
        const k = 2 * u + dk;
        const t = grid[r]![k]!;
        if (relief(t)) boxes.push(box(r, k, 1, 1, depthOf(t, r, k)));
      }
    }
  }
  return boxes;
}
