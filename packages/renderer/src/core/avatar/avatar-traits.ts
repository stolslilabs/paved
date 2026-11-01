import { HEAD, mirrorX, type Cuboid } from "./avatar-cuboids";
import { apart, shiftTone } from "./avatar-colour";
import { KING_BODY } from "./avatar-king-body";
import {
  backBlocks,
  beardBlocks,
  EDGE_OUT,
  facePaint,
  featureBlocks,
  fringeBlocks,
  jawBeardBlocks,
  moustacheBlock,
  sideHairBlocks,
  sidePaint,
  T,
  type HeadPalette,
} from "./avatar-king-spec";
import { KING_TRAITS, TRAIT_OPTIONS, type Traits } from "./avatar-look";

/**
 * The avatar's traits, each a layer of named cuboids or a family of tones, so one player's avatar can
 * differ from another's and every combination can be checked (`packages/renderer/__tests__/avatar-traits.test.ts`: no two faces
 * in one plane, no part through another in any emote or at the head's tracking limits, the bust in its frame, each feature
 * readable on what it sits on).
 *
 * Colours move a whole family (the skin's, the hair's, the eyes', the outfit's, the pauldrons') from the king's measured tones to
 * another base in OKLCH (`avatar-colour.ts`): a blond keeps the eight tones of the king's auburn, as far apart. Shapes are layers
 * on the head (hair, beard, headwear, accessory) and the pauldrons; a headwear names the hair blocks it covers, which go.
 */

export { KING_TRAITS, TRAIT_OPTIONS, traitsFrom, traitsText, type Traits } from "./avatar-look";

/**
 * The head's tracking limits: its turn from the shoulders' own (radians, either way) and its tilt (up negative, down positive).
 * The widest box the checks (`clearance.ts`) find clear for every combination: no part into another, the headwear inside the
 * badge's circle, eye contact (a tilt of 0.36 down, the camera below) within it. A trait that hangs below the chin narrows it.
 */
export interface TrackLimits {
  yaw: number;
  pitchMin: number;
  pitchMax: number;
}
export const TRACK_LIMITS: TrackLimits = { yaw: 0.6, pitchMin: -0.3, pitchMax: 0.4 };
/**
 * The traits' narrower limits (`key-value`), as the checks measure them: the long beard and the goatee's tip hang below the chin
 * and swing over the shoulders as the head turns, into the chest as it nods.
 */
export const NARROWER_LIMITS: Partial<Record<string, Partial<TrackLimits>>> = {
  "beard-long": { yaw: 0.4, pitchMax: 0.3 },
  "beard-goatee": { yaw: 0.5 },
};

/** The tracking limits for the traits: the widest, narrowed by each trait that needs it. */
export function trackLimits(t: Traits): TrackLimits {
  const out = { ...TRACK_LIMITS };
  for (const [key, value] of Object.entries(t)) {
    const n = NARROWER_LIMITS[`${key}-${value}`];
    if (!n) continue;
    out.yaw = Math.min(out.yaw, n.yaw ?? out.yaw);
    out.pitchMin = Math.max(out.pitchMin, n.pitchMin ?? out.pitchMin);
    out.pitchMax = Math.min(out.pitchMax, n.pitchMax ?? out.pitchMax);
  }
  return out;
}

/** The traits that change shapes (the geometric checks run over all their combinations); the others change colours only. */
export const SHAPE_TRAITS = ["hairStyle", "beard", "headwear", "accessory", "pauldrons"] as const;
export const COLOUR_TRAITS = ["skin", "hair", "eyes", "outfit"] as const;

