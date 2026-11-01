// The avatar on chain (#627, `docs/architecture/avatar-chain.md`): the `Avatar` system holds the catalogue of avatar items
// (a part and an item id, priced in Cobbles by the owner, 0 for the free base set, with optional limits in quantity and
// time), what each player owns (one bitmap per part), and each player's look in the client's format (AVATAR-LIVING,
// `@paved/renderer`'s `avatar-look.ts`): one u128, the format's version in byte 0, the item id of part `p` in byte `p + 1`.
// The parts in use are a count the owner sets, which only grows. The views are read here; the writes and their typed
// refusals are the writer's (`PavedWriter.buyAvatarItem`, `PavedWriter.setAvatar`).

/** The states of an item (`AvatarItem.state`): never listed, listed (on sale, or free), withdrawn from sale. */
export const AVATAR_UNLISTED = 0;
export const AVATAR_LISTED = 1;
export const AVATAR_WITHDRAWN = 2;

/** The version of the look's format (byte 0), the most parts a look holds, and the highest item id (one byte). */
export const AVATAR_FORMAT_VERSION = 1;
export const AVATAR_MAX_PARTS = 15;
export const AVATAR_MAX_ID = 255;

/** An item of the catalogue as `Avatar.item(part, id)` returns it. */
export interface AvatarItem {
  part: number;
  id: number;
  state: number;
  /** The price in Cobbles; 0: free (when listed). */
  cobbles: number;
  /** The copies sold so far. */
  sold: number;
  /** The most copies sold; 0: no limit. */
  supply: number;
  /** The block time sales stop at, in seconds (a seasonal item's end); 0: no end. */
  until: number;
}

/** True when anyone may use the item with no purchase: listed and free. */
export const isFreeItem = (item: AvatarItem): boolean => item.state === AVATAR_LISTED && item.cobbles === 0;

/** True when the item can be bought at `now` (seconds): listed, paid, not sold out, not past its end. */
export function isOnSale(item: AvatarItem, now: number): boolean {
  return (
    item.state === AVATAR_LISTED &&
    item.cobbles > 0 &&
    (item.supply === 0 || item.sold < item.supply) &&
    (item.until === 0 || now < item.until)
  );
}

/** Bit `id` of an owned bitmap: the item is owned. */
export const ownsItem = (owned: bigint, id: number): boolean => ((owned >> BigInt(id)) & 1n) === 1n;

/** The item id of each of the first `parts` parts of a look, part 0 first; null for 0 (no avatar), another version, or a byte past the parts. */
export function lookIds(look: bigint, parts: number): number[] | null {
  if (look < 0n || (look & 0xffn) !== BigInt(AVATAR_FORMAT_VERSION)) return null;
  let rest = look >> 8n;
  const ids: number[] = [];
  for (let part = 0; part < parts; part++) {
    ids.push(Number(rest & 0xffn));
    rest >>= 8n;
  }
  return rest === 0n ? ids : null;
}

/** The look of one item id per part, part 0 first (at most 15, each 0 to 255; another throws). */
export function lookOf(ids: readonly number[]): bigint {
  if (ids.length > AVATAR_MAX_PARTS) throw new RangeError(`${ids.length} parts, at most ${AVATAR_MAX_PARTS}`);
  let look = BigInt(AVATAR_FORMAT_VERSION);
  ids.forEach((id, part) => {
    if (!Number.isInteger(id) || id < 0 || id > AVATAR_MAX_ID) throw new RangeError(`item ${id} of part ${part} is not a byte`);
    look |= BigInt(id) << BigInt(8 * (part + 1));
  });
  return look;
}

/**
 * Whether a player may set a look, as `set_avatar` checks it: 0 always (it clears the avatar); any other must be of the
 * format's version with no byte past the parts in use, and each of its items be listed and free, or owned. `item(part, id)`
 * and `owned(part)` answer from what was read.
 */
export function canSetLook(
  look: bigint,
  parts: number,
  item: (part: number, id: number) => AvatarItem | undefined,
  owned: (part: number) => bigint,
): boolean {
  if (look === 0n) return true;
  const ids = lookIds(look, parts);
  if (!ids) return false;
  return ids.every((id, part) => {
    const found = item(part, id);
    return (found !== undefined && isFreeItem(found)) || ownsItem(owned(part), id);
  });
}

/**
 * The reads of the avatar on `Avatar`. `RpcGameViews` implements them (a `not-configured` `ViewError` without an Avatar
 * address) and `FakeGameViews` answers them in memory.
 */
export interface AvatarViews {
  /** `parts()`: the number of parts in use; 0 before the owner sets it. */
  avatarParts(): Promise<number>;
  /** `price_bounds()`: the bounds of a paid item's price, `[0, 0]` before the owner sets them. */
  avatarPriceBounds(): Promise<[number, number]>;
  /** `item(part, id)`. */
  avatarItem(part: number, id: number): Promise<AvatarItem>;
  /** `items(part)`: the items of a part, id 0 up to the highest ever listed. */
  avatarItems(part: number): Promise<AvatarItem[]>;
  /** `owned(player_id, part)`: bit `id` is item `id`, owned (a u256). */
  ownedAvatarItems(playerId: string, part: number): Promise<bigint>;
  /** `avatar(player_id)`: any player's look; 0n: none set. */
  avatar(playerId: string): Promise<bigint>;
}

/** The decoded `AvatarItem` struct of the ABI, with its key. */
export function avatarItem(part: number, id: number, raw: Record<string, unknown>): AvatarItem {
  return {
    part,
    id,
    state: Number(raw.state),
    cobbles: Number(raw.cobbles),
    sold: Number(raw.sold),
    supply: Number(raw.supply),
    until: Number(raw.until),
  };
}

/** An item never listed. */
export const unlistedItem = (part: number, id: number): AvatarItem => ({
  part,
  id,
  state: AVATAR_UNLISTED,
  cobbles: 0,
  sold: 0,
  supply: 0,
  until: 0,
});

/** The avatar side of `FakeGameViews`: the parts in use, the bounds, the catalogue by `part:id`, and each player's look and items. */
export interface FakeAvatarState {
  parts: number;
  bounds: [number, number];
  items: Map<string, AvatarItem>;
  /** By player (`BigInt` of the id as a string): the look and the owned bitmap of each part. */
  players: Map<string, { look: bigint; owned: Map<number, bigint> }>;
}
