/**
 * The avatar's colours (AVATAR-LOOK, #626): entries of the base tile models' palette (the 256 x 1 texture every base model shares,
 * `BASE_PALETTE_CLASSES` in `features.ts`), so the head and its backgrounds are painted with the board's own colours. Each name
 * gives its palette entry and that entry's sRGB colour, read off the texture. The shades a part needs (a nose, a fold of hair)
 * are these colours darkened (`shade`), not new colours.
 */
export const AVATAR_PALETTE = {
  // Skin: the board's earths, sands and woods, and two of the wonders' colours for the fanciful ones.
  sand: { entry: 224, hex: 0xdfcfa3 },
  wheat: { entry: 120, hex: 0xdfc9a2 },
  clay: { entry: 48, hex: 0xd89357 },
  ochre: { entry: 209, hex: 0xbc9d5f },
  oak: { entry: 9, hex: 0x9d8259 },
  walnut: { entry: 218, hex: 0x835a3e },
  earth: { entry: 220, hex: 0x5a4331 },
  moss: { entry: 53, hex: 0x69b469 },
  lavender: { entry: 69, hex: 0x9172c3 },
  // Hair and beards.
  coal: { entry: 246, hex: 0x2e2925 },
  bark: { entry: 163, hex: 0x38221d },
  chestnut: { entry: 219, hex: 0x734d36 },
  copper: { entry: 172, hex: 0xa65c1f },
  straw: { entry: 168, hex: 0xd99623 },
  ash: { entry: 150, hex: 0xbdb5a8 },
  // Stone and metal: walls, helmets, frames.
  stone: { entry: 95, hex: 0xb1b1b1 },
  slate: { entry: 194, hex: 0x6b6b6b },
  iron: { entry: 186, hex: 0x787e81 },
  steel: { entry: 191, hex: 0xa6adb1 },
  white: { entry: 248, hex: 0xffffff },
  black: { entry: 255, hex: 0x000000 },
  ink: { entry: 254, hex: 0x4b4b4b },
  // The wonders' and the cities' colours: crowns, cloth, paint.
  gold: { entry: 62, hex: 0xfdd179 },
  amber: { entry: 20, hex: 0xffc229 },
  brick: { entry: 49, hex: 0xc1553b },
  rust: { entry: 56, hex: 0xb55945 },
  wine: { entry: 57, hex: 0x9a4a3b },
  sky: { entry: 58, hex: 0x6c81a1 },
  navy: { entry: 60, hex: 0x405273 },
  violet: { entry: 70, hex: 0x795ea5 },
  plum: { entry: 71, hex: 0x614a86 },
  ruby: { entry: 16, hex: 0xec0000 },
  // Water and plants: backgrounds.
  water: { entry: 136, hex: 0x387195 },
  shallows: { entry: 137, hex: 0x5a9dc2 },
  lake: { entry: 227, hex: 0x668ea7 },
  grass: { entry: 2, hex: 0x99a63c },
  leaf: { entry: 179, hex: 0x59673e },
  pine: { entry: 177, hex: 0x3d4832 },
  olive: { entry: 115, hex: 0x70764a },
  trunk: { entry: 82, hex: 0x553c24 },
  road: { entry: 96, hex: 0x9d8c75 },
  wall: { entry: 216, hex: 0xb4aca0 },
  roof: { entry: 159, hex: 0x8c6b58 },
} as const;

export type AvatarColour = keyof typeof AVATAR_PALETTE;

/** A palette colour as a number (0xRRGGBB). */
export const hexOf = (colour: AvatarColour): number => AVATAR_PALETTE[colour].hex;

/** A colour darkened (factor < 1) or lightened (factor > 1) channel by channel, in sRGB, clamped. */
export function shade(hex: number, factor: number): number {
  const ch = (shift: number) => Math.max(0, Math.min(255, Math.round(((hex >> shift) & 0xff) * factor)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** `#rrggbb` of a colour, for a 2D canvas. */
export const css = (hex: number): string => `#${hex.toString(16).padStart(6, "0")}`;