/** Each family's base: the king's (measured), then each option's. */
const BASE = { skin: 0xfdb56a, hair: 0x66311e, eyes: 0x46271e, outfit: 0x2f78b8, pauldron: 0xdf9334 };
const SKINS: Record<Traits["skin"], number> = { peach: BASE.skin, pale: 0xffd4ad, tan: 0xd8955a, brown: 0xa4643a, deep: 0x6a3c23 };
const HAIRS: Record<Traits["hair"], number> = { auburn: BASE.hair, black: 0x2b2220, blond: 0xc9953a, ginger: 0xb04a1e, grey: 0x9a9691 };
const EYES: Record<Traits["eyes"], number> = { brown: BASE.eyes, blue: 0x2f6fd6, green: 0x2e8b45, grey: 0x5f6e7c, amber: 0xb8741e };
const OUTFITS: Record<Traits["outfit"], number> = { blue: BASE.outfit, red: 0xb8392e, green: 0x3c8f48, purple: 0x7b4bb3, black: 0x3d4049 };
// (the leather a light tan: a brown one was the strap's own, the two read as one: the checks)
const PAULDRONS: Record<Traits["pauldrons"], number> = { gold: BASE.pauldron, iron: 0xa3abb5, leather: 0xc4874a, none: BASE.pauldron };

/**
 * How far apart the hair and the skin stay (OKLab): the brows, the beard and the moustache read against the face. A hair too
 * close to a skin (auburn on a deep skin, blond on a tan one) is moved in lightness away from it (`apart`), its hue kept.
 */
const HAIR_SKIN_GAP = 0.13;

/** The king's own colours (sampled from the target) that are not the head palette's. */
export const C = {
  hair: 0x4a2618,
  skinShade: 0xe59b5c,
  gold: 0xf7b437,
  goldLight: 0xffd04e,
  goldDark: 0xd08a28,
  ruby: 0xb31d1a,
  rubyLight: 0xf04a2c,
  rubyDark: 0x7a0f0d,
  leatherDark: 0x5a2c17,
};

/** A trait's tone families: each takes one of the king's tones of that family to the trait's. */
export function families(t: Traits) {
  // (always darker: a darker brow and beard still read as such, a lighter blond went to the crown's gold)
  const hair = apart(HAIRS[t.hair], SKINS[t.skin], HAIR_SKIN_GAP, -1);
  // The helmet's steel apart from the hair under it (grey hair under a grey helmet read as one).
  const steel = apart(IRON[4]!, hair, 0.1);
  return {
    skin: (c: number) => shiftTone(c, BASE.skin, SKINS[t.skin]),
    hair: (c: number) => shiftTone(c, BASE.hair, hair),
    steel: (c: number) => shiftTone(c, IRON[4]!, steel),
    eyes: (c: number) => shiftTone(c, BASE.eyes, EYES[t.eyes]),
    outfit: (c: number) => shiftTone(c, BASE.outfit, OUTFITS[t.outfit]),
    pauldron: (c: number) => shiftTone(c, BASE.pauldron, PAULDRONS[t.pauldrons]),
  };
}

/** The head's palette for the traits: the king's `T`, each family moved. */
export function headPalette(t: Traits): HeadPalette {
  const f = families(t);
  const skin = T.skin.map(f.skin);
  return {
    ...T,
    skin,
    skinShade: f.skin(T.skinShade),
    nose: f.skin(T.nose),
    // The forehead's shade is the fringe's: a bald head has none (it read as a stripe).
    forehead: t.hairStyle === "bald" ? skin[0]! : f.skin(T.forehead),
    // The king's light mouth reads in the moustache's shade; with no moustache over it, a darker lip line.
    mouth: t.beard === "none" ? apart(f.skin(0xe0805a), skin[0]!, 0.16, -1) : f.skin(T.mouth),
    hair: T.hair.map(f.hair),
    brow: f.hair(T.brow),
    moustache: f.hair(T.moustache),
    beard: T.beard.map(f.hair),
    fringe: T.fringe.map(f.hair),
    jaw: T.jaw.map(f.hair),
    pupil: f.eyes(T.pupil),
  };
}

/** The left side's blocks and their mirror on the right (the mirror's names end in `:r`). */
const bothSides = (left: Cuboid[]): Cuboid[] => [...left, ...left.map((b) => ({ ...mirrorX(b), name: `${b.name}:r` }))];

