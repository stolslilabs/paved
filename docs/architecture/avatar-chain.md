# The avatar on chain and its cosmetics (#627)

The owner's decisions of 2026-10-20 bind: **the avatar a player chooses is stored on chain** (the same on every device,
visible to others later), and **avatar parts are bought with Cobbles**. Their answers to the design's open points (#627,
2026-10-20): **items 0 to 3 of every part are free** (replaced on 2026-10-31 by free items set per trait, below), the rest paid;
**paid items cost 20 to 100 Cobbles each**, the bounds
and prices owner-set and rebalanced later; **rare items are seasonal** (summer, autumn, winter, spring: on sale during their
season, with an end `until`), no quantity limit at launch, the mechanism kept for events. The Overseer's ruling: a separate
`Avatar` system, the Cobbles debited through one `Setup` entry, `Setup` under its CASM review point (P-64, 50 %), no
hard-coded prices. No deployment in this task: the owner lists the paid items with their art and seasons later.

## 1. Summary

- **A new system, `Avatar`**, keeps each player's avatar and owns the catalogue through a component. It is ownable and
  upgradeable like `Story` and `Setup`.
- **The Cobbles stay on `Setup`'s one ledger** (`accounts`). `Avatar` debits them through `Setup`'s existing
  `ISetupSpend::spend_cobbles` (#639), as an allowlisted spender (`Setup.set_spender(Avatar, true)`), with the reason
  `'AVATAR_ITEM'`. No second ledger, no transfer, and **`Setup` is unchanged**: its class is the same to the felt as main's.
- **The avatar's value is the client's look** (AVATAR-LIVING, `packages/renderer/src/core/avatar/avatar-look.ts`; AVATAR-LOOK's
  format of #626 PR 1 until 2026-10-31): one `u128`, byte 0 the format's version (1), byte `p + 1` the item id of part `p`,
  the client's traits (0 skin, 1 hair colour, 2 eyes, 3 outfit, 4 pauldrons, 5 hair style, 6 beard, 7 headwear,
  8 accessory), the bytes past them 0. The contract never reads what a part means. A trait took the byte of the old part
  closest to it (skin, hair colour, eyes, hair, beard, headwear and accessory kept theirs; the outfit and the pauldrons took
  the eyebrows' and the mouth's; the background's byte stays 0), so a look saved before is read as traits, an id past a
  trait's options as its first. The look the renderer's `encodeTraits` returns is the value `set_avatar` takes, and
  `decodeTraits` reads what `avatar` returns.
- **The free items, per trait** (2026-10-31, the owner's go to set them as is standard): each trait's first options, every
  option of what a player is (skin, hair colour, eyes, hair style, beard), the plain gear (the first outfits, pauldrons and
  accessories; the crown, none, the helmet and the hood of the headwear) and the village of the backdrops. No skin tone is
  ever paid. `scripts/deploy.sh` lists them (`FRESH_AVATAR_FREE`, the first items of each part), the mocks the same
  (`packages/app/src/mocks/avatar.ts`, a test keeps the two equal).
- **The paid items** (2026-11-01, the owner's ask for more Cobble items, priced by rarity: common 20, rare 40, epic 60,
  legendary 100 Cobbles; the creator shows the rarity beside a tried item's name). Every option past a trait's free ones, as
  the owner lists them (`set_item part id cobbles 0 until`); a seasonal one with its season's end (`until`), the others 0. The
  mocks list the same (a test keeps every paid price on a tier). Part numbers are the look's bytes, ids the options' indices:

  | Part | Trait | Id | Item | Rarity | Cobbles | Season |
  |---|---|---|---|---|---|---|
  | 1 | hair colour | 5 | White | rare | 40 | |
  | 1 | hair colour | 6 | Blue | rare | 40 | |
  | 2 | eyes | 5 | Ember | epic | 60 | |
  | 3 | outfit | 5 | Royal (crimson, gold collar, ruby brooch) | epic | 60 | |
  | 3 | outfit | 6 | Ermine (wine, white fur collar) | legendary | 100 | |
  | 3 | outfit | 7 | Plate armour (steel breastplate) | epic | 60 | |
  | 4 | pauldrons | 4 | Spiked | rare | 40 | |
  | 4 | pauldrons | 5 | Dragon scale | legendary | 100 | |
  | 7 | headwear | 4 | Wizard hat | rare | 40 | |
  | 7 | headwear | 5 | Feathered cap | epic | 60 | winter |
  | 7 | headwear | 6 | Viking helm | epic | 60 | |
  | 7 | headwear | 7 | Tricorn | rare | 40 | |
  | 7 | headwear | 8 | Laurel wreath | rare | 40 | |
  | 7 | headwear | 9 | Jester hat | epic | 60 | |
  | 7 | headwear | 10 | Top hat | legendary | 100 | |
  | 8 | accessory | 4 | Monocle | rare | 40 | |
  | 8 | accessory | 5 | Pipe | common | 20 | |
  | 8 | accessory | 6 | War paint | common | 20 | |
  | 8 | accessory | 7 | Medal | epic | 60 | |
  | 9 | backdrop | 1 | Fields | common | 20 | |
  | 9 | backdrop | 2 | Forest | common | 20 | |
  | 9 | backdrop | 3 | Mountains | common | 20 | |
  | 9 | backdrop | 4 | River | common | 20 | |
  | 9 | backdrop | 5 | Castle | rare | 40 | |
  | 9 | backdrop | 6 | Night | epic | 60 | winter |
  | 9 | backdrop | 7 | Wonder | legendary | 100 | |

  Every item went through the client's checks (`packages/renderer/__tests__/avatar-traits.test.ts`: no faces in one plane,
  nothing into the head in any pose, the head in the badge's circle, each feature readable) and a render review.
- **The calls**: `set_parts`, `set_price_bounds`, `set_item`, `withdraw_item`, `set_setup` (owner); `buy_avatar_item`,
  `set_avatar` (any account, for itself); the views `avatar`, `owned`, `item`, `items`, `parts`, `price_bounds`, `setup`.

## 2. Scopes (the owner's credo, #639 point 5: more components with smaller scopes)

| Piece | Kind | Its one scope | Storage |
|---|---|---|---|
| `avatar::look` (`contracts/src/avatar/look.cairo`) | pure library | AVATAR-LOOK's format: a look's ids, a look from ids | none |
| `avatar::item` (`contracts/src/avatar/item.cairo`) | pure library | an item's settings and their packing in one slot | none |
| `CatalogueComponent` (`contracts/src/avatar/catalogue.cairo`) | component | the catalogue and what each player owns: price bounds, list, withdraw, record a purchase, "may use" | `price_min`, `price_max`, `items`, `item_ends`, `owned` |
| `Avatar` (`contracts/src/systems/avatar.cairo`) | system | the owner gate, the parts in use, each player's look, and the payment through `Setup` | `setup`, `parts`, `avatars` |

The component never moves Cobbles and never checks who calls: the system gates the owner's calls, checks a part against the
parts in use, and pays a purchase on `Setup` in the same transaction. Another system that sells cosmetics (a frame, a banner)
can embed the same component with its own payment.

## 3. The catalogue and the ownership

| Storage | Key | Value | Written by |
|---|---|---|---|
| `items` | `(part: u8, id: u8)` | one `felt252`: `state` [0, 8) (0 never listed, 1 listed, 2 withdrawn), `cobbles` u16 [8, 24) (0: free), `sold` u32 [32, 64), `supply` u32 [64, 96) (0: no limit), `until` u64 [128, 192) (0: no end) | `set_item`, `withdraw_item`, `buy_avatar_item` (`sold`) |
| `item_ends` | `part` | `u16`: one more than the highest id ever listed (the length of `items(part)`) | `set_item` |
| `owned` | `(player_id, part, half)` | `u128`: bit `id % 128` of half `id / 128`, set when the player bought item `id` (ids 0 to 255) | `buy_avatar_item` |
| `price_min`, `price_max` | | the bounds of a paid item's price (0, 0: not set, only free items can be listed) | `set_price_bounds` |
| `parts` (`Avatar`) | | the parts in use, 1 to 15, never fewer | `set_parts` |
| `avatars` (`Avatar`) | `player_id` | the player's look, `u128` (0: none set, the client draws its default) | `set_avatar` |

- **Free items** are listed with `cobbles` 0: every player may use them and nobody buys them (the base set: items 0 to 3).
- **Seasonal items** are listed with `until` the end of their season; the owner lists a season's items when it starts. A start
  time (`from`) is not built: listing at the season's start does the same at no cost. If the owner wants to schedule a
  season ahead, `from` fits in the item slot's free bits [96, 128) with no migration.
- **`supply`** (a quantity limit) is built and tested but not used at launch, kept for events.
- **What is bought stays owned**: withdrawing an item or changing its price stops or changes new sales only; nothing is
  refunded. A seasonal item bought stays usable after its season.

## 4. The look and the parts in use

`set_avatar(look)` stores `look` as given, after these checks: 0 clears the avatar with no check; any other must have the
version 1 in byte 0 and no byte set past the parts in use (`'Avatar: invalid look'`), and each part's item must be listed and
free, or owned (`'Avatar: item not owned'`).

- **The parts in use only grow** (`set_parts`, `'Avatar: invalid parts'` otherwise): a new part takes the next byte, which an
  older look leaves at 0, read as item 0, the free default of every part. A stored look keeps its meaning with no rewrite.
- **A wider id or another packing is a new version** of the format: a class upgrade then reads both.
- **A free item later made paid**: a stored avatar keeps it (`set_avatar` checks at the time of the call only); the player
  must buy it to select it again. A withdrawn free item is no longer free.

## 5. The calls and their events

| Call | Who | Checks | Effects | Event |
|---|---|---|---|---|
| `set_parts(parts)` | owner | 1 to 15, not fewer than now | `parts` | `PartsSet` |
| `set_price_bounds(min, max)` | owner | 1 <= `min` <= `max` | the bounds | `PriceBoundsSet` |
| `set_item(part, id, cobbles, supply, until)` | owner | `part` in use, `cobbles` 0 or within the bounds | the item listed (or relisted), `sold` kept | `AvatarItemListed` |
| `withdraw_item(part, id)` | owner | listed | `state` 2 | `AvatarItemListed` (state 2) |
| `buy_avatar_item(part, id, max_cobbles)` | the player, for itself | listed, `cobbles` != 0, `sold` < `supply` (if set), block time < `until` (if set), not owned, `cobbles` <= `max_cobbles` (`'Avatar: price above max'`) | owned bit set, `sold` + 1, then `Setup.spend_cobbles` (reverts the whole purchase on a short balance) | `AvatarItemBought`; `Setup`'s `CobblesSpent` |
| `set_avatar(look)` | the player, for itself | section 4 | `avatars` written | `AvatarSet` |
| `set_setup(setup)` | owner | not zero | `setup` | `SetupSet` |

`AvatarItemBought` carries `player_id` (key), `part`, `id`, `cobbles`, `sold` and `balance` (the Cobbles after it), so a client
reading `Avatar` alone needs no join; `CobblesSpent` (`spender` Avatar, `reason` `'AVATAR_ITEM'`) keeps the indexer's ledger
whole from `Setup`'s events alone, as it does for the matchmaker and the village.

## 6. Client, deployment, tests

- **`@paved/chain`** (`packages/chain/src/avatar.ts`, `views.ts`, `writer.ts`): the views `avatarParts`, `avatarPriceBounds`,
  `avatarItem`, `avatarItems`, `ownedAvatarItems` (a u256) and `avatar` on `RpcGameViews` and `FakeGameViews`; the writes
  `buyAvatarItem` (the price read again inside the send: `AvatarPriceChangedError`) and `setAvatar`, their typed refusals
  (`AvatarRefusedError`), the session policies; `lookOf`, `lookIds` and `canSetLook`, the contract's rules in TypeScript. An
  `Avatar` address is optional in a deployment.
- **The indexer**: nothing new. `CobblesSpent` is already decoded into the Cobbles ledger (since #639); `Avatar`'s own events
  are not indexed yet (the creator and the menus read the views).
- **Data hooks** (`packages/app/src/data/avatar.ts`): `useAvatar(player)` (the menus, #624: the look and its ids),
  `useAvatarCatalogue(player)` (the creator, #626 PR 2: the parts, the bounds, every part's items, the player's owned bitmaps,
  the look and the balance) and `useAvatarWrites(player)` (`buy`, `save`, receipts into the cache). The creator turns a look
  into item ids with `decodeTraits`, and back with `encodeTraits`. The mock data source has no `Avatar`: the
  hooks answer null there.
- **Deployment** (`scripts/deploy.sh`, not run in this task): declare and deploy `Avatar(owner, Setup)`,
  `Setup.set_spender(Avatar, true)` in the wiring, then the defaults (`FRESH_AVATAR_*`: ten parts, the traits; bounds 20 to
  100; the free items of each trait, `FRESH_AVATAR_FREE`) in one multicall, read back. A rerun sends only what a deployment
  lacks: the free items the traits added. No paid item is listed by the script (the table above is the owner's to list).
- **Tests** (snforge): `paved::tests::avatar::` (the format's vectors, shared with `packages/chain/test/avatar.test.ts`, the
  parts, the bounds, a purchase once and never twice, Cobbles never below zero, `set_avatar` never accepting a part neither
  free nor owned, the version and the bytes past the parts, `supply` and `until`, only an allowlisted spender spends, a fuzz
  of buys and sets); the gas in `contracts/tests/gas.cairo`, z27 to z31.

## 7. Size and gas

- **CASM** (`scripts/class-sizes.sh`, release, scarb 2.20.1, VPS, 2026-10-21): `Avatar` 4,027 Sierra, 10,091 CASM felts,
  12.3 % of the Starknet cap, 63,637 under the P-44 cap of a class (73,728). `Setup` 43,431 (53.0 %), unchanged from main.
  The hand-over's version (one class, a layout of widths) was 11,318.
- **Gas** (`contracts/tests/gas.cairo`, the test profile, measured in CI; `docs/measures/baseline.md`, "After AVATAR-CHAIN"):
  `set_item` 704,759; `buy_avatar_item` 1,191,653 (`Setup.spend_cobbles` and the confirmed-price check included); `set_avatar` 1,357,620 with ten free
  parts and 2,466,150 with ten owned parts; the `items` view of 17 items 2,393,093.

## 8. Audit (correctness and security, the Cobbles path)

- **Who spends whose Cobbles.** `Setup.spend_cobbles` trusts an allowlisted spender for whom it debits. `Avatar` debits only
  its caller (`get_caller_address()` as `player_id`, never an argument), only an item's listed price, and only for an item
  not already owned: one purchase, one debit. The allowlist is the owner's (`set_spender`); removing `Avatar` stops every
  purchase (tested) and leaves what is owned. An upgrade of `Avatar` to a class that spends for anyone is the owner's power
  already (P-42: the owner may replace any class).
- **Checks, effects, interaction.** `buy_avatar_item` checks everything, writes the owned bit and `sold`, then calls
  `Setup`, which calls nothing back: no re-entry. A short balance reverts the whole transaction, so nothing is recorded
  without the debit (tested: the bit, `sold` and the balance unchanged).
- **Cobbles never below zero**: `Setup` refuses a debit above the balance (`'Setup: not enough cobbles'`); exactly the price
  takes it to 0 (tested).
- **The price the player confirmed is a maximum.** The creator shows a price, the writer reads it again before sending,
  and the call carries it as `max_cobbles`: an owner's relisting at a higher price between the player's read and the
  purchase reverts the whole call (tested: nothing debited, nothing recorded), so a player is never charged more than they
  confirmed. A lower price is charged as it is.
- **Price bounds**: a paid price is within the owner's bounds when listed; narrowing the bounds later keeps the prices listed
  (the owner relists to change them). A price is a `u16` and `spend_cobbles` takes a `u32`: no truncation.
- **`sold` against `supply`**: `sold < supply` is checked before `sold + 1`; relisting keeps `sold`, so a lower `supply`
  closes the sale. `sold` is a `u32`: with no limit, a purchase would revert (never wrap) only after 4,294,967,295 sales.
- **The bit arithmetic**: an id is a `u8`; its half is `id / 128` (0 or 1) and its bit `2^(id % 128)`, at most `2^127`, within a
  `u128`. The look is a `u128` read by `DivRem` by 256: no felt or u256 arithmetic, no overflow. `look_of` is test-side only.
- **The parts in use only grow**, so no stored look gains a byte past the parts; a look's parts are each checked once.
- **The owner's setters** are gated by `OwnableComponent` (tested for each); `set_setup` refuses zero.

## 9. The name (PLAYER-RENAME)

The owner's ask of 2026-11-07: a player renames themselves from their own profile, **the first change free, then 50 Cobbles a
change**. Until then no name was on chain: a player was shown by its Cartridge Controller username, which the indexer caches
(N1, display only).

- **Where.** In `Avatar`, the player's profile system, beside the look: its name and the count of its changes. The Cobbles
  of a paid change are debited through `Setup.spend_cobbles` (the reason `'RENAME'`), as an item's, inside the same call: a
  short balance reverts the whole rename. `Setup` is unchanged to the felt (51,026 CASM felts, 62.3 %): it is past P-64's 50 %
  review point, and `Avatar` already is an allowlisted spender.
- **The shape** (`contracts/src/avatar/name.cairo`, `name_key`; the owner's asks of 2026-11-07, second round): a `ByteArray` of
  UTF-8, 3 to 15 characters (code points; 60 bytes at most), within the name plate's 15. The letters and digits of any script
  (Latin with its accents, Chinese, Cyrillic, Arabic, Devanagari, ...), and single spaces and hyphens between words. The chain
  refuses what could hide a name or show nothing: invalid UTF-8; an ASCII sign; a space or a hyphen first, last or beside another;
  controls, the other spaces, zero-width and direction marks, fillers, punctuation, symbols, emoji, private use, fullwidth ASCII;
  the combining accents of Latin, Greek and Cyrillic (the client sends composed text, NFC); and Latin, Greek and Cyrillic letters
  mixed in one name (their lookalikes: "bаl7hazar" with a Cyrillic а). Which characters are letters (Unicode's letter, mark and
  number classes) is the client's to check (`isPlayerName`): the chain's list is coarser.
- **Unique, whatever its case.** `Avatar` keeps one player per key (`name_owners`), the poseidon hash of the name's characters
  with the case of ASCII, Latin-1, Latin Extended-A, Greek and Cyrillic folded: "Élodie" and "ÉLODIE" are one name. The key of a
  player's name is kept too (`name_keys`), so a rename frees it without reading the name again. A name a player leaves is free for
  others at once. A player may change the case of its own name (a change like another: it costs, after the first). The chain
  cannot read the Cartridge usernames: the client asks the indexer (`GET /v1/names/{name}`) before it sends, and refuses a name
  another player shows as its username. Not covered: two names of different scripts that look alike as a whole (an all-Cyrillic
  name drawn as a Latin one), and the case of the scripts not folded (Armenian, Georgian).
- **The price** is a stored value the owner sets (`set_rename_price`, not 0), as the catalogue's prices are: 50 at deployment
  (`FRESH_AVATAR_RENAME_PRICE` in `scripts/deploy.sh`). Without a price set, only a first change is possible
  (`'Avatar: rename not priced'`). The call carries the price the player confirmed (`max_cobbles`): an owner's change between
  the player's read and the rename never charges more.

| Call | Who | Checks | Effects | Event |
|---|---|---|---|---|
| `set_rename_price(cobbles)` | owner | not 0 (`'Avatar: invalid rename price'`) | `rename_price` | `RenamePriceSet` |
| `rename(name: ByteArray, max_cobbles)` | the player, for itself | `name_key` (`'Avatar: invalid name'`); not its current name (`'Avatar: same name'`, the name read only when the keys match); its key held by nobody or itself (`'Avatar: name taken'`); a later change priced (`'Avatar: rename not priced'`), at most `max_cobbles` (`'Avatar: price above max'`) | the key it left freed, the new key held and kept, the name, the count + 1, then `Setup.spend_cobbles` for a paid change (`'Setup: not enough cobbles'` reverts it all) | `Renamed`; `Setup`'s `CobblesSpent` when paid |

Views: `name(player_id)` (a `ByteArray`; empty: none set), `renames(player_id)`, `rename_price()`, `name_owner(name)` (the player
holding it in any case; 0: free, or not a name). `Renamed` carries `player_id` (key), `name` (a `ByteArray`), `cobbles` (0 for the
first) and `count`.

- **Client.** `@paved/chain`: `NameViews` (`playerName`, `renameCount`, `renamePrice`, `nameOwner`) on `RpcGameViews` and
  `FakeGameViews`, `PavedWriter.rename` (the name sent as a `ByteArray`, the codec's `byteArrayFelts`; the count, the price, the
  holder and the current name read again inside the send), its refusals (`RenameRefusedError`), a session policy; the rules
  (`nameKey`, the contract's `name_key` code point for code point; `isPlayerName`, with Unicode's letter classes and NFC;
  `normalizeName`). The indexer and the app hold copies of the rules, kept equal by their tests. The app: the profile's pencil
  opens the name's view in the Profile drawer (`containers/rename-view.tsx`), its reads and write `data/rename.ts`; the profile
  shows the name set on chain first (`usePlayerName`), else the indexer's, else the wallet's.
- **Indexer.** `Renamed` from an optional `avatar` source (its other events never fetched), table `renames` (schema 21): a
  name set on chain wins over the Cartridge username wherever a name is served. `docs/architecture/indexer.md`, "As built
  (PLAYER-RENAME)".
- **The mock** keeps the name in its ledger: the drawn name of a new player (#926) is not a change, so the first rename is free.
- **Tests**: `paved::tests::avatar::` (strict UTF-8; the shape's vectors in Chinese, accented Latin, Cyrillic, with spaces and
  hyphens; what could hide a name; the case folding; the price owner-only and never 0, the first change free, a later one
  debited, never above the confirmed price, refused without a price, invalid or the same name, one player per name in any case,
  a name left free at once, a fuzz of renames by two players); gas z44 (a first rename of 12 characters, 3,471,914) and z45 (a
  later one of 15 characters with spaces, paid, 4,628,636) in `contracts/tests/gas.cairo`: the UTF-8 check, the key's hash and
  the `ByteArray`'s storage. A rename is rare (a daily spawn is about 19 million).
- **Size**: `Avatar` 8,405 Sierra, 18,854 CASM felts (23.0 % of the Starknet cap), 54,874 under the P-44 cap (73,728); 10,201
  at the last measure (`class-headroom.md`, "After PVP-ATTACKS").
- **Audit.** `rename` debits only its caller, only the price after the first change, and only once per change: the count is
  written before the debit, in the same call. A player's key is kept (`name_keys`) and freed only when it is not the new one, so
  a player changing its own name's case never collides with itself. The UTF-8 is decoded strictly (no overlong form, no
  surrogate, nothing past U+10FFFF), and a name is at most 60 bytes, so its check is bounded.
