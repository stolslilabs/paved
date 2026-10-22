import type { AvatarItem } from "@paved/chain";
import { AVATAR_PARTS, AVATAR_PART_KEYS, DEFAULT_AVATAR, type Avatar } from "@paved/renderer";
import type { AvatarOffer, AvatarOffers } from "../components/containers/avatar-types";
import { DAY, MOCK_NOW } from "./clock";

// The avatar on chain in the mocks (#626 PR 2, #627): the catalogue as the owner's decisions of 2026-10-20 set it (items 0 to
// 3 of every part free, the others 20 to 100 Cobbles, seasonal items with an end), what a player owns, and their saved look.
// The stories' scenes and the mock data source (`data/mock/ledger.ts`) both read it.

/** The parts in use: AVATAR-LOOK's ten (`scripts/deploy.sh`'s `FRESH_AVATAR_PARTS`). */
export const AVATAR_PARTS_IN_USE = AVATAR_PART_KEYS.length;

/** The paid items' bounds (`FRESH_AVATAR_PRICE_MIN`, `_MAX`). */
export const AVATAR_PRICE_BOUNDS: [number, number] = [20, 100];

/** The free base set: items 0 to 3 of every part (`FRESH_AVATAR_FREE_IDS`). */
export const AVATAR_FREE_IDS = 4;

/** The winter season's end in the mocks: the seasonal backgrounds (Night, Wonder) are on sale until then. */
export const WINTER_UNTIL = MOCK_NOW + 40 * DAY;

/** A paid item's price: 20 for the first, 20 more each, at most 100. */
const priceOf = (id: number): number => Math.min(AVATAR_PRICE_BOUNDS[1], AVATAR_PRICE_BOUNDS[0] * (id - AVATAR_FREE_IDS + 1));

/** The seasonal items: the last two backgrounds (Night, Wonder), ending with the winter. */
const SEASONAL = new Set([`${AVATAR_PART_KEYS.indexOf("background")}:15`, `${AVATAR_PART_KEYS.indexOf("background")}:16`]);

/** Every part's items, listed: id 0 to the last variant the renderer draws. */
export const AVATAR_ITEMS: AvatarItem[][] = AVATAR_PART_KEYS.map((key, part) =>
  AVATAR_PARTS[key].map((_, id) => ({
    part,
    id,
    state: 1,
    cobbles: id < AVATAR_FREE_IDS ? 0 : priceOf(id),
    sold: 0,
    supply: 0,
    until: SEASONAL.has(`${part}:${id}`) ? WINTER_UNTIL : 0,
  })),
);

/** An owned bitmap of these ids. */
export const ownedIds = (...ids: number[]): bigint => ids.reduce((word, id) => word | (1n << BigInt(id)), 0n);

/** A player who bought a few items: the Crown and the Wizard hat (headwear 6, 7), the Monocle (accessory 3) and the City (background 12). */
export const AVATAR_OWNED: bigint[] = AVATAR_PART_KEYS.map((key) =>
  key === "headwear" ? ownedIds(6, 7) : key === "accessory" ? ownedIds(3) : key === "background" ? ownedIds(12) : 0n,
);

/** The avatar the stories' player saved: free parts, and the Crown and the City they bought. */
export const SAVED_AVATAR: Avatar = { ...DEFAULT_AVATAR, skin: 2, hairColour: 3, eyes: 0, eyebrows: 1, mouth: 2, hair: 3, beard: 1, headwear: 6, background: 12 };

/** The catalogue as the creator reads it for the stories' player: owned first, then free, on sale; a part not in `parts` is left out. */
export function offersOf(items: readonly AvatarItem[][], owned: readonly bigint[], parts: number = AVATAR_PARTS_IN_USE): AvatarOffers {
  return Object.fromEntries(
    AVATAR_PART_KEYS.slice(0, parts).map((key, part) => [
      key,
      AVATAR_PARTS[key].map((_, id): AvatarOffer => {
        const item = items[part]?.[id];
        if (((owned[part] ?? 0n) >> BigInt(id)) & 1n) return { kind: "owned" };
        if (!item || item.state !== 1) return { kind: "off" };
        return item.cobbles === 0 ? { kind: "free" } : { kind: "sale", cobbles: item.cobbles, until: item.until };
      }),
    ]),
  );
}

/** The stories' offers: the catalogue above, the player's items, and the Long beard (beard 5) withdrawn from sale. */
export const AVATAR_OFFERS: AvatarOffers = offersOf(
  AVATAR_ITEMS.map((items, part) => (AVATAR_PART_KEYS[part] === "beard" ? items.map((item) => (item.id === 5 ? { ...item, state: 2 } : item)) : items)),
  AVATAR_OWNED,
);