/**
 * A box split into unit tiles along `axis` (0: x, 2: z), each its own tone of `tones` (picked by place): the target's gold bands,
 * tile by tile.
 */
function tiles(from: [number, number, number], size: [number, number, number], axis: 0 | 2, tones: readonly number[], salt = 0, name = "tile"): Cuboid[] {
  const out: Cuboid[] = [];
  const n = Math.round(size[axis]);
  for (let i = 0; i < n; i++) {
    const f: [number, number, number] = [...from];
    const sz: [number, number, number] = [...size];
    f[axis] = from[axis] + (size[axis] * i) / n;
    sz[axis] = size[axis] / n;
    out.push({ from: f, size: sz, colour: tones[(i * 5 + salt * 3 + (i >> 1)) % tones.length]!, name: `${name}-${i}` });
  }
  return out;
}
const BAND = [C.gold, C.goldLight, C.gold, 0xeda22f, C.goldLight, C.gold, 0xeda22f];

/** A headwear: its blocks round the head cube (0..8, the face at z 8), and the hair blocks it covers (by name), which go. */
interface Headwear {
  blocks: Cuboid[];
  hides: (name: string) => boolean;
}

const prefix =
  (...names: string[]) =>
  (name: string) =>
    names.some((n) => name.startsWith(n));

/**
 * The crown, as the target's: built on its left half and mirrored (it is symmetric about u 4): the band in tiles, the corner point
 * stepped, the middle point (centred) stepped over the ruby, the ruby centred in its mount, its facets lit on top and shaded below.
 */
function crown(): Headwear {
  const half: Cuboid[] = [
    ...tiles([-0.6, 8.0, 7.9], [4.6, 1.8, 0.85], 0, BAND, 0, "crown/band-front"),
    { from: [-0.6, 9.75, 7.9], size: [2.0, 1.3, 0.85], colour: C.gold, name: "crown/corner" },
    { from: [-0.6, 11.0, 7.95], size: [1.0, 0.7, 0.75], colour: C.goldLight, name: "crown/corner-step" },
    ...tiles([-0.75, 8.0, -0.75], [0.85, 1.8, 9.5], 2, BAND, 2, "crown/band-side"),
    { from: [-0.75, 9.75, 3.1], size: [0.85, 1.2, 1.8], colour: C.gold, name: "crown/side-point" },
    { from: [-1.0, 8.4, 3.45], size: [0.4, 1.0, 1.1], colour: C.ruby, name: "crown/side-ruby" },
  ];
  return {
    blocks: [
      ...bothSides(half),
      { from: [-0.6, 8.0, -0.75], size: [9.2, 1.8, 0.85], colour: C.goldDark, name: "crown/band-back" },
      { from: [2.8, 9.75, 7.9], size: [2.4, 1.6, 0.85], colour: C.gold, name: "crown/middle" },
      { from: [3.3, 11.3, 7.95], size: [1.4, 0.8, 0.75], colour: C.goldLight, name: "crown/middle-step" },
      { from: [3.0, 9.75, -0.75], size: [2.0, 1.2, 0.85], colour: C.goldDark, name: "crown/back-point" },
      { from: [3.05, 8.35, 8.6], size: [1.9, 1.95, 0.35], colour: C.goldDark, name: "crown/mount" },
      { from: [3.3, 8.55, 8.8], size: [1.4, 1.55, 0.45], colour: C.ruby, name: "crown/ruby" },
      { from: [3.3, 9.6, 9.15], size: [1.4, 0.45, 0.2], colour: C.rubyLight, name: "crown/ruby-light" },
      { from: [3.3, 8.55, 9.15], size: [1.4, 0.4, 0.15], colour: C.rubyDark, name: "crown/ruby-dark" },
    ],
    hides: () => false,
  };
}

// A dark steel (a light one was grey hair's own tone under it: the checks).
const IRON = [0x6c7480, 0x7d8692, 0x5e6671, 0x8c95a0, 0x737c87];

