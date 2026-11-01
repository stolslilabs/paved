/**
 * The avatar's look: the player's traits, and the value the contracts store (AVATAR-CHAIN, #627: one u128, which the contract
 * reads as a version byte then an item id a part, never what a part means). Small and eager: the menus read it without the
 * renderer's chunks.
 *
 *   bits   0..7    the format's version: 1 (0: no avatar chosen)
 *   bits   8..15   skin            bits  48..55  hair style
 *   bits  16..23   hair colour     bits  56..63  beard
 *   bits  24..31   eyes            bits  64..71  headwear
 *   bits  32..39   outfit          bits  72..79  accessory
 *   bits  40..47   pauldrons       bits  80..127 0 (the bytes past the parts in use)
 *
 * A trait takes the byte of the catalogue's old part closest to it (AVATAR-LOOK's ten: skin, hair colour, eyes, eyebrows, mouth,
 * hair, beard, headwear, accessory, background), so a look saved before the traits keeps its skin, hair colour, hair, beard,
 * headwear and accessory bytes; the outfit and the pauldrons take the eyebrows' and the mouth's; the background's byte stays 0.
 * An item id is the option's index in its trait's list below; an id past the list is read as the trait's first option (each
 * trait's default, free on chain). A list only grows at its end, so a stored id keeps its meaning.
 */

export const TRAIT_OPTIONS = {
  skin: ["peach", "pale", "tan", "brown", "deep"],
  hair: ["auburn", "black", "blond", "ginger", "grey"],
  hairStyle: ["short", "bald", "long"],
  beard: ["full", "none", "moustache", "goatee", "long"],
  eyes: ["brown", "blue", "green", "grey", "amber"],
  headwear: ["crown", "none", "helmet", "hood", "wizard", "feathered"],
  accessory: ["none", "eyepatch", "glasses", "earrings"],
  outfit: ["blue", "red", "green", "purple", "black"],
  pauldrons: ["gold", "iron", "leather", "none"],
} as const;

export type Trait = keyof typeof TRAIT_OPTIONS;
export type Traits = { [K in Trait]: (typeof TRAIT_OPTIONS)[K][number] };

/** The king, as the target draws him: each trait's first option, the look of id 0 everywhere. */
export const KING_TRAITS: Traits = {
  skin: "peach",
  hair: "auburn",
  hairStyle: "short",
  beard: "full",
  eyes: "brown",
  headwear: "crown",
  accessory: "none",
  outfit: "blue",
  pauldrons: "gold",
};

/** The traits in the look's byte order (byte `p + 1` holds trait `p`): the parts in use on chain, at least this many. */
export const TRAIT_PARTS: readonly Trait[] = ["skin", "hair", "eyes", "outfit", "pauldrons", "hairStyle", "beard", "headwear", "accessory"];

/** The creator's labels: each trait's, and each option's. */
export const TRAIT_NAMES: Record<Trait, string> = {
  skin: "Skin tone",
  hair: "Hair colour",
  hairStyle: "Hair",
  beard: "Beard",
  eyes: "Eyes",
  headwear: "Headwear",
  accessory: "Accessory",
  outfit: "Outfit",
  pauldrons: "Pauldrons",
};
export const OPTION_NAMES: { [K in Trait]: Record<Traits[K], string> } = {
  skin: { peach: "Peach", pale: "Pale", tan: "Tan", brown: "Brown", deep: "Deep" },
  hair: { auburn: "Auburn", black: "Black", blond: "Blond", ginger: "Ginger", grey: "Grey" },
  hairStyle: { short: "Short", bald: "Bald", long: "Long" },
  beard: { full: "Full", none: "None", moustache: "Moustache", goatee: "Goatee", long: "Long" },
  eyes: { brown: "Brown", blue: "Blue", green: "Green", grey: "Grey", amber: "Amber" },
  headwear: { crown: "Crown", none: "None", helmet: "Helmet", hood: "Hood", wizard: "Wizard hat", feathered: "Feathered cap" },
  accessory: { none: "None", eyepatch: "Eyepatch", glasses: "Glasses", earrings: "Earrings" },
  outfit: { blue: "Blue", red: "Red", green: "Green", purple: "Purple", black: "Black" },
  pauldrons: { gold: "Gold", iron: "Iron", leather: "Leather", none: "None" },
};

/** The format's version (byte 0); the contract accepts this one only. */
export const LOOK_VERSION = 1;
const BYTE = 8n;

/** A trait's item id: its option's index. */
export const optionId = <K extends Trait>(trait: K, value: Traits[K]): number => (TRAIT_OPTIONS[trait] as readonly string[]).indexOf(value);

/** The look the contract stores for the traits: version 1, a byte a trait in `TRAIT_PARTS`' order, 0 past them. */
export function encodeTraits(traits: Traits): bigint {
  let look = BigInt(LOOK_VERSION);
  TRAIT_PARTS.forEach((trait, p) => {
    look |= BigInt(Math.max(0, optionId(trait, traits[trait]))) << (BYTE * BigInt(p + 1));
  });
  return look;
}

/**
 * The traits of a stored look. No avatar (0), another version, and an id past a trait's options read as the king's: a look
 * always draws. The bytes past the traits are ignored.
 */
export function decodeTraits(look: bigint): Traits {
  const out: Record<string, string> = { ...KING_TRAITS };
  if ((look & 0xffn) !== BigInt(LOOK_VERSION)) return out as Traits;
  TRAIT_PARTS.forEach((trait, p) => {
    const id = Number((look >> (BYTE * BigInt(p + 1))) & 0xffn);
    const options = TRAIT_OPTIONS[trait] as readonly string[];
    if (id < options.length) out[trait] = options[id]!;
  });
  return out as Traits;
}

/** A short text of the traits (`key-value`, `.` between, only where they differ from the king's): URLs and cache keys. */
export const traitsText = (t: Traits): string =>
  (Object.keys(KING_TRAITS) as Trait[])
    .filter((k) => t[k] !== KING_TRAITS[k])
    .map((k) => `${k}-${t[k]}`)
    .join(".");

/** The traits of a `traitsText` (the king's for any pair it does not know). */
export function traitsFrom(text: string | null | undefined): Traits {
  const out: Traits = { ...KING_TRAITS };
  for (const pair of (text ?? "").split(".")) {
    const [key, value] = pair.split("-") as [Trait, string];
    // Only the traits' own keys: a URL's `__proto__-x` or `constructor-y` names no trait.
    const options = Object.hasOwn(TRAIT_OPTIONS, key) ? (TRAIT_OPTIONS[key] as readonly string[]) : undefined;
    if (options?.includes(value)) (out as Record<string, string>)[key] = value;
  }
  return out;
}

/** Traits drawn at random, an option of each. */
export function randomTraits(random: () => number = Math.random): Traits {
  return Object.fromEntries(
    (Object.keys(TRAIT_OPTIONS) as Trait[]).map((trait) => {
      const options = TRAIT_OPTIONS[trait];
      return [trait, options[Math.min(options.length - 1, Math.floor(random() * options.length))]];
    }),
  ) as Traits;
}

/** A small seeded random (mulberry32): the same seed gives the same draws (the mocks' looks, the stories). */
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
