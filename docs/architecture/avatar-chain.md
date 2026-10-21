# The avatar on chain and its cosmetics (#627, design)

Track CORE's proposal for the PM and the owner, before any Cairo is written. The owner's decisions of 2026-10-20 bind: **the
avatar a player chooses is stored on chain** (the same on every device, visible to others later), and **avatar parts are bought
with Cobbles**. Everything else here is a proposal; section 7 lists what the owner decides before the paid parts are built.

The avatar's format comes from AVATAR-LOOK (#626, PR 1), not posted yet. This design stores the avatar as one `felt252` and
reads it through a layout table (categories, field widths) that is a parameter, so #626's format slots in without a storage
migration (section 3).

Every gas and size figure below is an **estimate**, from the measured unit costs of `cobbles-v1.md` (a storage read 76,840 L2
gas, a write 118,210, an event about 32,800) and the measured tile-skin calls (`buy_skin` 664,724, `set_skins` 456,713,
`set_skin_price` 302,510). The implementation measures each one.

## As built (skeleton, before the owner's values)

The Overseer's ruling (2026-10-20): a separate `Avatar` system, the Cobbles debited through one `Setup` entry
(`spend_cobbles`), as Story's precedent; the free base set, the price bounds and the limits are **parameters the owner
sets**, never hard-coded; the pull request stays a draft until the owner's three answers (section 7, points 1 to 3).

- **Code**: `contracts/src/systems/avatar.cairo` (`Avatar`), `ISetupSpend` in `contracts/src/systems/setup.cairo`, tests
  `contracts/src/tests/avatar.cairo`; `packages/chain/src/avatar.ts` (packing, views, writes in `writer.ts`), the indexer's
  `CobblesSpent` (schema 17), the data hooks `packages/app/src/data/avatar.ts`.
- **Nothing is hard-coded but the packing.** The layout (`set_layout`: the width of each category, 1 to 7 bits, 1 to 30
  categories, which may only grow), the price bounds (`set_price_bounds`), each item's price (0: free, the base set),
  `supply` and `until` (`set_item`) are the owner's calls. Until the owner sets bounds, only free items can be listed.
- **Placeholders** (no value is deployed: `scripts/deploy.sh` does not deploy `Avatar` yet, and sets nothing): the tests'
  layout (four categories of 3, 4, 7 and 2 bits; ten of 7 bits for the gas), bounds (20 to 100) and catalogue (items 0
  and 1 free, a few paid at 30 to 100) are the tests' own. The owner's free set, range and limits, and #626's layout, go into
  the deployment once given.
- **Departures from the proposal**: the layout is owner-set storage, not a constant table (the format of #626 PR 1 is not
  posted; owner-set, it needs no class upgrade, and append-only, it keeps every stored look valid). `withdraw_item` of a
  free item stops it being free (a player who does not own it can no longer select it); a stored avatar is never re-checked.
  `items(category)` returns a category's whole catalogue in one call for the creator. `AvatarItemBought` carries `sold`.
  `set_avatar(0)` clears the avatar, with no check.

## 1. Summary

- **A new system, `Avatar`**, holds the catalogue of avatar parts, what each player owns, and each player's avatar. It is
  ownable and upgradeable like `Story` and `Setup`.
- **The Cobbles stay on `Setup`'s one ledger** (`accounts`). `Avatar` debits them through one new `Setup` entry point,
  `spend_cobbles`, allowed to one address the owner sets (`Avatar`). No second ledger, no transfer.
- **Why not in `Setup`**: `Setup` is at **39,861 CASM felts, 48.7 %** of the 81,920 cap (`story-mode.md`). The catalogue,
  ownership and avatar code is about 3,000 to 4,000 felts by the tile skins' measure (+4,720 for part 3): `Setup` would reach
  about 53 %, past P-64's 50 % review point, and the design would then have to include the `Shop` split. In its own system,
  `Setup` grows only by `spend_cobbles` and its setter: about **+600 to +900 felts, 49.4 % to 49.7 %**, under 50 %.
- **The calls**, after the tile skins: `set_item(category, id, ...)` (owner), `buy_avatar_item(category, id)`,
  `set_avatar(look)`, and the views `item`, `owned`, `avatar(player_id)`.

## 2. The catalogue and the ownership