/**
 * An iron helmet: a band round the forehead (over the fringe and the side's top row), a dome in two steps with a crest, a nose
 * guard resting on the nose, rivets on the band's front.
 */
function helmet(steel: (c: number) => number): Headwear {
  const IRON_ = IRON.map(steel);
  const half: Cuboid[] = [
    ...tiles([-0.55, 6.5, 7.95], [4.55, 1.75, 0.75], 0, IRON_, 1, "helmet/band-front"),
    ...tiles([-0.75, 6.5, -0.75], [0.8, 1.75, 9.45], 2, IRON_, 3, "helmet/band-side"),
    { from: [0.15, 7.15, 8.65], size: [0.45, 0.45, 0.2], colour: steel(0xc9cfd6), name: "helmet/rivet" },
  ];
  return {
    blocks: [
      ...bothSides(half),
      { from: [-0.55, 6.5, -0.75], size: [9.1, 1.75, 0.8], colour: IRON_[2]!, name: "helmet/band-back" },
      { from: [-0.45, 8.2, -0.45], size: [8.9, 1.2, 8.9], colour: IRON_[4]!, grain: 0.1, name: "helmet/dome" },
      { from: [0.6, 9.35, 0.6], size: [6.8, 0.9, 6.8], colour: IRON_[1]!, grain: 0.1, name: "helmet/dome-top" },
      { from: [3.45, 10.2, 0.3], size: [1.1, 0.55, 7.4], colour: IRON_[2]!, name: "helmet/crest" },
      { from: [3.45, 4.0, 8.35], size: [1.1, 2.6, 0.4], colour: IRON_[0]!, name: "helmet/nose-guard" },
    ],
    hides: prefix("hair/slab", "hair/fringe", "hair/side-top"),
  };
}

/**
 * A hood in the outfit's cloth: a shell over the head (its top, sides and back), a thick rim framing the face, a tip drooping at
 * the back. It ends above the shoulders (y 0.9): the pauldrons ride up under it.
 */
function hood(cloth: readonly number[]): Headwear {
  const [a, b, c, d] = [cloth[0]!, cloth[1]!, cloth[2]!, cloth[3]!];
  const half: Cuboid[] = [
    { from: [-0.9, 0.9, -0.9], size: [0.75, 7.1, 8.8], colour: b, grain: 0.08, name: "hood/side" },
    { from: [-0.9, 0.9, 7.9], size: [1.25, 6.0, 0.95], colour: c, grain: 0.08, name: "hood/rim-side" },
  ];
  return {
    blocks: [
      ...bothSides(half),
      { from: [-0.9, 8.0, -0.9], size: [9.8, 1.0, 9.75], colour: a, grain: 0.08, name: "hood/top" },
      { from: [-0.9, 0.9, -0.9], size: [9.8, 7.1, 0.75], colour: b, grain: 0.08, name: "hood/back" },
      { from: [-0.9, 6.9, 7.9], size: [9.8, 2.1, 0.95], colour: d, grain: 0.08, name: "hood/rim-top" },
      { from: [2.5, 8.4, -1.5], size: [3.0, 1.3, 2.0], rotation: [-25, 0, 0], colour: a, grain: 0.08, name: "hood/tip" },
    ],
    hides: prefix("hair/slab", "hair/fringe", "hair/side", "hair/back", "hair/tuft"),
  };
}

const WIZARD = [0x2b3070, 0x30367c, 0x272c66, 0x353b86];
const WIZARD_CONE = [0x4650b4, 0x5560c8, 0x4a55bc];

