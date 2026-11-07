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

// The player's name (PLAYER-RENAME, `contracts/src/avatar/name.cairo`): UTF-8 text of 3 to 15 characters held on `Avatar`, the
// owner's asks of 2026-11-07: the letters and digits of any script, single spaces and hyphens between them. Unique whatever its
// case (one player per key, the case of Latin, Greek and Cyrillic folded). The player renames itself (`PavedWriter.rename`): its
// first change is free, every later one costs the owner's rename price in Cobbles (`rename_price`, 50 at deployment), debited on
// `Setup`'s ledger in the same call. A player with no name there is shown by its Cartridge username (the indexer's, N1).
//
// `nameKey` is the contract's `name_key`, code point for code point (a test keeps them on the same vectors): what the chain takes.
// `isPlayerName` adds what the client checks on top: Unicode's letters, marks and numbers only, in composed form (NFC).

/** The fewest and the most characters (code points) of a name. */
export const NAME_MIN = 3;
export const NAME_MAX = 15;

const SPACE = 0x20;
const HYPHEN = 0x2d;
/** The scripts whose letters look alike, one bit each: a name holds letters of one of them at most. */
const LATIN = 1;
const GREEK = 2;
const CYRILLIC = 4;

/** Whether a character other than the space and the hyphen may be in a name, as the contract's `allowed`. */
export function allowedCode(code: number): boolean {
  if (code < 0x80) return (code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
  return !(
    code <= 0xbf ||
    code === 0xd7 ||
    code === 0xf7 ||
    (code >= 0x300 && code <= 0x36f) ||
    code === 0x61c ||
    code === 0x115f ||
    code === 0x1160 ||
    code === 0x17b4 ||
    code === 0x17b5 ||
    (code >= 0x180b && code <= 0x180f) ||
    code === 0x3164 ||
    code === 0xffa0 ||
    (code >= 0x2000 && code <= 0x2bff) ||
    (code >= 0x2e00 && code <= 0x2e7f) ||
    (code >= 0x3000 && code <= 0x3004) ||
    (code >= 0x3008 && code <= 0x303f) ||
    // Lone surrogates (a JavaScript string may hold one; UTF-8 cannot) and private use
    (code >= 0xd800 && code <= 0xf8ff) ||
    (code >= 0xfe00 && code <= 0xfe6f) ||
    (code >= 0xfeff && code <= 0xff65) ||
    (code >= 0xffe0 && code <= 0xffff) ||
    (code >= 0x1f000 && code <= 0x1fbff) ||
    code >= 0xe0000
  );
}

/** The script of a letter among Latin (1), Greek (2) and Cyrillic (4); 0 for another, or not a letter. As the contract's `script_of`. */
export function scriptOf(code: number): number {
  if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a) || (code >= 0xc0 && code <= 0x24f) || (code >= 0x1e00 && code <= 0x1eff)) return LATIN;
  if ((code >= 0x370 && code <= 0x3ff) || (code >= 0x1f00 && code <= 0x1fff)) return GREEK;
  if (code >= 0x400 && code <= 0x52f) return CYRILLIC;
  return 0;
}

/** A character's case folded for the key, as the contract's `fold`: ASCII, Latin-1, Latin Extended-A, Greek and Cyrillic capitals. */
export function foldCode(code: number): number {
  if (code >= 0x41 && code <= 0x5a) return code + 0x20;
  if (code >= 0xc0 && code <= 0xde && code !== 0xd7) return code + 0x20;
  if (code >= 0x100 && code <= 0x17f) {
    if (code === 0x178) return 0xff;
    const even = code % 2 === 0;
    if (code <= 0x137 || (code >= 0x14a && code <= 0x177)) return even ? code + 1 : code;
    if ((code >= 0x139 && code <= 0x148) || (code >= 0x179 && code <= 0x17e)) return even ? code : code + 1;
    return code;
  }
  if (code >= 0x391 && code <= 0x3a9 && code !== 0x3a2) return code + 0x20;
  if (code >= 0x410 && code <= 0x42f) return code + 0x20;
  if (code >= 0x400 && code <= 0x40f) return code + 0x50;
  return code;
}

/**
 * The key of a name the contract takes (`name_key`), as text: its characters, their case folded; null for any other text (fewer
 * than 3 or more than 15 characters, a sign, a separator first, last or doubled, an invisible character, mixed lookalike scripts).
 * Two names of one key are the same name.
 */
export function nameKey(name: string): string | null {
  const codes = Array.from(name, (c) => c.codePointAt(0)!);
  if (codes.length < NAME_MIN || codes.length > NAME_MAX) return null;
  let afterSeparator = true;
  let scripts = 0;
  for (const code of codes) {
    if (code === SPACE || code === HYPHEN) {
      if (afterSeparator) return null;
      afterSeparator = true;
    } else {
      if (!allowedCode(code)) return null;
      afterSeparator = false;
      scripts |= scriptOf(code);
    }
  }
  if (afterSeparator) return null;
  if (scripts !== 0 && scripts !== LATIN && scripts !== GREEK && scripts !== CYRILLIC) return null;
  return String.fromCodePoint(...codes.map(foldCode));
}

/** Unicode's letters, marks and numbers, and the space and the hyphen: what the client lets a name hold. */
const LETTERS = /^[\p{L}\p{M}\p{N} -]*$/u;

/** A name as typed, made what the client sends: composed (NFC), its ends trimmed. */
export const normalizeName = (typed: string): string => typed.normalize("NFC").trim();

/** True when `name` is a name the client sends: the contract takes it (`nameKey`), its characters are letters, marks, numbers and separators, composed. */
export const isPlayerName = (name: string): boolean => nameKey(name) !== null && LETTERS.test(name) && name === name.normalize("NFC");

/** What the next rename costs, in Cobbles: the first (`count` 0) is free, a later one the rename price (0: none set). */
export const renameCost = (count: number, price: number): number => (count === 0 ? 0 : price);

/**
 * The reads of the name on `Avatar`. `RpcGameViews` implements them (a `not-configured` `ViewError` without an Avatar address)
 * and `FakeGameViews` answers them in memory.
 */
export interface NameViews {
  /** `name(player_id)`: the player's name (a `ByteArray`); null: none set (its Cartridge username is shown). */
  playerName(playerId: string): Promise<string | null>;
  /** `renames(player_id)`: the changes the player has made; 0: its next is free. */
  renameCount(playerId: string): Promise<number>;
  /** `rename_price()`: the Cobbles of a rename after the first; 0: not set (only a first change). */
  renamePrice(): Promise<number>;
  /** `name_owner(name)`: the player holding `name` in any case, as a hex address; null: free (or not a name). */
  nameOwner(name: string): Promise<string | null>;
}

/** The name side of `FakeGameViews`: the rename price and, by player (`BigInt` of the id as a string), the name and the count. */
export interface FakeNameState {
  price: number;
  players: Map<string, { name: string | null; count: number }>;
}
