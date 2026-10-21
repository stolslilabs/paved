/**
 * The avatar's compact format (AVATAR-LOOK, #626): an avatar is one list of part ids, one byte per part, packed into one
 * unsigned 128-bit value, the value the contracts store (AVATAR-CHAIN, #627).
 *
 *   bits   0..7    the format's version: 1 (0: no avatar chosen, drawn as the default one)
 *   bits   8..15   skin            bits  48..55  hair
 *   bits  16..23   hair colour     bits  56..63  beard
 *   bits  24..31   eyes            bits  64..71  headwear
 *   bits  32..39   eyebrows        bits  72..79  accessory
 *   bits  40..47   mouth           bits  80..87  background
 *   bits  88..127  reserved, 0 (five more parts, or a wider id, in a later version)
 *
 * 88 of the 128 bits are used: a u128 holds it, and so does a felt252. A part id is a variant's index in its part's list below
 * (`AVATAR_PARTS`); id 0 is every part's default, the free one. A list only grows at its end, so a stored id keeps its meaning;
 * each part has room for 256 variants.
 */

/** The parts, in the format's order. */
export const AVATAR_PART_KEYS = ["skin", "hairColour", "eyes", "eyebrows", "mouth", "hair", "beard", "headwear", "accessory", "background"] as const;
export type AvatarPart = (typeof AVATAR_PART_KEYS)[number];

/** Each part's variants, by id. The names are the stories' labels (and the creator's, #626 PR 2). */
export const AVATAR_PARTS = {
  skin: ["Sand", "Wheat", "Clay", "Ochre", "Oak", "Walnut", "Earth", "Moss", "Lavender"],
  hairColour: ["Coal", "Bark", "Chestnut", "Copper", "Straw", "Ash"],
  eyes: ["Classic", "Dots", "Wide", "Sleepy", "Wink", "Glowing"],
  eyebrows: ["None", "Flat", "Raised", "Angry", "Bushy"],
  mouth: ["Smile", "Neutral", "Grin", "Open", "Smirk", "Frown"],
  hair: ["Short", "Bald", "Fringe", "Long", "Mohawk", "Curly", "Side part", "Bun"],
  beard: ["None", "Stubble", "Moustache", "Goatee", "Full", "Long"],
  headwear: ["None", "Cap", "Straw hat", "Hood", "Helmet", "Horned helm", "Crown", "Wizard hat"],
  accessory: ["None", "Glasses", "Sunglasses", "Monocle", "Eyepatch", "Scar", "War paint", "Freckles"],
  background: [
    "Gold",
    "Meadow",
    "River",
    "Charcoal",
    "Brick",
    "Violet",
    "Checker",
    "Stripes",
    "Dots",
    "Rays",
    "Fields",
    "Forest",
    "City",
    "Water",
    "Mountains",
    "Night",
    "Wonder",
  ],
} as const satisfies Record<AvatarPart, readonly string[]>;

/** An avatar: a variant id per part. */
export type Avatar = { readonly [K in AvatarPart]: number };

export const AVATAR_FORMAT_VERSION = 1;
/** Bits per part id, and the bits the format uses: the version and the ten parts (literals, so a bundle that does not use them drops them). */
export const AVATAR_PART_BITS = 8;
export const AVATAR_USED_BITS = 88;
/** The width of the stored value. */
export const AVATAR_VALUE_BITS = 128;

/** Every part at its default: the avatar of a player who chose none. */
export const DEFAULT_AVATAR: Avatar = { skin: 0, hairColour: 0, eyes: 0, eyebrows: 0, mouth: 0, hair: 0, beard: 0, headwear: 0, accessory: 0, background: 0 };

/** How many variants a part has. */
export const variantCount = (part: AvatarPart): number => AVATAR_PARTS[part].length;

/** The avatar as the stored value. Throws on an id the part does not have (the value would draw something else). */
export function encodeAvatar(avatar: Avatar): bigint {
  let value = BigInt(AVATAR_FORMAT_VERSION);
  AVATAR_PART_KEYS.forEach((part, i) => {
    const id = avatar[part];
    if (!Number.isInteger(id) || id < 0 || id >= variantCount(part)) throw new RangeError(`avatar ${part}: no variant ${id}`);
    value |= BigInt(id) << BigInt(AVATAR_PART_BITS * (i + 1));
  });
  return value;
}

/**
 * The avatar a stored value holds. 0 (none chosen), a version this client does not know, or a value wider than 128 bits gives
 * the default; an id past a part's list (a variant added by a newer client) gives that part's default.
 */
export function decodeAvatar(value: bigint): Avatar {
  const mask = (1n << BigInt(AVATAR_PART_BITS)) - 1n;
  if (value < 0n || value >> BigInt(AVATAR_VALUE_BITS) !== 0n || (value & mask) !== BigInt(AVATAR_FORMAT_VERSION)) return DEFAULT_AVATAR;
  const out = {} as Record<AvatarPart, number>;
  AVATAR_PART_KEYS.forEach((part, i) => {
    const id = Number((value >> BigInt(AVATAR_PART_BITS * (i + 1))) & mask);
    out[part] = id < variantCount(part) ? id : 0;
  });
  return out;
}

/** The stored value as `0x` hex: a stable key (a still's cache, a story's arg). */
export const avatarKey = (avatar: Avatar): string => `0x${encodeAvatar(avatar).toString(16)}`;

/** A random avatar: every part drawn evenly from its variants. `random` returns [0, 1), as `Math.random` (the default). */
export function randomAvatar(random: () => number = Math.random): Avatar {
  return Object.fromEntries(AVATAR_PART_KEYS.map((part) => [part, Math.floor(random() * variantCount(part))])) as Avatar;
}

/** A seeded `random` (mulberry32): the same seed gives the same avatars, for stories and tests. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