/** A wizard's hat: a wide brim, a gold band, a cone in three steps, its tip bent back (it stays within the frame). */
function wizard(): Headwear {
  return {
    blocks: [
      // (a brim 10 wide: a wider one hid the cone from the camera below, the hat read as a flat cap)
      ...tiles([-1.0, 7.9, -1.0], [10.0, 0.55, 10.0], 0, WIZARD, 2, "wizard/brim"),
      { from: [-0.3, 8.45, -0.3], size: [8.6, 0.7, 8.6], colour: C.gold, name: "wizard/band" },
      // The cone in three steps, lighter than the brim, two gold stars on it (it reads as a cone from the camera below); its tip
      // bent back. Any taller and a nod sent it out of the badge's circle (the checks).
      { from: [-0.1, 9.15, -0.1], size: [8.2, 0.9, 8.2], colour: WIZARD_CONE[0]!, grain: 0.1, name: "wizard/cone-0" },
      { from: [1.0, 10.05, 0.8], size: [6.0, 1.24, 6.0], colour: WIZARD_CONE[1]!, grain: 0.1, name: "wizard/cone-1" },
      { from: [2.1, 11.29, 1.4], size: [3.8, 1.05, 3.8], colour: WIZARD_CONE[2]!, grain: 0.1, name: "wizard/cone-2" },
      { from: [2.8, 12.24, 1.2], size: [2.4, 1.2, 2.4], rotation: [-40, 0, 0], pivot: [4, 12.34, 2.4], colour: WIZARD_CONE[1]!, grain: 0.1, name: "wizard/tip" },
      { from: [3.35, 12.44, -0.6], size: [1.3, 0.9, 1.9], rotation: [-70, 0, 0], pivot: [4, 12.74, 0.6], colour: WIZARD_CONE[0]!, name: "wizard/tip-end" },
      { from: [2.0, 10.5, 6.75], size: [0.6, 0.6, 0.15], colour: C.goldLight, name: "wizard/star-0" },
      { from: [4.6, 9.45, 8.05], size: [0.5, 0.5, 0.15], colour: C.goldLight, name: "wizard/star-1" },
    ],
    hides: prefix("hair/slab"),
  };
}

/** A hunter's cap in green felt: a body in two steps, a visor turned down at the front, a red feather on the left side. */
function feathered(): Headwear {
  const felt = [0x3f6b35, 0x4a7a3e, 0x365c2e, 0x55863f];
  return {
    blocks: [
      ...tiles([-0.5, 7.8, -0.6], [9.0, 1.5, 9.1], 0, felt, 1, "feathered/body"),
      { from: [0.4, 9.3, 0.0], size: [7.2, 0.9, 7.6], colour: felt[1]!, grain: 0.1, name: "feathered/crown" },
      { from: [0.6, 7.75, 8.3], size: [6.8, 0.45, 1.5], rotation: [14, 0, 0], pivot: [4, 8.0, 8.3], colour: felt[2]!, name: "feathered/visor" },
      { from: [-1.0, 8.6, 1.6], size: [0.35, 4.2, 1.1], rotation: [-32, 0, 0], pivot: [-0.8, 8.6, 2.2], colour: 0xc8322a, name: "feathered/feather" },
      { from: [-1.05, 9.4, 1.3], size: [0.3, 2.6, 0.4], rotation: [-32, 0, 0], pivot: [-0.8, 8.6, 2.2], colour: 0xf2e6c8, name: "feathered/quill" },
    ],
    hides: prefix("hair/slab", "hair/side-top"),
  };
}

function headwearOf(t: Traits, cloth: readonly number[]): Headwear {
  switch (t.headwear) {
    case "crown":
      return crown();
    case "helmet":
      return helmet(families(t).steel);
    case "hood":
      return hood(cloth);
    case "wizard":
      return wizard();
    case "feathered":
      return feathered();
    case "none":
      return { blocks: [], hides: () => false };
  }
}

/**
 * The long hair's extra blocks: the side's back half and the back down to the jaw's line (the head's underside). Nothing hangs
 * below the head: a mass behind the neck went into the shoulders as soon as the head turned (the checks).
 */
