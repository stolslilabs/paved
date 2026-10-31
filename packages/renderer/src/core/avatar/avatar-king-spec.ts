import type { Cuboid } from "./avatar-boxes";

/**
 * AVATAR-LIVING (exploration, v5): the king's head as the target builds it, measured on the target rectified straight on (an
 * affine fit of its turned, tilted face, by the exploration's scripts, not committed), in head units: u across the face from
 * its left edge (the viewer's), w along the left side from the back of the head, v down from the head's top. Every element is a
 * block of its own, with its own tone (the target's, sampled), standing out of the head by its measured relief, so each reads as
 * a distinct block as in the target: on the face 11 hair blocks (a row of 8 and 3 hanging), two brows, the nose, the moustache,
 * the beard's blocks; the eyes and the mouth flat, painted on the face.
 */

/** The target's tones, sampled from it. */
export const T = {
  skin: [0xfdb56a, 0xfdbc75, 0xfcb26a, 0xfdc07c],
  skinShade: 0xfca35c,
  nose: 0xfdaf69,
  hair: [0x713723, 0x592b1b, 0x6b3420, 0x602c1b, 0x7a3a22, 0x4f2516, 0x66311e, 0x5a2a19],
  brow: 0x5d2d1d,
  // Painted a little brighter than the target's rendered white (#fde8c9): the light takes about a tenth off.
  eyeWhite: 0xfff6e0,
  pupil: 0x46271e,
  moustache: 0x7a3c24,
  // Brighter than the target's rendered mouth (#fcab64): it sits recessed under the moustache, in its shade.
  mouth: 0xffbf78,
  // The forehead under the fringe, in its shade as the target paints it (#f19152 rendered).
  forehead: 0xf9a05e,
  mouthDeep: 0x5c2418,
  teeth: 0xfff6e8,
  beard: [0x6b321f, 0x763921, 0x622f1d, 0x803f25, 0x6d341f],
  // Each fringe block's tone the target's own block's (sampled cell by cell on the rectified target).
  fringe: [0x733822, 0x572a1b, 0x874026, 0x9f4d2b, 0x622e1c, 0x602c1c, 0x994a2b, 0x994a2a],
  // The beard along the jaw, in the jaw's shade: darker than the face's beard, as the target's.
  jaw: [0x3f1d12, 0x64301e, 0x3a1a10],
} as const;

/** A head's tones: the king's (`T`), or a trait's (`avatar-traits.ts` moves each family to its own). */
export interface HeadPalette {
  skin: readonly number[];
  skinShade: number;
  nose: number;
  hair: readonly number[];
  brow: number;
  eyeWhite: number;
  pupil: number;
  moustache: number;
  mouth: number;
  forehead: number;
  mouthDeep: number;
  teeth: number;
  beard: readonly number[];
  fringe: readonly number[];
  jaw: readonly number[];
}

const pick = (tones: readonly number[], i: number) => tones[i % tones.length]!;
const named = (name: string, box: Cuboid): Cuboid => ({ ...box, name });

/** How far the hair and the beard stand out of the head's sides, and of the face at its edges: one depth, so the corners meet. */
export const EDGE_OUT = 0.3;

/**
 * A block on the face (z = 8): u from `u0` to `u1`, v from `v0` to `v1`, standing out `out`, its back a little inside the head. At
 * the face's edges (u 0, u 8) it runs on over the side by `EDGE_OUT`, at that depth, so it wraps the corner and meets the side's
 * blocks there (no notch at the head's edges).
 */
const onFace = (u0: number, u1: number, v0: number, v1: number, out: number, colour: number): Cuboid => {
  const a = u0 <= 0 ? -EDGE_OUT : u0;
  const b = u1 >= 8 ? 8 + EDGE_OUT : u1;
  const d = u0 <= 0 || u1 >= 8 ? EDGE_OUT : out;
  return { from: [a, 8 - v1, 7.9], size: [b - a, v1 - v0, 0.1 + d], colour };
};

/**
 * A block on the left side (x = 0): w from `w0` to `w1` (from the back), v from `v0` to `v1`, standing out `EDGE_OUT`. It stops
 * flush with the face (z 8), where the face's corner blocks take over, and runs back over the back's edge (w 0) by `EDGE_OUT`.
 */
const onSide = (w0: number, w1: number, v0: number, v1: number, _out: number, colour: number): Cuboid => {
  const a = w0 <= 0 ? -EDGE_OUT : w0;
  // To 7.9, where the face's blocks begin: the two never lie side by side in one plane (they would fight for the pixels).
  return { from: [-EDGE_OUT, 8 - v1, a], size: [0.1 + EDGE_OUT, v1 - v0, Math.min(w1, 7.9) - a], colour };
};

