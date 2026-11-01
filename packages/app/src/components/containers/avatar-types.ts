import { decodeTraits, encodeTraits, OPTION_NAMES, TRAIT_NAMES, TRAIT_OPTIONS, TRAIT_PARTS, type Trait, type Traits } from "@paved/renderer";

// The avatar creator's shapes (#626 PR 2, AVATAR-LIVING): what each option of each trait is to the player, read from the chain's
// catalogue (`avatarOffers` in `data/avatar-offers.ts`), and the rules the page and the scene share over a draft. A draft holds
// item ids (each trait's option index), as the chain numbers its items.

/** A look by item ids: each trait's option, by its index in the trait's options. */
export type TraitIds = { readonly [K in Trait]: number };

/** The king's look: every trait's first option (item 0, the free default of every part on chain). */
export const KING_IDS: TraitIds = Object.fromEntries(TRAIT_PARTS.map((trait) => [trait, 0])) as TraitIds;

/** The ids of some traits. */
export const idsOf = (traits: Traits): TraitIds =>
  Object.fromEntries(TRAIT_PARTS.map((trait) => [trait, Math.max(0, (TRAIT_OPTIONS[trait] as readonly string[]).indexOf(traits[trait]))])) as TraitIds;

/** The traits of some ids (an id past a trait's options reads as its first). */
export const traitsOf = (ids: TraitIds): Traits =>
  Object.fromEntries(TRAIT_PARTS.map((trait) => [trait, TRAIT_OPTIONS[trait][ids[trait]] ?? TRAIT_OPTIONS[trait][0]])) as Traits;

/** The look the chain stores for some ids (`set_avatar`'s value), and the ids of a stored look. */
export const lookOf = (ids: TraitIds): bigint => encodeTraits(traitsOf(ids));
export const idsOfLook = (look: bigint): TraitIds => idsOf(decodeTraits(look));

/** The traits' titles, as the creator's tabs show them. */
export const PART_TITLES: Record<Trait, string> = TRAIT_NAMES;

/** An option's name: the swatch's label. */
export const optionName = (trait: Trait, id: number): string | undefined => {
  const value = TRAIT_OPTIONS[trait][id];
  return value === undefined ? undefined : (OPTION_NAMES[trait] as Record<string, string>)[value];
};

/**
 * An option to the player: free (listed at 0 Cobbles), owned (bought), on sale (its price, and the block time its sale ends at,
 * 0 for none: a seasonal item's `until`), or off (never listed, withdrawn, sold out or past its season, and not owned).
 */
export type AvatarOffer = { kind: "free" } | { kind: "owned" } | { kind: "sale"; cobbles: number; until: number } | { kind: "off" };

/** Each trait in use (the chain's parts, in the look's byte order) and its options' offers, by id. A trait not in use is absent: it stays at 0. */
export type AvatarOffers = Readonly<Partial<Record<Trait, readonly AvatarOffer[]>>>;

/** An option the player may save: free or owned. */
export const isUsable = (offer: AvatarOffer | undefined): boolean => offer?.kind === "free" || offer?.kind === "owned";

/** The creator's tabs in order: the face first, then what the player wears, then the scene behind. */
export const TAB_ORDER: readonly Trait[] = ["skin", "hair", "hairStyle", "beard", "eyes", "headwear", "accessory", "outfit", "pauldrons", "backdrop"];

/** A paid item's rarity, by the catalogue's price tiers (20, 40, 60 and 100 Cobbles); a price off the tiers has none. */
export function rarityOf(cobbles: number): "Common" | "Rare" | "Epic" | "Legendary" | null {
  return ({ 20: "Common", 40: "Rare", 60: "Epic", 100: "Legendary" } as const)[cobbles as 20 | 40 | 60 | 100] ?? null;
}

/** The traits in use (the chain's parts, in the look's byte order), as the creator's tabs. */
export const partsInUse = (offers: AvatarOffers): Trait[] => TAB_ORDER.filter((trait) => offers[trait] !== undefined);

/** The traits of a draft whose option the player may not save yet (on sale, or off): Save waits for them. */
export function unusableParts(draft: TraitIds, offers: AvatarOffers): Trait[] {
  return TRAIT_PARTS.filter((trait) => {
    const list = offers[trait];
    return list === undefined ? draft[trait] !== 0 : !isUsable(list[draft[trait]]);
  });
}

/** Whether two looks are the same, trait for trait. */
export const sameAvatar = (a: TraitIds, b: TraitIds): boolean => TRAIT_PARTS.every((trait) => a[trait] === b[trait]);

/** A draft with one trait changed. */
export const withPart = (draft: TraitIds, trait: Trait, id: number): TraitIds => ({ ...draft, [trait]: id });

/**
 * A random look among what the player may save: each trait in use drawn evenly from its free and owned options (its default when
 * it has none), every other trait at 0. `random` returns [0, 1), as `Math.random`.
 */
export function randomUsable(offers: AvatarOffers, random: () => number = Math.random): TraitIds {
  return Object.fromEntries(
    TRAIT_PARTS.map((trait) => {
      const usable = (offers[trait] ?? []).flatMap((offer, id) => (isUsable(offer) && id < TRAIT_OPTIONS[trait].length ? [id] : []));
      return [trait, usable.length === 0 ? 0 : usable[Math.floor(random() * usable.length)]!];
    }),
  ) as TraitIds;
}