function longHair(p: HeadPalette): Cuboid[] {
  const hair = (i: number) => p.hair[i % p.hair.length]!;
  const side: Cuboid[] = [
    { from: [-EDGE_OUT, 0, -EDGE_OUT], size: [0.1 + EDGE_OUT, 3.5, 1.35 + EDGE_OUT], colour: hair(2), name: "hair/long-side-0" },
    { from: [-EDGE_OUT - 0.02, 0, 1.05], size: [0.12 + EDGE_OUT, 2.0, 1.55], colour: hair(6), name: "hair/long-side-1" },
  ];
  return [
    ...bothSides(side),
    { from: [-EDGE_OUT, 0, -EDGE_OUT - 0.04], size: [HEAD + 2 * EDGE_OUT, 2.05, 0.12 + EDGE_OUT], colour: hair(4), name: "hair/long-back" },
  ];
}

/** The beard's blocks for its style (`full` is the king's; `long` adds a mass hanging below the chin). */
function beardOf(t: Traits, p: HeadPalette): { face: Cuboid[]; jaw: Cuboid[]; extra: Cuboid[] } {
  const beard = (i: number) => p.beard[i % p.beard.length]!;
  switch (t.beard) {
    case "full":
      return { face: [moustacheBlock(p), ...beardBlocks(p)], jaw: jawBeardBlocks(p), extra: [] };
    case "long":
      return {
        face: [moustacheBlock(p), ...beardBlocks(p)],
        jaw: jawBeardBlocks(p),
        // A block below the chin and a point, narrower than the face, in front of the chest (a longer one met the chest, the
        // shoulders and the clapping hands as soon as the head nodded or turned: the checks).
        extra: [
          { from: [2.0, -1.1, 7.6], size: [4.0, 1.15, 0.7], colour: beard(1), grain: 0.08, name: "beard/long-0" },
          { from: [2.9, -1.9, 7.7], size: [2.2, 0.85, 0.5], colour: beard(3), grain: 0.08, name: "beard/long-1" },
        ],
      };
    case "goatee":
      return {
        face: [
          moustacheBlock(p),
          { from: [2.75, 0, 7.9], size: [2.5, 1.75, 0.4], colour: beard(2), name: "beard/goatee" },
          { from: [3.1, -1.1, 7.75], size: [1.8, 1.15, 0.5], colour: beard(1), name: "beard/goatee-tip" },
        ],
        jaw: [],
        extra: [],
      };
    case "moustache":
      return {
        face: [
          moustacheBlock(p),
          { from: [1.45, 8 - 6.2, 7.9], size: [0.6, 1.0, 0.34], colour: beard(1), name: "beard/moustache-end-0" },
          { from: [5.95, 8 - 6.2, 7.9], size: [0.6, 1.0, 0.34], colour: beard(1), name: "beard/moustache-end-1" },
        ],
        jaw: [],
        extra: [],
      };
    case "none":
      return { face: [], jaw: [], extra: [] };
  }
}