/**
 * The face's hair, as measured on the target: the fringe's row of 8 one-unit blocks (v 0 to 1.2, their lower edges uneven), 3
 * blocks hanging under it at u 0, 3 and 7. Relief about 0.3. Named `hair/fringe-i`, `hair/lock-i`.
 */
export function fringeBlocks(p: HeadPalette = T): Cuboid[] {
  const bottoms = [1.25, 1.15, 1.2, 1.25, 1.2, 1.15, 1.2, 1.25];
  const out = [0.34, 0.28, 0.31, 0.36, 0.29, 0.32, 0.27, 0.35];
  return [
    ...bottoms.map((b, i) => named(`hair/fringe-${i}`, onFace(i, i + 1, -0.05, b, out[i]!, p.fringe[i]!))),
    named("hair/lock-0", onFace(0, 1, 1.2, 2.15, 0.3, pick(p.hair, 5))),
    named("hair/lock-1", onFace(3, 4, 1.2, 2.1, 0.33, pick(p.hair, 1))),
    named("hair/lock-2", onFace(7, 8, 1.2, 2.6, 0.31, pick(p.hair, 3))),
  ];
}

/** The brows (u 1 to 3 and 5 to 7, v 2.2 to 2.75, relief 0.18), each right over its eye, and the nose (u 3.2 to 4.8, v 4 to 4.7). */
export function featureBlocks(p: HeadPalette = T): Cuboid[] {
  return [
    named("face/brow-0", onFace(1, 3, 2.2, 2.75, 0.18, p.brow)),
    named("face/brow-1", onFace(5, 7, 2.2, 2.75, 0.18, p.brow)),
    named("face/nose", onFace(3.2, 4.8, 4.0, 4.7, 0.32, p.nose)),
  ];
}

/** The moustache (u 2 to 6, v 4.7 to 5.65, relief 0.28). */
export const moustacheBlock = (p: HeadPalette = T): Cuboid => named("beard/moustache", onFace(2.0, 6.0, 4.7, 5.65, 0.28, p.moustache));

/** The full beard's face blocks: its sides beside the mouth, its row under the mouth, the chin's row of five (relief about 0.3). */
export function beardBlocks(p: HeadPalette = T): Cuboid[] {
  const beard = (i: number) => pick(p.beard, i);
  return [
    named("beard/side-0", onFace(1.0, 2.75, 5.65, 6.5, 0.3, beard(0))),
    named("beard/side-1", onFace(5.25, 7.0, 5.65, 6.5, 0.3, beard(1))),
    named("beard/under-mouth", onFace(2.75, 5.25, 6.25, 6.5, 0.26, beard(2))),
    named("beard/chin-0", onFace(0.0, 1.6, 6.5, 8.0, 0.32, beard(3))),
    named("beard/chin-1", onFace(1.6, 3.2, 6.5, 8.0, 0.29, beard(4))),
    named("beard/chin-2", onFace(3.2, 4.8, 6.5, 8.0, 0.33, beard(1))),
    named("beard/chin-3", onFace(4.8, 6.4, 6.5, 8.0, 0.29, beard(0))),
    named("beard/chin-4", onFace(6.4, 8.0, 6.5, 8.0, 0.32, beard(2))),
  ];
}

/** The face's blocks as the king has them: hair, brows and nose, moustache, beard. */
export function faceBlocks(p: HeadPalette = T): Cuboid[] {
  return [...fringeBlocks(p), ...featureBlocks(p), moustacheBlock(p), ...beardBlocks(p)];
}

/**
 * The left side's hair (the right side mirrors it), as measured: the top row continuing the fringe (v 0 to 1.2, four blocks),
 * the hair down the back half (to v 4.5 at the back, 6 a little forward), down to v 2.9 over the ear, a lock hanging to v 4.3 in
 * front of the ear, to v 3.2 at the front; a block sticking out behind. Named `hair/side-top-i`, `hair/side-i`, `hair/tuft`.
 */
export function sideHairBlocks(p: HeadPalette = T): Cuboid[] {
  const hair = (i: number) => pick(p.hair, i);
  return [
    named("hair/side-top-0", onSide(0, 2, -0.05, 1.2, 0.3, hair(2))),
    named("hair/side-top-1", onSide(2, 4, -0.05, 1.2, 0.33, hair(0))),
    named("hair/side-top-2", onSide(4, 6, -0.05, 1.2, 0.28, hair(6))),
    named("hair/side-top-3", onSide(6, 8, -0.05, 1.25, 0.32, hair(4))),
    named("hair/side-0", onSide(0, 1.05, 1.2, 4.5, 0.3, hair(5))),
    named("hair/side-1", onSide(1.05, 2.6, 1.2, 6.0, 0.34, hair(1))),
    named("hair/side-2", onSide(2.6, 4.8, 1.2, 2.9, 0.29, hair(3))),
    named("hair/side-3", onSide(4.8, 6.4, 1.2, 4.3, 0.33, hair(7))),
    named("hair/side-4", onSide(6.4, 8.0, 1.2, 3.2, 0.3, hair(2))),
    // A block of hair sticking out behind the head.
    { from: [-0.35, 8 - 2.6, -1.0], size: [1.4, 1.85, 1.05], colour: hair(5), name: "hair/tuft" },
  ];
}