An item is a variant `id` of a part `category` (skin tone, eyes, eyebrows, mouth, hair, beard, headwear, accessory,
background, as #626 lists them).

| Storage (`Avatar`) | Key | Value | Written by |
|---|---|---|---|
| `items` | `(category: u8, id: u8)` | one `felt252`: `state` [0, 8) (0 not in the catalogue, 1 listed, 2 withdrawn from sale), `cobbles` u16 [8, 24) (0: free), `sold` u32 [32, 64), `supply` u32 [64, 96) (0: no limit), `until` u64 [128, 192) (0: no end) | `set_item`, `buy_avatar_item` (`sold`) |
| `owned` | `(player_id: felt252, category: u8)` | `u128`: bit `id` set when the player bought item `id` (ids 0 to 127) | `buy_avatar_item` |
| `avatars` | `player_id: felt252` | the player's look, one `felt252` (0: none set, the client shows its default) | `set_avatar` |
| `spender` (`Setup`) | | the one `ContractAddress` allowed to call `spend_cobbles` (zero: nobody) | `set_spender` (owner) |

- **Free items** are listed with `cobbles` 0: every player may use them and nobody buys them. They are the base set (7, point
  1).
- **`sold`, `supply` and `until`** exist so that a rare item limited in quantity or in time (7, point 3) needs no new storage
  later; with `supply` 0 and `until` 0 an item is on sale for as long as it is listed. The same slot is read and written once
  per purchase, so they cost no extra storage access.
- **What is bought stays owned**, as the tile skins: withdrawing an item or changing its price stops or changes new sales
  only; nothing is refunded.

## 3. The avatar's value and the format of #626

`set_avatar(look: felt252)` stores `look` as given. The contract reads it through a **layout**: for each category its bit
offset and its width (at most 7 bits, so ids 0 to 127, one `u128` of ownership per category). The layout is a constant table
in `Avatar`'s code, filled from #626 PR 1's format. Until then the placeholder is **one byte per category, category `c` in
bits [8c, 8c + 7)**, ten categories.

- If #626's format differs, only the table changes, before the first deployment of `Avatar`: nothing is stored yet, so there
  is no migration. After deployment, a new category goes in bits the stored values leave at 0 (read as "item 0", which the
  owner lists as free, 7, point 1): old avatars stay valid with no rewrite.
- `set_avatar` refuses a `look` with a bit set outside the layout (`'Avatar: invalid look'`), and an item not in the catalogue
  (`state` 0).

## 4. The calls

| Call | Who | Checks | Effects | Event | Estimate |
|---|---|---|---|---|---:|
| `set_item(category, id, cobbles, supply, until)` | owner | category in the layout, `id` < 128, `cobbles` 0 or within the bounds (7, point 2) | the item listed (or relisted), `sold` kept | `AvatarItemListed` | 0.3M |
| `withdraw_item(category, id)` | owner | listed | `state` 2 | `AvatarItemListed` (state 2) | 0.3M |
| `buy_avatar_item(category, id)` | the player, for itself | listed, `cobbles` != 0, not owned, `sold` < `supply` (if set), block time < `until` (if set) | `Setup.spend_cobbles` (balance >= price, debited), owned bit set, `sold` + 1 | `AvatarItemBought` (and `Setup`'s `CobblesSpent`) | 0.9M to 1.1M |
| `set_avatar(look)` | the player, for itself | per category: the item listed and free (`cobbles` 0), or owned | `avatars` written | `AvatarSet` | 1.0M to 1.6M (10 categories) |
| `avatar(player_id) -> felt252`, `item(category, id) -> Item`, `owned(player_id, category) -> u128` | anyone | | | | view |
| `Setup.spend_cobbles(player_id, cobbles, kind, id) -> u64` | `spender` only | `cobbles` != 0, balance >= `cobbles` | the balance debited | `CobblesSpent` | in `buy_avatar_item` |
| `Setup.set_spender(spender)` | owner | | | `SpenderSet` | 0.3M |

- **`set_avatar`'s cost** is one item read per category (10 reads, about 0.77M), one ownership read for each paid part, one
  write and one event. A cheaper variant keeps a "free set" word per category (one `u128` maintained by `set_item`) and reads
  the items not at all: same number of reads, smaller slots; the implementation measures both if the first exceeds 1.5M.
- **A free item later made paid**: an avatar already stored keeps it (`set_avatar` checks at the time of the call only); the
  player must buy it to select it again. The tile skins have no such case; flagged for the owner (7, point 4).
- **Order of checks and effects**: all checks, then `spend_cobbles`, then `Avatar`'s writes; `spend_cobbles` reverts the whole
  purchase on a short balance. `Avatar` is the only spender and calls only `Setup`, which calls nothing back.

## 5. Events

| Contract | Event | Keys | Data |
|---|---|---|---|
| `Avatar` | `AvatarItemListed` | `category`, `id` | `state`, `cobbles`, `supply`, `until` |
| `Avatar` | `AvatarItemBought` | `player_id` | `category`, `id`, `cobbles`, `balance` (the Cobbles after it) |
| `Avatar` | `AvatarSet` | `player_id` | `look` |
| `Setup` | `CobblesSpent` | `player_id` | `kind` (1: an avatar item), `id` (`(category << 8) \| id`), `cobbles`, `balance` |
| `Setup` | `SpenderSet` | | `spender` |

`CobblesSpent` keeps the indexer's ledger whole from `Setup`'s events alone, as `CobblesClaimed`, `PackBought` and `SkinBought`
do; `AvatarItemBought` repeats the balance so a client reading `Avatar` alone needs no join.

## 6. Client, deployment, tests

- **`@paved/chain`**: the reader's views (`avatar`, `item`, `owned`) and the writer's `buyAvatarItem` and `setAvatar`, after
  `buySkin` and `setSkins` (`packages/chain/src/writer.ts`); the decoding of `look` by #626's layout, shared with the creator.
- **The indexer**: `AvatarItemListed` (the catalogue), `AvatarItemBought`, `AvatarSet` (each player's avatar, for the menus
  and later the leagues), `CobblesSpent` in the Cobbles ledger.
- **Data hooks** in `packages/app/src/data`: the catalogue with the player's ownership (the creator, #626 PR 2) and any
  player's avatar (the menus, #624), with their fakes.
- **Deployment** (`scripts/deploy.sh`): declare and deploy `Avatar`, `Setup.set_spender(Avatar)`, the base set and the
  catalogue's prices in the definitions' multicall, read back; the ABIs and `contracts/deployments` by the ABI PR pattern.
- **Tests** (snforge, `paved::tests::avatar::`, under the 15 GiB cap): the packing, the bounds, a purchase once and never
  twice, Cobbles never below zero, `set_avatar` never accepting a part neither free nor owned, the layout's out-of-range bits,
  `supply` and `until`, `spend_cobbles` refused to anyone but the spender, a fuzz of buys and sets.
- **Audit** (in the PR): correctness (the layout decoding, the bit arithmetic, `sold` against `supply`) and security (the
  spender's access to every player's Cobbles, the owner's setters, the upgrade path).

## 7. Open points for the owner

1. **The free base set.** Proposed: in every category, items 0 to 3 free (item 0 the "none" of the optional parts: beard,
   headwear, accessory), so every player can make a distinct avatar at no cost; everything else paid.
2. **The price range of the paid items.** Proposed: **20 to 100 Cobbles** (`AVATAR_PRICE_MIN`, `AVATAR_PRICE_MAX`), below
   and up to the tile skins' 50 to 100, since an avatar has about ten parts against one tile skin per plan; for example 20 to
   40 for eyes, mouths and colours, 50 to 100 for headwear and scene backgrounds. The storage holds a `u16`, so a wider range
   (rare items above 100) needs no migration.
3. **Rare items, limited in time or in quantity?** Both are possible with the proposed storage (`until`, `supply`) at no extra
   cost per purchase. Proposed: build both, list none limited at the first deployment.
4. **A free item later made paid**: proposed as in section 4 (stored avatars keep it, selecting it again needs a purchase).
5. **For the PM: the host system.** Proposed: the new `Avatar` system with `Setup.spend_cobbles` (section 1). The alternative,
   the avatar in `Setup` with P-64's `Shop` split, moves packs and skins too and is a larger change.

## Hand-over (2026-10-20, to the Mac)

The owner moved the Cairo work of this task to the Mac. The branch holds the work in progress (commit "WIP AVATAR-CHAIN");
no pull request is open.

**Done.**

- The owner's answers (2026-10-20, #627): items 0 to 3 of every category free; paid items 20 to 100 Cobbles, rebalanced later,
  bounds and prices owner-set; rare items seasonal (listed for their season with `until`), no quantity limit at launch, the
  mechanism kept. The Overseer's ruling: a separate `Avatar` system debiting the Cobbles through one `Setup` entry.
- `contracts/src/systems/avatar.cairo`: the owner-set layout (append-only), price bounds and catalogue (`set_item`,
  `withdraw_item`), `buy_avatar_item`, `set_avatar`, the views `avatar`, `owned`, `item`, `items`, `layout`, `price_bounds`,
  `setup`, and their events.
- `Setup.spend_cobbles` (`ISetupSpend`) with `CobblesSpent`. **Changed after the last measure**: it was first gated by a
  dedicated spender (`set_spender`, `spender`, `SpenderSet`), which put `Setup` at 41,126 CASM felts, **50.2 %**, past P-64's
  50 % review point; it is now gated by `Setup`'s reporter allowlist, as `credit_story` is for `Story` (Avatar is
  allowlisted by `set_reporter`). That version is **not built or measured yet** (expected about -450 felts, under 50 %).
- Measured on the VPS before that change (test profile, `get_available_gas` around the call): `set_item` 1,018,235;
  `buy_avatar_item` 1,154,753; `set_avatar` with 10 free parts 2,677,046, with 10 owned parts 3,640,176 (above the design's
  estimates; the ceilings in `src/tests/avatar.cairo` are these + 5 %). `Avatar` 11,318 CASM felts (13.8 %). The scoped
  `snforge test paved::tests::avatar::` passed 22 of 22 with the spender version; it peaked at 11.5 to 14.3 GB VmPeak and
  7.9 to 8.9 GB RSS.
- `@paved/chain`: `Avatar` in the ABIs, the deployment (optional address), the views (`RpcGameViews`, `FakeGameViews`), the
  writes `buyAvatarItem` and `setAvatar` with `AvatarRefusedError` and `AvatarPriceChangedError`, the session policies;
  `packages/chain/src/avatar.ts` (the look's packing). The indexer decodes `CobblesSpent` into the Cobbles ledger (schema
  17; its tests passed). The app's hooks `useAvatar`, `useAvatarCatalogue`, `useAvatarWrites` (`packages/app/src/data/avatar.ts`).
- `scripts/deploy.sh`: declares and deploys `Avatar`, allowlists it on `Setup`, and sets the owner's defaults
  (`FRESH_AVATAR_*`: bounds 20 to 100, items 0 to 3 of each category free), read back; `scripts/test-deploy-url.sh` counts
  updated to 10 classes.

**Placeholders.**

- `FRESH_AVATAR_LAYOUT` in `deploy.sh` (nine categories of 7 bits) until AVATAR-LOOK (#626 PR 1) states the format: a layout
  on chain only grows, so it must be #626's before any deployment. No paid item is listed by the script (the owner lists them
  with their art and seasons). No deployment now.
- The tests' layout, bounds and catalogue in `src/tests/avatar.cairo` and the client tests are their own.

**Next.**

1. Regenerate `contracts/abis/Setup.json` (`scripts/abis.sh`: the committed one still has `set_spender`, `spender` and
   `SpenderSet`), then run `snforge test paved::tests::avatar::` and `scripts/class-sizes.sh` on the Mac: `Setup` under 50 %.
2. Add `paved::tests::avatar` to a `COVERAGE_GROUPS` group of `scripts/measure.sh` (`measure.sh check-groups` fails without
   it), and decide whether its `test_gas_*` tests stay there or move to `contracts/tests/gas.cairo`.
3. The pre-push check of the WIP commit failed on **format** and **guard tests** (not investigated; the guard failure includes
   the coverage group above). Run `check-run --lock -- bun run check`; the `@paved/chain` and `@paved/app` tests of this
   branch were not run yet.
4. The mock data source (`packages/app/src/data/mock/`): Sepolia's classes have no `Avatar`, so the hooks answer null there;
   add the avatar reads and writes to `MockLedger` if the creator (#626 PR 2) must work on mock data.
5. Seasonal items: the season calendar is the client's (listing a season's items with `until` its end is the owner's call
   at each season); say in the PR whether a start time (`from`) is wanted later.
6. The audit (correctness and security) in the PR: the reporter allowlist's trust (a reporter can already report progress
   for any player), `set_layout`'s append-only rule, `sold` against `supply`, the bit arithmetic of the look.