/** The accessory's blocks: a patch over the right eye (the viewer's left) and its strap, glasses, or gold hoops at the ears. */
function accessoryOf(t: Traits): Cuboid[] {
  switch (t.accessory) {
    case "eyepatch":
      return [
        { from: [0.85, 8 - 4.15, 7.95], size: [2.3, 1.6, 0.24], colour: 0x221d1c, name: "accessory/patch" },
        { from: [3.0, 8 - 2.95, 7.97], size: [5.4, 0.28, 0.13], rotation: [0, 0, 15], pivot: [3.0, 8 - 2.8, 8.0], colour: 0x2e2624, name: "accessory/strap" },
        { from: [-0.32, 8 - 3.3, 7.97], size: [1.25, 0.28, 0.13], colour: 0x2e2624, name: "accessory/strap-left" },
      ];
    case "glasses": {
      const frame = 0x3a3034;
      // Each lens's frame from v 2.8 to 4.2: its top bar just under the brow (in the brow's underside's plane, the two flickered).
      const lens = (u0: number, i: number): Cuboid[] => [
        { from: [u0, 8 - 3.0, 8.2], size: [2.4, 0.2, 0.2], colour: frame, name: `accessory/glass-${i}-top` },
        { from: [u0, 8 - 4.2, 8.2], size: [2.4, 0.2, 0.2], colour: frame, name: `accessory/glass-${i}-bottom` },
        { from: [u0, 8 - 4.0, 8.21], size: [0.2, 1.0, 0.18], colour: frame, name: `accessory/glass-${i}-outer` },
        { from: [u0 + 2.2, 8 - 4.0, 8.21], size: [0.2, 1.0, 0.18], colour: frame, name: `accessory/glass-${i}-inner` },
      ];
      const temple: Cuboid[] = [
        { from: [-0.42, 8 - 2.95, 8.03], size: [1.25, 0.18, 0.17], colour: frame, name: "accessory/temple-front" },
        { from: [-0.42, 8 - 2.95, 4.6], size: [0.15, 0.18, 3.45], colour: frame, name: "accessory/temple" },
      ];
      return [...lens(0.8, 0), ...lens(4.8, 1), { from: [3.2, 8 - 3.0, 8.25], size: [1.6, 0.18, 0.13], colour: frame, name: "accessory/bridge" }, ...bothSides(temple)];
    }
    case "earrings": {
      const hoop: Cuboid[] = [
        { from: [-0.5, 8 - 4.95, 3.85], size: [0.5, 0.3, 0.4], colour: C.goldDark, name: "accessory/hoop-top" },
        { from: [-0.64, 8 - 6.0, 3.55], size: [0.28, 1.05, 0.25], colour: C.gold, name: "accessory/hoop-back" },
        { from: [-0.64, 8 - 6.0, 4.2], size: [0.28, 1.05, 0.25], colour: C.goldLight, name: "accessory/hoop-front" },
        { from: [-0.64, 8 - 6.2, 3.55], size: [0.28, 0.25, 0.9], colour: C.gold, name: "accessory/hoop-bottom" },
      ];
      return bothSides(hoop);
    }
    case "none":
      return [];
  }
}

/** The head's cuboids for the traits, in the king's order (so the king's own build is unchanged): hair, face, beard, back, headwear, sides, extras. */
export function headCuboids(t: Traits, p: HeadPalette = headPalette(t), cloth: readonly number[] = outfitTones(t).tunic): Cuboid[] {
  const f = families(t);
  const hairy = t.hairStyle !== "bald";
  const beard = beardOf(t, p);
  const wear = headwearOf(t, cloth);
  const keep = (b: Cuboid) => !wear.hides(b.name ?? "");
  const centre: Cuboid[] = [
    ...(hairy ? [{ from: [-0.25, 7.6, -0.25], size: [8.5, 1.1, 8.4], colour: f.hair(C.hair), name: "hair/slab" } satisfies Cuboid] : []),
    ...(hairy ? fringeBlocks(p) : []),
    ...featureBlocks(p),
    ...beard.face,
    ...(hairy ? backBlocks(p) : []),
    ...wear.blocks,
  ].filter(keep);
  const left: Cuboid[] = [...(hairy ? sideHairBlocks(p) : []), ...beard.jaw].filter(keep);
  return [...centre, ...left, ...left.map((b) => ({ ...mirrorX(b), name: `${b.name}:r` })), ...(t.hairStyle === "long" ? longHair(p).filter(keep) : []), ...beard.extra, ...accessoryOf(t)];
}

/** The tunic's tones (the target's blues, moved to the outfit's), and the neckline's skins. */
export function outfitTones(t: Traits) {
  const f = families(t);
  return {
    tunic: [0x1f4d7e, 0x245c94, 0x2a68a2, 0x2a68a2, 0x2f78b8, 0x2f78b8, 0x3a86c4, 0x4a94cf].map(f.outfit),
    // The head's shade over the chest's top rows (measured: the target's #1f4b7a there, its #296596 lower down).
    shaded: [0x173a62, 0x1c4472, 0x1f4b7a, 0x22527f].map(f.outfit),
    collar: f.outfit(0x182f4e),
    skin: [0xfdbc75, 0xf9b672].map(f.skin),
  };
}

