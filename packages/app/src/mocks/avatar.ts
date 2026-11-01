import type { AvatarItem } from "@paved/chain";
import { encodeTraits, randomTraits, seededRandom, TRAIT_OPTIONS, TRAIT_PARTS, type Trait } from "@paved/renderer";
import { KING_IDS, lookOf, type AvatarOffer, type AvatarOffers, type TraitIds } from "../components/containers/avatar-types";
import { DAY, MOCK_NOW } from "./clock";

// The avatar on chain in the mocks (#626 PR 2, #627, AVATAR-LIVING): the catalogue as the fresh deployment lists it
// (`scripts/deploy.sh`'s `FRESH_AVATAR_*`), the paid items as the owner would list them, what a player owns, and their saved
// look. The stories' scenes and the mock data source (`data/mock/ledger.ts`) both read it.

/** The parts in use: the nine traits (`FRESH_AVATAR_PARTS`). */
export const AVATAR_PARTS_IN_USE = TRAIT_PARTS.length;

/** The paid items' bounds (`FRESH_AVATAR_PRICE_MIN`, `_MAX`). */
export const AVATAR_PRICE_BOUNDS: [number, number] = [20, 100];

/**
 * How many of each trait's first options are free (`FRESH_AVATAR_FREE`, `docs/architecture/avatar-chain.md`): what a player is
 * (skin, hair, eyes, hair style, beard) and the plain gear (every outfit, the pauldrons, the accessories, the crown, the helmet
 * and the hood); the special headwear is paid.
 */
export const AVATAR_FREE: Record<Trait, number> = { skin: 5, hair: 5, eyes: 5, outfit: 5, pauldrons: 4, hairStyle: 3, beard: 5, headwear: 4, accessory: 4 };

/** The winter season's end in the mocks: the seasonal item (the Feathered cap) is on sale until then. */
export const WINTER_UNTIL = MOCK_NOW + 40 * DAY;

/** The paid items as the owner would list them: the Wizard hat at 40 Cobbles, the Feathered cap at 60 for the winter. */
const PAID: Partial<Record<Trait, Record<number, { cobbles: number; until?: number }>>> = { headwear: { 4: { cobbles: 40 }, 5: { cobbles: 60, until: WINTER_UNTIL } } };

/** Every trait's items, listed: id 0 to the last option the renderer draws. */
export const AVATAR_ITEMS: AvatarItem[][] = TRAIT_PARTS.map((trait, part) =>
  TRAIT_OPTIONS[trait].map((_, id) => {
    const paid = id < AVATAR_FREE[trait] ? undefined : (PAID[trait]?.[id] ?? { cobbles: AVATAR_PRICE_BOUNDS[0] });
    return { part, id, state: 1, cobbles: paid?.cobbles ?? 0, sold: 0, supply: 0, until: paid?.until ?? 0 };
  }),
);

/** An owned bitmap of these ids. */
export const ownedIds = (...ids: number[]): bigint => ids.reduce((word, id) => word | (1n << BigInt(id)), 0n);

/** A player who bought an item: the Wizard hat (headwear 4). */
export const AVATAR_OWNED: bigint[] = TRAIT_PARTS.map((trait) => (trait === "headwear" ? ownedIds(4) : 0n));

/** The look the stories' player saved: tan skin, blond hair, blue eyes, a purple outfit, a long beard, glasses, and the Wizard hat they bought. */
export const SAVED_AVATAR: TraitIds = { ...KING_IDS, skin: 2, hair: 2, eyes: 1, outfit: 3, beard: 4, headwear: 4, accessory: 2 };

/** The same as the chain stores it (`encodeTraits`): what the menus' avatar takes. */
export const SAVED_LOOK: bigint = lookOf(SAVED_AVATAR);

/**
 * A look for a player of the mocks who saved none (#834: the battle logs' rivals show faces, not initials): every trait drawn
 * from a random seeded by the address (FNV-1a), so a rival keeps one face at every load.
 */
export function generatedLook(address: string): bigint {
  let hash = 0x811c9dc5;
  for (const c of address.toLowerCase()) hash = Math.imul(hash ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return encodeTraits(randomTraits(seededRandom(hash)));
}

/** The catalogue as the creator reads it for the stories' player: owned first, then free, on sale; a trait not in `parts` is left out. */
export function offersOf(items: readonly AvatarItem[][], owned: readonly bigint[], parts: number = AVATAR_PARTS_IN_USE): AvatarOffers {
  return Object.fromEntries(
    TRAIT_PARTS.slice(0, parts).map((trait, part) => [
      trait,
      TRAIT_OPTIONS[trait].map((_, id): AvatarOffer => {
        const item = items[part]?.[id];
        if (((owned[part] ?? 0n) >> BigInt(id)) & 1n) return { kind: "owned" };
        if (!item || item.state !== 1) return { kind: "off" };
        return item.cobbles === 0 ? { kind: "free" } : { kind: "sale", cobbles: item.cobbles, until: item.until };
      }),
    ]),
  );
}

/** The stories' offers: the catalogue above, the player's items, and the Earrings (accessory 3) withdrawn (not for sale). */
export const AVATAR_OFFERS: AvatarOffers = offersOf(
  AVATAR_ITEMS.map((items, part) => (TRAIT_PARTS[part] === "accessory" ? items.map((item) => (item.id === 3 ? { ...item, state: 2 } : item)) : items)),
  AVATAR_OWNED,
);
