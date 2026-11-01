import type { AvatarItem } from "@paved/chain";
import { TRAIT_OPTIONS, TRAIT_PARTS } from "@paved/renderer";
import type { AvatarOffer, AvatarOffers } from "../components/containers/avatar-types";
import type { AvatarCatalogue } from "./avatar-catalogue";

// The creator's offers (#626 PR 2), from the catalogue `useAvatarCatalogue` reads. A module of the creator's chunk: it takes
// the renderer's parts, which the menus' first load does not (`avatar.ts` stays free of the renderer's values).

// `AVATAR_LISTED` of `@paved/chain`: a literal, as `idsOf`, so the creator's chunk takes no value from the chain (starknet.js).
const LISTED = 1;

/** What one item is to the player at `now` (seconds): owned first (it stays theirs off sale), then free, on sale, or off. */
export function avatarOffer(item: AvatarItem | undefined, owned: bigint, id: number, now: number): AvatarOffer {
  if (((owned >> BigInt(id)) & 1n) === 1n) return { kind: "owned" };
  if (!item || item.state !== LISTED) return { kind: "off" };
  if (item.cobbles === 0) return { kind: "free" };
  const left = item.supply === 0 || item.sold < item.supply;
  const open = item.until === 0 || now < item.until;
  return left && open ? { kind: "sale", cobbles: item.cobbles, until: item.until } : { kind: "off" };
}

/**
 * The creator's offers (#626 PR 2): each part in use (the chain's count, at most the format's ten) and, for each variant
 * this client draws, what it is to the player at `now`; an item the chain lists past the drawn variants is left out.
 */
export function avatarOffers(catalogue: Pick<AvatarCatalogue, "parts" | "items" | "owned">, now: number): AvatarOffers {
  return Object.fromEntries(
    TRAIT_PARTS.slice(0, catalogue.parts).map((trait, p) => [
      trait,
      TRAIT_OPTIONS[trait].map((_, id) => avatarOffer(catalogue.items[p]?.[id], catalogue.owned[p] ?? 0n, id, now)),
    ]),
  );
}