/** A body cuboid's colour for the traits: by its name's family (the neck and forearms skin, the tunic, collar and sleeves the outfit's, the pauldrons theirs). */
export function bodyTone(name: string | undefined, colour: number, t: Traits): number {
  const f = families(t);
  if (!name) return colour;
  if (name.startsWith("neck") || name.startsWith("forearm")) return f.skin(colour);
  if (name.startsWith("tunic") || name.startsWith("collar") || name.startsWith("sleeve")) return f.outfit(colour);
  if (name.startsWith("pauldron")) return f.pauldron(colour);
  return colour;
}

/** The king's six head faces, in three's box order (right, left, top, bottom, front, back), for a mouth's id. */
export function headFaces(t: Traits, mouth?: number, white?: number, p: HeadPalette = headPalette(t)): number[][] {
  const side = sidePaint(p);
  const mirrored = side.map((_, i) => side[Math.floor(i / 32) * 32 + 31 - (i % 32)]!);
  const hairTiles = Array.from({ length: 64 }, (_, i) => p.hair[(i * 5 + (i >> 3)) % p.hair.length]!);
  const skinTiles = Array.from({ length: 64 }, (_, i) => p.skin[(i * 3 + (i >> 3)) % p.skin.length]!);
  const bald = t.hairStyle === "bald";
  const bearded = t.beard === "full" || t.beard === "long";
  const under = Array.from({ length: 64 }, (_, i) => (bearded && i >> 3 < 3 ? p.beard[i % p.beard.length]! : p.skin[i % 2]!));
  return [mirrored, side, bald ? skinTiles : hairTiles, under, facePaint(mouth, white, p), bald ? skinTiles : hairTiles];
}

/** The torso's and arms' cuboids from Codex's decomposition (see `avatar-king.ts`), recoloured for the traits. */
export function bodyCuboids(t: Traits, strap: Cuboid[]) {
  const keep = (b: Cuboid) =>
    !(b.size[2] < 0.2 && b.from[2] >= 6) &&
    !(b.rotation && b.from[2] > 6.3) &&
    !(b.size[0] === 8 && b.size[2] === 4) &&
    !(b.from[2] >= 5.5 && b.from[1] > -3 && b.from[0] >= 0.9 && b.from[0] <= 5.5);
  const tone = (b: Cuboid): Cuboid => ({ ...b, colour: bodyTone(b.name, b.colour, t) });
  // The neck runs up inside the head (hidden there at rest): a head lifted on it (`liftHead`) shows neck, never a gap.
  const neck = (b: Cuboid): Cuboid => (b.name === "neck" ? { ...b, size: [b.size[0], b.size[1] + 1.5, b.size[2]] } : b);
  const isPauldron = (b: Cuboid) => b.name?.startsWith("pauldron") ?? false;
  const pauldrons = t.pauldrons !== "none";
  return {
    torso: [...KING_BODY.torso.filter(keep).map(neck), ...strap].map(tone),
    armRight: KING_BODY.armRight.filter((b) => !isPauldron(b)).map(tone),
    armLeft: KING_BODY.armLeft.filter((b) => !isPauldron(b)).map(tone),
    // The pauldrons overhang the sleeve's outer side by a quarter unit (the spec had them flush: one plane, two faces).
    pauldronRight: pauldrons
      ? KING_BODY.armRight.filter(isPauldron).map((b) => tone(b.from[0] <= -4 + 1e-6 ? { ...b, from: [b.from[0] - 0.25, b.from[1], b.from[2]], size: [b.size[0] + 0.25, b.size[1], b.size[2]] } : b))
      : [],
    pauldronLeft: pauldrons ? KING_BODY.armLeft.filter(isPauldron).map((b) => tone(b.from[0] + b.size[0] >= 12 - 1e-6 ? { ...b, size: [b.size[0] + 0.25, b.size[1], b.size[2]] } : b)) : [],
  };
}
