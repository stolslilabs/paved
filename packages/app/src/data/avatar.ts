import { useQueries } from "@tanstack/react-query";
import type { AvatarViews, GameViews } from "@paved/chain";
import { addressKey } from "./keys";
import { useDataSources } from "./sources";

// The avatar on chain (#627, `docs/architecture/avatar-chain.md`): any player's avatar (the menus, #624), read from `Avatar`'s
// views (`AvatarViews`). This module is on the menus' first load: the creator's catalogue and writes (#626 PR 2) are
// `avatar-catalogue.ts`, in the creator's chunk. Nothing polls. A network without `Avatar` answers null (its views are `not-configured`): no avatar there yet. A look
// is the traits' value (`@paved/renderer`'s `encodeTraits` and `decodeTraits` turn it into the traits the avatar draws).

/** The keys of the avatar's reads, `[domain, read, ...args]` as `keys.ts`'s. Read from the chain. A look is a decimal string in the cache. */
export const avatarKeys = {
  /** `parts()`. */
  parts: ["chain", "avatar", "parts"] as const,
  /** `price_bounds()`. */
  bounds: ["chain", "avatar", "bounds"] as const,
  /** `items(part)`. */
  items: (part: number) => ["chain", "avatar", "items", part] as const,
  /** `owned(player_id, part)`. */
  owned: (playerId: string, part: number) => ["chain", "avatar", "owned", addressKey(playerId), part] as const,
  /** `avatar(player_id)`. */
  look: (playerId: string) => ["chain", "avatar", "look", addressKey(playerId)] as const,
  /** Every read of the avatar: what a write's receipt invalidates. */
  all: ["chain", "avatar"] as const,
};

/** The sources' avatar views, or null (a views double without them). Probed as `skinViews` is. */
export function avatarViews(views: GameViews): AvatarViews | null {
  const v = views as GameViews & Partial<AvatarViews>;
  return typeof v.avatar === "function" && typeof v.avatarParts === "function" && typeof v.avatarItems === "function" && typeof v.ownedAvatarItems === "function"
    ? (v as AvatarViews)
    : null;
}

/** A `ViewError` of kind `not-configured`, read by shape: the deployment has no `Avatar`. */
const notConfigured = (error: unknown): boolean => (error as { kind?: unknown } | null)?.kind === "not-configured";

/** A read that answers null where the deployment has no `Avatar`, and throws any other error. */
export async function orNone<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (notConfigured(error)) return null;
    throw error;
  }
}

/**
 * The item id of each of the first `parts` parts of a look, part 0 first; null for 0, another version or a byte past the
 * parts. `@paved/chain`'s `lookIds`, here because a value import of the chain would bring starknet.js into the page's chunk
 * (a test checks the two agree).
 */
export function idsOf(look: bigint, parts: number): number[] | null {
  if (look < 0n || (look & 0xffn) !== 1n) return null;
  let rest = look >> 8n;
  const ids: number[] = [];
  for (let part = 0; part < parts; part++) {
    ids.push(Number(rest & 0xffn));
    rest >>= 8n;
  }
  return rest === 0n ? ids : null;
}

/** A player's avatar as the menus show it: the look, and the item id of each part in use (null: none set, or a look the chain would not take). */
export interface AvatarData {
  look: bigint;
  ids: number[] | null;
}

/**
 * Any player's avatar (the menus' avatar, #624; another player's, later): the look and its item ids. `look` 0n is no avatar
 * set (the client's default). Null on a network without `Avatar`; disabled without a player.
 */
export function useAvatar(playerId: string | null): { data: AvatarData | null | undefined; isPending: boolean; error: Error | null } {
  const { views } = useDataSources();
  const avatar = avatarViews(views);
  const id = playerId ?? "0x0";
  const enabled = playerId !== null && avatar !== null;
  return useQueries({
    queries: [
      { queryKey: avatarKeys.look(id), queryFn: () => orNone(async () => String(await avatar!.avatar(id))), enabled },
      { queryKey: avatarKeys.parts, queryFn: () => orNone(() => avatar!.avatarParts()), enabled },
    ],
    combine: ([look, parts]) => {
      if (playerId !== null && !enabled) return { data: null, isPending: false, error: null };
      const ready = look.data !== undefined && parts.data !== undefined;
      const error = look.error ?? parts.error ?? null;
      const data = !ready ? undefined : look.data === null || parts.data === null ? null : avatarData(BigInt(look.data), parts.data);
      // A failed read ends the wait: pending only while nothing failed.
      return { data, isPending: !ready && !error, error };
    },
  });
}

const avatarData = (look: bigint, parts: number): AvatarData => ({ look, ids: look === 0n ? null : idsOf(look, parts) });

/**
 * The look a player saved, as the menus draw it (#626): null for none saved, a look the chain would not take, or nothing read
 * yet (the default avatar). A number, not the decoded avatar: decoding is the renderer's, which the menus' first load does not
 * take (the still's chunk decodes it, `elements/saved-avatar.tsx`).
 */
export function savedLook(data: AvatarData | null | undefined): bigint | null {
  return data && data.ids !== null ? data.look : null;
}