/** The beard along the left jaw (the right mirrors it), from v 4.9. Named `beard/jaw-i`. */
export function jawBeardBlocks(p: HeadPalette = T): Cuboid[] {
  return [
    named("beard/jaw-0", onSide(2.6, 4.8, 4.9, 6.3, 0.3, p.jaw[0]!)),
    named("beard/jaw-1", onSide(4.8, 8.0, 5.0, 6.6, 0.32, p.jaw[1]!)),
    named("beard/jaw-2", onSide(2.6, 8.0, 6.3, 8.0, 0.3, p.jaw[2]!)),
  ];
}

/** The left side's blocks as the king has them: hair and the jaw's beard. */
export function sideBlocks(p: HeadPalette = T): Cuboid[] {
  return [...sideHairBlocks(p), ...jawBeardBlocks(p)];
}

/** The back's hair, in blocks: two rows of four, down to v 6. Named `hair/back-i`. */
export function backBlocks(p: HeadPalette = T): Cuboid[] {
  const out: Cuboid[] = [];
  for (let i = 0; i < 4; i++) {
    // (the outer ones run over the side's edges, at the sides' depth: the back's corners closed)
    const x0 = i === 0 ? -EDGE_OUT : i * 2;
    const x1 = i === 3 ? 8 + EDGE_OUT : i * 2 + 2;
    out.push({ from: [x0, 8 - 3, -EDGE_OUT], size: [x1 - x0, 3.05, 0.1 + EDGE_OUT], colour: pick(p.hair, i * 3 + 1), name: `hair/back-${i * 2}` });
    out.push({ from: [x0, 8 - 6, -EDGE_OUT + 0.02], size: [x1 - x0, 3.0, 0.08 + EDGE_OUT], colour: pick(p.hair, i * 3 + 2), name: `hair/back-${i * 2 + 1}` });
  }
  return out;
}

/**
 * The flat paint of the face, 32 x 32 (four texels a unit, rows from the top): the skin in unit tiles, the eyes (whites at u 1
 * to 2 and 6 to 7, pupils at u 2 to 3 and 5 to 6, v 2.75 to 4), the mouth (u 2.75 to 5.5, v 5.75 to 6.25), for a mouth's id.
 */
export function facePaint(mouth?: number, white?: number, p: HeadPalette = T): number[] {
  const eye = white ?? p.eyeWhite;
  const px: number[] = [];
  for (let r = 0; r < 32; r++) {
    for (let c = 0; c < 32; c++) {
      const u = (c + 0.5) / 4;
      const v = (r + 0.5) / 4;
      let hex: number = p.skin[(Math.floor(u) * 3 + Math.floor(v) * 5) % p.skin.length]!;
      if (v > 1.15 && v < 2.2) hex = p.forehead;
      if (v > 2.75 && v < 4) {
        if ((u > 1 && u < 2) || (u > 6 && u < 7)) hex = eye;
        else if ((u > 2 && u < 3) || (u > 5 && u < 6)) hex = p.pupil;
      }
      if (v > 5.75 && v < 6.25 && u > 2.75 && u < 5.25) hex = mouth === 2 ? p.teeth : mouth === 3 ? p.mouthDeep : p.mouth;
      if (mouth === 3 && v > 5.75 && v < 6.5 && u > 2.75 && u < 5.25) hex = p.mouthDeep;
      // A frown (the sad emote's): the mouth narrower, a dark line, its corners down a quarter of a unit.
      if (mouth === 5 && v > 5.75 && v < 6.25 && u > 2.75 && u < 5.25) hex = p.skin[0]!;
      if (mouth === 5 && ((v > 5.85 && v < 6.1 && u > 3.25 && u < 4.75) || (v > 6.0 && v < 6.25 && ((u > 3.0 && u < 3.3) || (u > 4.7 && u < 5.0))))) hex = p.mouthDeep;
      px.push(hex);
    }
  }
  return px;
}

/** A side's flat paint, 32 x 32, columns from the back (w 0) to the front: skin where no hair or beard block covers it. */
export function sidePaint(p: HeadPalette = T): number[] {
  const px: number[] = [];
  for (let r = 0; r < 32; r++) for (let c = 0; c < 32; c++) px.push(p.skin[(c >> 2) % 2 === (r >> 2) % 2 ? 0 : 2]!);
  return px;
}
