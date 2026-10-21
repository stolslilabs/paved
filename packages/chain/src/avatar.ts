// The avatar on chain (#627, `docs/architecture/avatar-chain.md`): the `Avatar` system holds the catalogue of avatar items
// (a part category and an item id, priced in Cobbles by the owner, 0 for the free base set, with optional limits in quantity
// and time), what each player owns (one bitmap per category), and each player's look: one felt, one item id per category,
// read through the owner's layout (the width in bits of each category, category 0 in the lowest bits). The views are read
// here; the writes and their typed refusals are the writer's (`PavedWriter.buyAvatarItem`, `PavedWriter.setAvatar`).

/** The states of an item (`AvatarItem.state`): never listed, listed (on sale, or free), withdrawn from sale. */
export const AVATAR_UNLISTED = 0;
export const AVATAR_LISTED = 1;
export const AVATAR_WITHDRAWN = 2;

/** The most categories of a layout, and the widest category in bits (item ids 0 to 127). */
export const AVATAR_MAX_CATEGORIES = 30;
export const AVATAR_MAX_WIDTH = 7;

/** An item of the catalogue as `Avatar.item(category, id)` returns it. */
export interface AvatarItem {
  category: number;
  id: number;
  state: number;
  /** The price in Cobbles; 0: free (when listed). */
  cobbles: number;
  /** The copies sold so far. */
  sold: number;
  /** The most copies sold; 0: no limit. */
  supply: number;
  /** The block time sales stop at, in seconds; 0: no end. */
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

/** True for a layout the contract accepts: 1 to 30 categories, each 1 to 7 bits wide. */
export function isLayout(widths: readonly number[]): boolean {
  return (
    widths.length >= 1 &&
    widths.length <= AVATAR_MAX_CATEGORIES &&
    widths.every((w) => Number.isInteger(w) && w >= 1 && w <= AVATAR_MAX_WIDTH)
  );
}

/** The item id of each category of a look, category 0 first; null when the look has a bit set above the layout. */
export function lookIds(look: bigint, widths: readonly number[]): number[] | null {
  let rest = look;
  const ids: number[] = [];
  for (const width of widths) {
    const unit = 1n << BigInt(width);
    ids.push(Number(rest % unit));
    rest /= unit;
  }
  return rest === 0n ? ids : null;
}

/** The look of one item id per category (category 0 in the lowest bits); an id wider than its category throws. */
export function lookOf(ids: readonly number[], widths: readonly number[]): bigint {
  if (ids.length !== widths.length) throw new RangeError(`${ids.length} ids for ${widths.length} categories`);
  let look = 0n;
  let shift = 0n;
  ids.forEach((id, i) => {
    const width = BigInt(widths[i]!);
    if (!Number.isInteger(id) || id < 0 || BigInt(id) >= 1n << width) throw new RangeError(`item ${id} does not fit category ${i}`);
    look |= BigInt(id) << shift;
    shift += width;
  });
  return look;
}

/**
 * Whether a player may set a look, as `set_avatar` checks it: 0 always (it clears the avatar); any other must fit the layout,
 * and each of its items be listed and free, or owned. `items(category, id)` and `owned(category)` answer from what was read.
 */
export function canSetLook(
  look: bigint,
  widths: readonly number[],
  item: (category: number, id: number) => AvatarItem | undefined,
  owned: (category: number) => bigint,
): boolean {
  if (look === 0n) return true;
  if (widths.length === 0) return false;
  const ids = lookIds(look, widths);
  if (!ids) return false;
  return ids.every((id, category) => {
    const found = item(category, id);
    return (found !== undefined && isFreeItem(found)) || ownsItem(owned(category), id);
  });
}

/**
 * The reads of the avatar on `Avatar`. `RpcGameViews` implements them (a `not-configured` `ViewError` without an Avatar
 * address) and `FakeGameViews` answers them in memory.
 */
export interface AvatarViews {
  /** `layout()`: the width in bits of each category, category 0 first; empty before the owner sets one. */
  avatarLayout(): Promise<number[]>;
  /** `price_bounds()`: the bounds of a paid item's price, `[0, 0]` before the owner sets them. */
  avatarPriceBounds(): Promise<[number, number]>;
  /** `item(category, id)`. */
  avatarItem(category: number, id: number): Promise<AvatarItem>;
  /** `items(category)`: every item of a category, id 0 first (2^width of them). */
  avatarItems(category: number): Promise<AvatarItem[]>;
  /** `owned(player_id, category)`: bit `id` is item `id`, owned. */
  ownedAvatarItems(playerId: string, category: number): Promise<bigint>;
  /** `avatar(player_id)`: any player's look; 0n: none set. */
  avatar(playerId: string): Promise<bigint>;
}

/** The decoded `AvatarItem` struct of the ABI, with its key. */
export function avatarItem(category: number, id: number, raw: Record<string, unknown>): AvatarItem {
  return {
    category,
    id,
    state: Number(raw.state),
    cobbles: Number(raw.cobbles),
    sold: Number(raw.sold),
    supply: Number(raw.supply),
    until: Number(raw.until),
  };
}

/** An item never listed. */
export const unlistedItem = (category: number, id: number): AvatarItem => ({
  category,
  id,
  state: AVATAR_UNLISTED,
  cobbles: 0,
  sold: 0,
  supply: 0,
  until: 0,
});

/** The avatar side of `FakeGameViews`: the layout, the bounds, the catalogue by `category:id`, and each player's look and items. */
export interface FakeAvatarState {
  layout: number[];
  bounds: [number, number];
  items: Map<string, AvatarItem>;
  /** By player (`BigInt` of the id as a string): the look and the owned bitmap of each category. */
  players: Map<string, { look: bigint; owned: Map<number, bigint> }>;
}
