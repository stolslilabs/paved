import { AVATAR_PARTS, AVATAR_PART_KEYS, DEFAULT_AVATAR, type Avatar, type AvatarPart } from "@paved/renderer";

// The avatar creator's shapes (#626 PR 2): what each variant of each part is to the player, read from the chain's catalogue
// (`avatarOffers` in `data/avatar.ts`), and the rules the page and the scene share over a draft.

/** The part names as the creator's tabs title them. */
export const PART_TITLES: Record<AvatarPart, string> = {
  skin: "Skin tone",
  hairColour: "Hair colour",
  eyes: "Eyes",
  eyebrows: "Eyebrows",
  mouth: "Mouth",
  hair: "Hair",
  beard: "Beard",
  headwear: "Headwear",
  accessory: "Accessory",
  background: "Background",
};

/**
 * A variant to the player: free (listed at 0 Cobbles), owned (bought), on sale (its price, and the block time its sale ends
 * at, 0 for none: a seasonal item's `until`), or off (never listed, withdrawn, sold out or past its season, and not owned).
 */
export type AvatarOffer = { kind: "free" } | { kind: "owned" } | { kind: "sale"; cobbles: number; until: number } | { kind: "off" };

/** Each part in use (the chain's count, in the format's order) and its variants' offers, by variant id. A part not in use is absent: it stays at 0. */
export type AvatarOffers = Readonly<Partial<Record<AvatarPart, readonly AvatarOffer[]>>>;

/** A variant the player may save: free or owned. */
export const isUsable = (offer: AvatarOffer | undefined): boolean => offer?.kind === "free" || offer?.kind === "owned";

/** The parts in use, in the format's order: the creator's tabs. */
export const partsInUse = (offers: AvatarOffers): AvatarPart[] => AVATAR_PART_KEYS.filter((part) => offers[part] !== undefined);

/** The parts of a draft whose variant the player may not save yet (on sale, or off): Save waits for them. */
export function unusableParts(draft: Avatar, offers: AvatarOffers): AvatarPart[] {
  return AVATAR_PART_KEYS.filter((part) => {
    const list = offers[part];
    return list === undefined ? draft[part] !== 0 : !isUsable(list[draft[part]]);
  });
}

/** Whether two avatars are the same, part for part. */
export const sameAvatar = (a: Avatar, b: Avatar): boolean => AVATAR_PART_KEYS.every((part) => a[part] === b[part]);

/** A draft with one part changed. */
export const withPart = (draft: Avatar, part: AvatarPart, id: number): Avatar => ({ ...draft, [part]: id });

/**
 * A random avatar among what the player may save: each part in use drawn evenly from its free and owned variants (its
 * default when it has none), every other part at 0. `random` returns [0, 1), as `Math.random`.
 */
export function randomUsable(offers: AvatarOffers, random: () => number = Math.random): Avatar {
  return Object.fromEntries(
    AVATAR_PART_KEYS.map((part) => {
      const usable = (offers[part] ?? []).flatMap((offer, id) => (isUsable(offer) && id < AVATAR_PARTS[part].length ? [id] : []));
      return [part, usable.length === 0 ? DEFAULT_AVATAR[part] : usable[Math.floor(random() * usable.length)]!];
    }),
  ) as Avatar;
}
