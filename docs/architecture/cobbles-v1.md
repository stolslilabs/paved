# Cobbles v1 (P-61, design)

Renamed from gems to Cobbles by the owner's decision of 2026-10-15; the design is unchanged.

Track CORE wrote the design; the PM ruled on it; CORE implements it in three pull requests, each with a review and an
audit (value and access); CLIENT follows with the pack, theme, quest and achievement pages and the indexer (P-61 ruling 8).
**Part 1 (the ledger, the cobble claims, the free-game credits and the free spawn) is built in #440**: see "As built: part
1" below, which gives the measured figures and every choice the design left to the implementation. Parts 2 (packs) and 3
(skins) are not built yet.

The owner's feature (2026-10-15) and the PM's rulings B1 to B8 (P-61) are the input. In short: cobbles are an on-chain,
non-transferable balance per account (B2), earned only by quest and achievement claims and pack purchases, spent only
on tile skins; four packs at 50 for $5, 100 for $9, 500 for $40 and 1,000 for $70 (the owner's tiers of 2026-10-15,
replacing B1's list); completing every daily quest of
a day, or every weekly quest of a week, credits one free Challenge game (B4); packs are paid on chain after Glitchbomb's
purchase component, priced in USD through the game price's source, and their revenue takes the game's split with its
referral (B5 and the owner's answer of 2026-10-15); skins are owned per account, tile type and
theme, with at most one active skin per tile type (B6, B7).

The owner's answers (2026-10-15, P-61 section C) and the PM's rulings on the open items (2026-10-15) are folded in:
section 2 (packs and their split) and section 8 ("Decided").

Every gas figure below is an **estimate** unless it says "measured". No Cairo build or test was run for the design; part 1's
figures are measured in "As built: part 1".
Each estimate is derived from measured unit costs: a storage read of 76,840 L2 gas, a write of 118,210, an event of about
32,800 (`docs/architecture/g7-gas-plan.md`, 1.4, `test_profile_g7_units`), and the measured scenarios of
`docs/measures/baseline.md`. The implementation task measures each one (section 7.3).

## As built: part 1 (#440)

Sections 1.2, 1.3, 3, 4, 6.1 (part 1's rows), 6.2 (part 1's events), 6.4 (part 1's calls) and 7 (part 1's rows) are built.
The interface is in `docs/architecture/public-interface.md`, "Cobbles v1, part 1: `Setup` and `Challenge`".

**Measured gas** (VPS, `contracts/tests/gas.cairo`, `docs/measures/baseline.md`, "After cobbles v1, part 1"):

| What | Estimate | Measured |
|---|---:|---:|
| The ledger, per paid game over, two slots (day and account: before week 0) | | +645,916 (g, i, l, s); +722,746 (k) |
| The ledger, per paid game over, three slots (day, week and account) | +585,150 | **+940,298** (x); +1,033,718 for k's tally (y, derived) |
| `claim_quest` | 499,740 | 904,611 |
| `claim_achievement` | about 0.38M | 550,863 |
| `claim_daily_credit` (10 dailies) | about 1.27M | 2,322,515 |
| `claim_weekly_credit` (3 weeklies) | about 0.73M | 1,471,730 |
| `spawn_free` | about 7.0M | 6,563,616 (the paid spawn m: 15,695,888) |
| A free game's game over | | 1,760,224 (g: 3,820,384) |

**Against P-22's guard (+1.5M on the closing move): within it.** The largest rise measured is +940,298 (+1,033,718 derived for
the largest tally), so decision 2 (the weekly slot) stands. The estimate was low by about 0.36M for three slots: the first
write of an empty slot costs more than the estimate's unit write, and `report` now reads the block time and unpacks and packs
each slot.

**Class sizes** (`scripts/class-sizes.sh`, release profile, VPS): `Setup` 13,846 Sierra and **31,216 CASM felts, 38.1 % of
the 81,920 cap** (14,499 before: +16,717), under the 50 % that would move the shop to its own system (decision 1); parts 2 and 3
add to it, so each measures it again. `Challenge` 29,831 Sierra and 64,826 CASM (64,089 after G7a: +737), 8,121 under the P-44
cap of 72,947 (`class-headroom.md`).

**Choices the design left open, and the small departures:**

- **The free mark in the game** (4.2): bit 23 of the game's counters word (`FREE_GAME`, `models/game.cairo`), above the four
  counters (23 bits, each clamped to its width), set at the free spawn, and carried into the game-over tally as bit 126
  (`paved::quests::encode`, `is_free`). The game over reads nothing more: no `free_games` map.
- **The day and the week of a report** are those of its block time. Before week 0 (block times below 345,600, only in tests)
  there is no week, so the week slot is not written.
- **`set_quest_cobbles` also refuses a quest with an end** (`'Setup: invalid schedule'`): the copy keeps no end, so it could not
  stop a claim after it. The fresh quests have none.
- **`set_achievement_cobbles` also refuses an achievement with a window** (`'Setup: achievement windowed'`): the lifetime
  counts are for all time. The fresh achievements have none.
- **The credit claims' errors**: `'Setup: credit claimed'` for a second claim of a period's credit (the cobble claims keep
  `'Setup: claimed'`), `'Setup: no live quest'` when no quest of the kind is live in the period.
- **The view types** are `Account`, `Progress`, `QuestCobbles` and `AchievementCobbles` (the design's `AccountView`): the slots'
  own structs, returned whole.
- **The packing as built** (each slot one `felt252`, the low then the high `u128`): `accounts`: `cobbles` [0, 64), `credits`
  [64, 80), `games` [80, 96), `forests` [96, 112), `wonders` [112, 128), `big` [128, 144), `high` [144, 160),
  `achievements_claimed` [160, 224). `days` and `weeks`: `games` [0, 16), `structures` [16, 32), `forests` [32, 48), `points`
  [48, 80), `credit` [80], `claimed` [128, 192). `quest_cobbles`: `cobbles` [0, 8), `kind` [8, 16), `task` [16, 48), `total`
  [48, 80), `interval` [80, 112), `start` [128, 192). `quest_lists`: 15 ids of 16 bits (8 in the low half, 7 in the high).
  `achievement_cobbles`: `cobbles` [0, 8), `task` [8, 40), `total` [40, 72).
- **`scripts/deploy.sh`** sends the 28 cobble calls in the definitions' multicall, after the definitions (its hash is the
  record's `definitions_tx`), reads each back through `quest_cobbles` and `achievement_cobbles`, and lists them under
  `--check-only`. A cobble amount other than the table's stops a run, but is kept on a complete record (the owner's calibration
  since).

**Tests.** `contracts/src/tests/e2e/cobbles_ledger.cairo` (`Setup` alone: packing, calendar, setters, claims, credits, the audit
properties A1, A2, A3, A5 and A6, the ledger fuzz) and `contracts/src/tests/e2e/cobbles.cairo` (through the real contracts: the
report, the day's credit end to end, A7, A8, the pause, no credit, and a free game's `GameOver` on each way it ends). A4, A9 and
A10 are parts 2 and 3's.

## Sources

- **Paved** at this branch's base (main `ca034af2`), cited by path from the repository root.
- **Glitchbomb** at commit `5efcbce`, cited `glitchbomb@5efcbce:<path>:<line>`. Licence: the root `LICENSE` is the
  MIT License, "Copyright (c) 2025 cartridge-gg" (`glitchbomb@5efcbce:LICENSE:1-3`). `contracts/package.json` says
  `"license": "ISC"` (`glitchbomb@5efcbce:contracts/package.json:18`), which conflicts with the LICENSE file.
- **Nums** at commit `4f8f405`, cited `nums@4f8f405:<path>:<line>`. Licence: the root `LICENSE` is the MIT License,
  "Copyright (c) 2023 Dojo" (`nums@4f8f405:LICENSE:1-3`). `contracts/Scarb.toml` has no licence field.
- Both benchmarks were read from exports at those commits (contracts, client sources, docs), without their agent
  instruction files. **No code is copied from either.** Where this design follows one, the file is named.

### What the benchmark does, and what Paved takes from it

| | Glitchbomb | Nums | Paved cobbles v1 |
|---|---|---|---|
| Where the purchase lives | in `Setup`, beside the quest and achievement components (`glitchbomb@5efcbce:contracts/src/systems/setup.cairo:59-95`); public `quote` and `issue` (`:258-304`) | the same pattern: `Setup` exposes `issue` and `quote` (`nums@4f8f405:contracts/src/systems/setup.cairo:226-270`) | **in `Setup`**, beside quiver's quests and achievements (section 1) |
| The purchase component | a thin layer over Cartridge's `bundle` package, which is not in the export: empty storage and events, internal functions only (`glitchbomb@5efcbce:contracts/src/components/purchase.cairo:35-42`, `:44-265`). The buyer's transfer happens inside the package's `issue` | the same layer over the same package (`nums@4f8f405:contracts/src/components/purchase.cairo:4-7`, `:35-42`) | Paved's own code in `Setup`: no `bundle` package, no Dojo |
| Price | fixed amounts of a quote token, no oracle: bundle `i` costs `(i + 1) x base_price` (`glitchbomb@5efcbce:contracts/src/components/purchase.cairo:82-97`) | fixed amounts of a quote token, 1 % discount per step (`nums@4f8f405:contracts/src/components/purchase.cairo:82-99`); no oracle | fixed USDC amounts, the source of the game price (section 2.1) |
| Split | burn share swapped and burned, then a vault share, then the rest to the team; whole percentages set by the admin (`glitchbomb@5efcbce:contracts/src/components/purchase.cairo:178-238`) | burn, vault, team, in the same order (`nums@4f8f405:contracts/src/components/purchase.cairo:130-193`) | the game's split itself, through the game's own code in `Economy`: burn, Vault, LP fee in the swap, and the game's referral (section 2.3) |
| Who sets bundles | `ADMIN_ROLE`, granted to the deployer (`glitchbomb@5efcbce:contracts/src/systems/setup.cairo:251-255`, `:307-502`) | `ADMIN_ROLE` (`nums@4f8f405:contracts/src/systems/setup.cairo:275-409`) | `Setup`'s owner (section 2.2) |
| What a purchase credits | game NFTs (`glitchbomb@5efcbce:contracts/src/systems/setup.cairo:161-169`) | game NFTs (`nums@4f8f405:contracts/src/systems/setup.cairo:107-121`) | cobbles |
| A free game's quest progress | skipped: `create(..., false)`, for a reentrancy reason ("the quest component is never re-entered", `glitchbomb@5efcbce:contracts/src/systems/play.cairo:209-213`) | not visible in the export | **skipped**, to close the credit loop (section 4.3) |
| A currency | none: "credits" is an icon only (`glitchbomb@5efcbce:client/src/components/icons/regulars/credits.tsx`) | none. The gem icons (`nums@4f8f405:client/src/components/icons/powers/gem.{regular,lock,used}.tsx`) are the art of an in-game power, `PowerType.Gem` (`nums@4f8f405:client/src/types/power.ts:35`, description "Gem power" at `:223-224`); **not related** to a balance | cobbles, a balance in `Setup` |

Both benchmarks claim quest rewards automatically in a completion hook, which needs quest progress stored per player on
chain (`docs/architecture/quests-v2.md`, 1.4). Paved runs quiver in event mode: nothing per player is stored
(`contracts/src/systems/setup.cairo:302`, `quests.md`, "Quest mode"). Quiver's storage mode was measured at 3.24M to
6.46M L2 gas per report (`quests.md:236`), above the P-22 guard of +1.5M on the closing move. So the proof a claim needs
is Paved's own: the smaller own design that `quests-v2.md` 2.3 proposed, specified in section 3.

## 1. Systems and storage

### 1.1 Where each piece lives: `Setup`

**Decided: everything lives in `Setup`.** The cobble balance, the free-game credit, the progress ledger that proves the
claims, the claims, the packs and their purchase, skin ownership and the active set.

Why:

- **It follows Glitchbomb's layout**, where the purchase sits in `Setup` beside the quests and achievements.
- **The claims need the progress, and the progress is reported to `Setup`.** `Challenge` already reports every game
  over to `Setup.report` (`contracts/src/systems/challenge.cairo:503`). With the ledger in the same contract, a claim
  reads local storage, with no cross-contract trust.
- **No external minter of cobbles.** Cobbles are written only by `Setup`'s own entry points. The audit property "no cobble minted
  outside a claim or a purchase" is then a property of one class.
- **`Collection` is the ERC-721 of the game tokens**, the wrong place for an account balance. A new system would need
  the ledger, or a trusted call into `Setup` for every claim.
- **The class has room.** `Setup` is 14,499 CASM felts, 17.7 % of the 81,920 cap; the programme's limit is 90 %
  (`docs/architecture/class-headroom.md`, "After D-25 E"). The implementation measures its new size.

Two other systems change:

- **`Challenge`** gains the free spawn (section 4).
- **`Economy`** gains `sell`, which runs the game purchase's own split and referral on a pack's USDC (section 2.3).

`Collection`, `Vault`, `PavedToken` and `Faucet` do not change.

**Reversal:** a `Shop` system holding the packs and the skins, if `Setup`'s CASM passes 50 % of the cap. That costs a
trusted `Setup` call per cobble spend.

### 1.2 New storage of `Setup`

Every member is **appended** after the existing ones (`economy`, `collection`, `contracts/src/systems/setup.cairo:187-192`),
so no earlier address moves (P-42). Sepolia is deployed fresh anyway (section 6.4). Every packed slot is one
`felt252`, read and written whole.

| Member | Key | Value (packed) | Written by |
|---|---|---|---|
| `accounts` | `player_id: felt252` | `cobbles: u64`, `credits: u16`, lifetime counts `games`, `forests`, `wonders`, `big`, `high` (`u16` each, saturating), `achievements_claimed: u64` (bit `i` = achievement `i`). 224 bits | `report`, `claim_quest`, `claim_achievement`, `claim_daily_credit`, `claim_weekly_credit`, `buy_pack`, `buy_skin`, `spend_credit` |
| `days` | `(player_id, day: u64)` | the sums of the day's paid game overs: `games: u16`, `structures: u16`, `forests: u16` (saturating), `points: u32` (saturating); `claimed: u64` (bit `i` = quest `i` claimed for that day); `credit: bool`. 145 bits | `report`, `claim_quest`, `claim_daily_credit` |
| `weeks` | `(player_id, week: u64)` | the same layout, for the week | `report`, `claim_quest`, `claim_weekly_credit` |
| `quest_cobbles` | `quest_id: u32` | `cobbles: u8`, `kind: u8` (1 daily, 2 weekly), `task: u32`, `total: u32`, `start: u64`, `interval: u32`. A copy of the quiver definition's schedule and single task, taken when the cobbles are set (section 3.2) | `set_quest_cobbles`, `retire_quest` |
| `quest_lists` | `kind: u8` | up to 15 quest ids (`u16` each): the quests of that kind that have cobbles | `set_quest_cobbles`, `retire_quest` |
| `achievement_cobbles` | `achievement_id: u32` | `cobbles: u8`, `task: u32`, `total: u32`, copied from the definition | `set_achievement_cobbles`, `retire_achievement` |
| `packs` | `pack_id: u8` | `cobbles: u32`, `price: u128` (USDC base units, 6 decimals), `active: bool` | `set_pack` |
| `skin_prices` | `(theme: u8, plan: u8)` | `cobbles: u8`; 0 = not for sale | `set_skin_price` |
| `skins` | `(player_id, theme: u8)` | `owned: u32`: bit `p` = the skin of plan `p` (1 to 19) of that theme is owned | `buy_skin` |
| `active_skins` | `player_id` | 19 theme ids (`u8` each, 152 bits): the theme active for plan `p`; 0 = the default theme | `set_skins` |

Calendar of the periods:

- **Day number:** `day = t / 86,400`, the same as Paved's day id (`contracts/src/systems/challenge.cairo:492`).
- **Week number:** `week = (t - 345,600) / 604,800`. The weekly quests start at 345,600, Monday 1970-01-05 00:00 UTC
  (`quests.md`, "Weekly quests"), so a week runs Monday to Sunday UTC.
- `t` is the block time of the report: a game counts for the day and the week it **ends** in, the rule the indexer
  already applies to quiver's events (`quests.md`, "Daily quests").

**Why the layout:**

- **One `accounts` slot carries the cobbles and the achievement counts**, so an achievement claim reads and writes one
  slot, and a game over writes one slot for both.
- **Cobbles and credits are not ERC-20 state.** There is no `transfer`, `approve` or `allowance`, so there is no transfer
  path (B2).
- **The lifetime counts are `u16`.** The highest target is Settler V's 1,000 games (`quests.md`, "Higher tiers").
  `set_achievement_cobbles` refuses a total above 65,535, so a saturated count can never sit under a reachable target.
- **Ids are bounded.** Quest and achievement ids must be 1 to 63, for the claim bitmaps. The fresh deployment uses
  quests 1 to 16 and achievements 1 to 16.
- **Skin ids are small.** Themes are 1 to 255 (`u8`, 0 is the default theme). Plans are the `u8` codes of `Plan`, 1 to
  19 (`contracts/src/types/plan.cairo:94-118`).

### 1.3 Who may write each, and what it costs

| Write | Who | Entry point | Gas (estimate unless measured) |
|---|---|---|---|
| Progress: `days`, `weeks`, `accounts` counts | an allowlisted reporter, today `Challenge` only (`set_reporter`, owner) | `report` (exists; new writes) | **Measured (part 1): +645,916 with two slots, +940,298 with three (see "As built: part 1"); the estimate was +0.59M**: three slots read and written, 3 x (76,840 + 118,210) = 585,150. A free game over writes `accounts` only: +0.20M. Today's report is about 0.61M of a surrender's 3.17M (`g7-gas-plan.md`, 1.1: 19.2 % of g). Against the P-22 guard of +1.5M on the closing move: within it. The worst build game over, l, measured 6,581,227 (`baseline.md`, "After G7a"), becomes about 7.17M |
| Cobbles, by a quest claim | the player, for itself | `claim_quest` | about 0.50M: `quest_cobbles`, `days` (or `weeks`) and `accounts` read, two writes, one event (3 x 76,840 + 2 x 118,210 + 32,800 = 499,740) |
| Cobbles, by an achievement claim | the player, for itself | `claim_achievement` | about 0.38M: `achievement_cobbles` and `accounts` read (and `tutorial_claims` for First Stone), one write, one event |
| A credit, by the dailies | the player, for itself | `claim_daily_credit` | about 1.27M: the list, ten `quest_cobbles` entries, `days` and `accounts` read, two writes, one event (13 reads) |
| A credit, by the weeklies | the player, for itself | `claim_weekly_credit` | about 0.73M: the list, three entries, `weeks` and `accounts` |
| Cobbles, by a pack | the player, for itself | `buy_pack` | about 9.8M with no referrer. One USDC `transferFrom` (about 1.0M: 5.7 % of the spawn m, 17.64M, `g7-gas-plan.md`, 1.1), the `Economy.addresses()` view (about 0.2M), `Economy.sell` (the swap and burn of `Economy.purchase`, about 8.4M: 47.7 % of m, less the terms it does not write), `accounts` read and written. A referred purchase adds the referrer checks (+137,030 measured on n, `baseline.md`, "After the Economy hardening") and the referral's USDC transfer |
| A credit spent | `Challenge` (the reporter allowlist), for the caller of `spawn_free` | `spend_credit` | about 0.38M: the external call (about 0.18M, the step D figure of a `Setup` call, `baseline.md`, "After D-21/24") and `accounts` read and written |
| Cobbles spent, a skin owned | the player, for itself | `buy_skin` | about 0.50M: `skin_prices`, `skins`, `accounts` read, two writes, one event |
| The active set | the player, for itself | `set_skins` | about 0.30M for any number of changes: `skins` read once per theme named, `active_skins` read and written once, one event |
| Cobbles per quest and per achievement, packs, skin prices | `Setup`'s owner | `set_quest_cobbles`, `set_achievement_cobbles`, `set_pack`, `set_skin_price` | one-off admin calls; about 0.3M to 0.6M each (two definition reads, one or two writes, one event) |

**Decided: the player is always the caller.** No entry point credits, spends or activates for another address. A
purchase cannot be a gift, so no path moves value between accounts (reversal: a gift is a later ruling, with its own
audit).

## 2. Pack purchase on chain

### 2.1 Price: USDC, the source of the game price

**There is no oracle in Paved's game price.** A Challenge game costs `stake x CHALLENGE_PRICE`, a constant of 2 USDC
(`contracts/src/constants.cairo:15`), read by `Mode::price` (`contracts/src/types/mode.cairo:30-35`) and by
`Economy::BASE_PRICE` (`contracts/src/systems/economy.cairo:40`). USDC is the USD unit. Glitchbomb and Nums price their
bundles the same way: fixed amounts of a quote token, no oracle (see Sources).

**Decided:** a pack's price is a USDC amount in base units (6 decimals), paid in the token `Challenge` takes.

**The owner's tiers (2026-10-15, P-61 section C, replacing B1's list):** progressive discounts from the reference of
100 cobbles for $20 ($0.20 a cobble). These are the defaults the fresh deployment sets:

| Pack | Cobbles | Price (USD) | `price` (USDC base units) | Per cobble | Against the $0.20 reference |
|---|---:|---:|---:|---:|---:|
| 1 | 50 | 5 | 5,000,000 | $0.100 | -50 % |
| 2 | 100 | 9 | 9,000,000 | $0.090 | -55 % |
| 3 | 500 | 40 | 40,000,000 | $0.080 | -60 % |
| 4 | 1,000 | 70 | 70,000,000 | $0.070 | -65 % |

Each larger pack is a better price per cobble than the one before.

### 2.2 Who sets the packs

`Setup`'s owner calls `set_pack(pack_id, cobbles, price, active)`:

- `pack_id` is 1 to 8.
- `cobbles` and `price` are both non-zero.
- `active = false` stops sales of that pack without deleting it.

Each call emits `PackSet`. The owner is `OwnableComponent`'s two-step owner (`contracts/src/components/ownable.cairo`),
as for every `Setup` setting. The owner is trusted to set prices: no bound beyond non-zero. The fresh deployment sets
the four tiers above (section 6.4).

### 2.3 The payment flow: the game's path

**The owner's answer (2026-10-15, P-61 section C): a pack's revenue takes the same split as a game.** It is swapped to
PAVED, 70 % burned, 25 % to the Vault and 5 % to the LP, with a referral as for games. This is fixed, not a
configurable default. So there is no treasury share and no split setting of the shop: a pack runs **the game's own
purchase path** in `Economy`, less what belongs to a game.

**`Setup.buy_pack(pack_id, referrer, min_out)`**, the caller for itself:

1. **[Check]** The pack is active, and `economy` is set in the wiring.
2. **[Effect]** `accounts[caller].cobbles += pack.cobbles`. It reverts if the sum passes `u64`; it cannot in practice.
3. **[Interaction]**
   - It reads the USDC address from `Economy.addresses().usdc` (`contracts/src/systems/economy.cairo:177-183`), so
     `Setup` keeps no token setting that could differ from `Economy`'s.
   - `token.transferFrom(caller, economy, pack.price)`, which must return true. This is the transfer `Challenge` makes
     for a game (`contracts/src/systems/challenge.cairo:489`).
   - `Economy.sell(caller, pack.price, referrer, min_out)`.
4. **[Event]** `PackBought { player_id, pack_id, cobbles, price, referrer, balance }`. `referrer` is the one that counted,
   or zero.

The player approves `Setup` on USDC for `price` first, as it approves `Challenge` for a game.

**`Economy.sell(player, price, referrer, min_out)`, new, seller only:**

- **Who:** the `seller` is set once by `Economy`'s owner (`set_seller`). Any other caller gets `'Economy: not the
  seller'`.
- **The same code as `purchase`.** `purchase` (`contracts/src/systems/economy.cairo:636-752`) is split in two. One part
  is an internal function holding everything that moves money; `purchase` and `sell` both call it, so the two cannot
  drift apart. That function does the following:
  1. It checks that `price` USDC is on `Economy`.
  2. It applies the referral rule (below) and pays the referral, `curve::split` with the configured `burn_bps` and
     `referral_bps` (`contracts/src/economy/curve.cairo:29`, `contracts/src/systems/economy.cairo:666-682`).
  3. It swaps the whole USDC balance in one swap, which must fill whole and buy at least `min_out` PAVED.
  4. It pays the margin's PAVED to the Vault, with no share minted, and burns the rest
     (`contracts/src/systems/economy.cairo:684-698`).
  5. It updates the guard's rate, at most once per block, as a game's purchase does.
- **What only `purchase` keeps:** the stake and price checks against `BASE_PRICE`, the day, the player per game, the
  day's prior, `R` and the game's terms. A pack has no game, so `sell` writes no terms, no player per game, nothing in a
  day's accumulator, and never touches the mean.
- **Event:** `Sold { player_id, price, referrer, referral, burned_quote, burned, margin, supply, vault_paved }`. These
  are `Purchased`'s fields (`contracts/src/systems/economy.cairo:517-535`) less the game's (`game_id`, `day`, `stake`,
  `factor`, `reference`).

With the decided configuration (`contracts/src/systems/economy.cairo:84-98`), 73.68 % of the price is swapped for the
burn, so that 70 % is burned after the pool's 5 % fee, and 26.32 % is swapped for the Vault. With a referral, 5 % of the
price goes to the referrer out of the Vault's part, so the split is 70 / 20 / 5 / 5 and the LP gets 4.75 %. That is the
game's split to the basis point, because it is the game's code. A change of `Economy.configure` moves both together.

**The referral on a pack, as for a game.**

- **Who can refer:** any non-zero address except these:
  - the buyer;
  - the Vault, the router, `Economy` and the game (`Challenge`), which `Economy` already ignores
    (`contracts/src/systems/economy.cairo:666-682`);
  - **the seller (`Setup`)**, which `Economy` adds to that list;
  - `Economy` and `Setup` itself, which `Setup` filters before the call, as `Challenge` filters `Economy` and itself
    (`contracts/src/systems/challenge.cairo:478-486`).

  An ignored referrer does not revert: there is simply no referral, and its share stays in the Vault's part.
- **The share:** `referral_bps` of the price, 5 % (500 bps) today, out of the Vault's part, never out of the burn
  (P-56). It is paid in USDC to the referrer, in the same call.
- **No registration** (D-25): the same rule as a game.

The client takes `min_out` from `Economy.quote_swap(amount)` less 1 %, where `amount` is the price less the referral
when a referrer counts. This is the game's rule (`Quote.min_out_hint`, `contracts/src/systems/economy.cairo:134-137`).

**What this does to the economy.** A pack burns PAVED and raises the Vault's rate, as a game's purchase does. A lower
supply raises the supply factor `F = 2 - S / T` (`docs/architecture/economy.md:74`), so every later game's `R` is a
little higher: revenue from cosmetics feeds the players' rewards. This is the owner's answer, applied.

**Why not Glitchbomb's sweep of the contract's balance:** `Setup` holds no USDC between calls. The price goes straight
from the player to `Economy`, so no balance is left on `Setup` to sweep. (`Economy` keeps its own rule: any USDC on it
joins the next swap.)

### 2.4 Events of the shop

`PackSet { pack_id, cobbles, price, active }` and `PackBought { player_id, pack_id, cobbles, price, referrer, balance }` on
`Setup`; `SellerSet { seller }` and `Sold { ... }` on `Economy`.

## 3. Claims

### 3.1 Cobbles per quest and per achievement

These are first guesses, within the owner's bounds: quests 5 to 15, "of the order of tens" by difficulty;
achievements 10 to 90, "of the order of fifties". They are calibrated like the targets (Q-4). The ids, tasks, counts
and windows are the ones `scripts/deploy.sh`'s fresh path defines today (`FRESH_QUESTS` and `FRESH_ACHIEVEMENTS`,
`scripts/deploy.sh:2245-2256`; `quests.md`, "Every quest and achievement the fresh deployment defines").

**Quests (13 defined; ids 2 to 4 are not defined).** Rule: the easy, middle and hard target of a family give 5, 10
and 15; Daily Run, always live and the easiest, gives 5; a weekly quest gives 15, the top of the bound.

| Quest | Kind | Task, count | Window | Difficulty | Cobbles |
|---|---|---|---|---|---:|
| 1 Daily Run | daily, every day | `GAME_FINISHED` 1 | 86,400 in 86,400, start 0 | easy | 5 |
| 5 Small Works | rotating daily (day mod 3 = 0) | `STRUCTURE_SCORED` 4 | 86,400 in 259,200, start 0 | easy | 5 |
| 6 Public Works | rotating daily (1) | `STRUCTURE_SCORED` 8 | start 86,400 | middle | 10 |
| 7 Great Works | rotating daily (2) | `STRUCTURE_SCORED` 12 | start 172,800 | hard | 15 |
| 8 Woodland Walk | rotating daily (0) | `FOREST_SCORED` 2 | start 0 | easy | 5 |
| 9 Deep Woods | rotating daily (1) | `FOREST_SCORED` 3 | start 86,400 | middle | 10 |
| 10 Old Growth | rotating daily (2) | `FOREST_SCORED` 4 | start 172,800 | hard | 15 |
| 11 Warm-Up Score | rotating daily (0) | `POINTS` 2,000 | start 0 | easy | 5 |
| 12 Strong Day | rotating daily (1) | `POINTS` 5,000 | start 86,400 | middle | 10 |
| 13 Grand Day | rotating daily (2) | `POINTS` 8,000 | start 172,800 | hard | 15 |
| 14 Weekly Forester | weekly | `FOREST_SCORED` 5 | 604,800 in 604,800, start 345,600 | weekly | 15 |
| 15 Weekly Builder | weekly | `STRUCTURE_SCORED` 30 | the same | weekly | 15 |
| 16 Weekly Points | weekly | `POINTS` 20,000 | the same | weekly | 15 |

What a player can earn from quests at most:

- **A day:** 20 when the day number mod 3 is 0 (5 + 5 + 5 + 5), 35 when it is 1, 50 when it is 2. That is 35 a day on
  average.
- **A week:** 45 from the weekly quests.
- **About 30 days:** about 1,240 cobbles (35 x 30 + 45 x 30 / 7). That is more than the 1,000-cobble pack ($70), plus up to
  30 daily and 4 weekly free games.

**Accepted as designed (PM ruling, 2026-10-15).** The amounts are calibrated on Sepolia with measured figures, and stay
configurable by `Setup`'s owner (`set_quest_cobbles`, `set_achievement_cobbles`).

**Achievements (16 defined).** Rule: **cobbles = the achievement's display points**. The points were already set by
difficulty (P-22 and v2a), so there is one difficulty scale and no second table to keep in step. Every value is within
10 to 90.

| Achievement | Task, count | Points | Cobbles |
|---|---|---:|---:|
| 1 First Stone | `TUTORIAL_FINISHED` 1 (the unchecked claim, D-21) | 10 | 10 |
| 2 Settler I | `GAME_FINISHED` 1 | 10 | 10 |
| 3 Settler II | `GAME_FINISHED` 10 | 20 | 20 |
| 4 Settler III | `GAME_FINISHED` 50 | 40 | 40 |
| 5 Grand Builder | `BIG_STRUCTURE` 1 | 20 | 20 |
| 6 Forester | `FOREST_SCORED` 10 | 20 | 20 |
| 7 Pilgrimage | `WONDER_SCORED` 1 | 30 | 30 |
| 8 High Roller | `HIGH_SCORE` 1 | 30 | 30 |
| 9 On the Podium | `PODIUM` 1, credited by the indexer | 50 | **none in v1** |
| 10 Forester II | `FOREST_SCORED` 50 | 40 | 40 |
| 11 Pilgrimage II | `WONDER_SCORED` 10 | 50 | 50 |
| 12 Grand Builder II | `BIG_STRUCTURE` 10 | 40 | 40 |
| 13 High Roller II | `HIGH_SCORE` 10 | 50 | 50 |
| 14 High Roller III | `HIGH_SCORE` 25 | 80 | 80 |
| 15 Settler IV | `GAME_FINISHED` 250 | 60 | 60 |
| 16 Settler V | `GAME_FINISHED` 1,000 | 80 | 80 |

All 15 claimable achievements add up to 580 cobbles.

**On the Podium has no cobbles in v1.** Its task (8) is credited by the indexer from its daily leaderboard after a day
closes (`quests.md`, "On the Podium"). Nothing on chain ranks players since D-20, so no claim can prove it, and a claim
signed by the indexer would make it a trusted minter (rejected in `quests-v2.md` 2.3). `set_achievement_cobbles` refuses a
task not counted on chain: only 1, 4, 5, 6, 7 and 10 are accepted. **Ruled by the PM (2026-10-15): no cobbles in v1.**

**First Stone keeps its 10 cobbles (PM ruling, 2026-10-15)**, although its claim is unchecked: cobbles cannot be moved, so a
farmed 10 has no market value, and there is one claim per account.

### 3.2 Setting the cobbles

`set_quest_cobbles(quest_id, cobbles)`, owner only. It reads quiver's definition: `StoreTrait::get_definition`, two slots,
`quiver_quest` 0.2.0 `store.cairo:97`. It refuses the call unless all of these hold:

- the quest is defined and not retired;
- `cobbles` is 5 to 15, or 0, which removes the cobbles;
- the quest has exactly one task, of task 1, 2, 3 or 4 (the tasks the ledger sums);
- its schedule is one of two shapes:
  - **daily:** `duration` 86,400, `interval` a non-zero multiple of 86,400, `start` a multiple of 86,400;
  - **weekly:** `duration = interval = 604,800`, `start % 604,800 == 345,600`.

It copies the schedule and the task into `quest_cobbles`, and adds the id to its kind's list, or removes it when the cobbles
are 0. It emits `QuestCobblesSet { quest_id, cobbles, kind }`. A quiver definition can never be edited
(`contracts/src/systems/setup.cairo:35-37`), so the copy cannot drift from it. `retire_quest` also clears the copy and
the list entry, in the same call.

`set_achievement_cobbles(achievement_id, cobbles)` works the same way:

- `cobbles` is 10 to 90, or 0;
- the definition has one task, one of 1, 4, 5, 6, 7 or 10;
- its total is at most 65,535;
- it emits `AchievementCobblesSet`.

**Why copy:** a claim reads one slot instead of two. The dailies' credit claim then reads 10 slots instead of 20,
about -0.77M (estimate).

### 3.3 How a claim is made, and made once

**`claim_quest(quest_id, period)`**, where `period` is the day number for a daily quest and the week number for a
weekly one:

1. `entry = quest_cobbles[quest_id]`; it reverts `'Setup: no cobbles'` when the cobbles are 0.
2. **Live in that period:** with `t0 = period x 86,400` (daily) or `345,600 + period x 604,800` (weekly), the copied
   schedule is active at `t0`: `start <= t0` and `(t0 - start) % interval < duration`. This is quiver's
   `ScheduleTrait::is_active` (`quiver_quest` 0.2.0, `types/schedule.cairo:32`). Otherwise it reverts `'Setup: not live'`.
   Given the two shapes, the quest's window is then exactly that day or that week.
3. **Completed:** the period's slot (`days[(caller, period)]` or `weeks[...]`) holds a sum for `entry.task` of at least
   `entry.total`. Otherwise it reverts `'Setup: not completed'`.
4. **Once:** bit `quest_id` of the slot's `claimed` is clear, or it reverts `'Setup: claimed'`.
5. **[Effect]** Set the bit, `accounts[caller].cobbles += entry.cobbles`, then emit
   `CobblesClaimed { player_id, kind: 1 quest, id, period, cobbles, balance }`.

A period still running can be claimed as soon as its target is met: the sums only grow. Past periods stay claimable
with no deadline, since their slots persist. A future period has an empty slot, so its claim fails at step 3.

**`claim_achievement(achievement_id)`:**

1. `entry = achievement_cobbles[achievement_id]`, with non-zero cobbles.
2. The count of its task:
   - task 1, 4, 5, 6 or 7: the lifetime count in `accounts`;
   - task 10: 1 if `tutorial_claims[caller]`, else 0.
3. The count must be at least the total.
4. Bit `achievement_id` of `achievements_claimed` must be clear.
5. **[Effect]** Set the bit, add the cobbles, emit `CobblesClaimed { kind: 2 achievement, period: 0, ... }`.

**The double-claim guard** is one bit per (player, quest, period), or per (player, achievement), set in the same write
that credits the cobbles. A second claim finds the bit set and reverts.

**Claimed, not automatic** (B4: "Claimed, not automatic, like quests"). A claim in the report would add a cobble write and
the definitions' reads to every game over. It would also make a game over revert-prone if a claim could fail. The
client multicalls several claims in one transaction.

### 3.4 The free game of the dailies and the weeklies (B4)

**Decided: proven on chain, from `Setup`'s own ledger, not from the indexer.** A credit has value (a game), so its proof
must be the contract's. The indexer only shows it.

**`claim_daily_credit(day)` proves:**

- for the account `caller` and the day number `day`,
- **every daily quest live on that day is completed**: every id in `quest_lists[daily]` whose copied schedule is active
  at `day x 86,400` has a sum in `days[(caller, day)]` of at least its total;
- at least one daily quest is live that day;
- the slot's `credit` bit is clear.

Then it sets the bit, adds `credits += 1`, and emits `CreditClaimed { player_id, kind: 1, period: day, credits }`. With
the fresh definitions, the live set is Daily Run plus the three rotating quests of `day mod 3` (`quests.md`, "Four
dailies a day").

**`claim_weekly_credit(week)`** does the same with `quest_lists[weekly]`, `weeks[(caller, week)]` and the week's start.
With the fresh definitions, the set is quests 14, 15 and 16.

The credit does not need the cobble claims, or the reverse: the bits are separate. A player can claim the cobbles of the four
dailies and the day's credit in one multicall.

**One limit, accepted:** "every daily quest of that day" is the list at the time of the claim, not at that day. Adding
or removing a quest's cobbles changes which quests a past day's credit needs. Cobbles are changed rarely, by the owner, and
never lower what a player earned; a claim already made stands.

## 4. The free spawn

### 4.1 Entry point and guard

**`Challenge.spawn_free() -> u32`**, the caller for itself:

1. **[Check]** `spawn` is not paused (G4, `contracts/src/systems/challenge.cairo:426`). The pause also stops free
   games: it is the emergency stop of new games, and a free game consumes a credit.
2. **[Interaction]** Read the wiring: the collection must be set; the economy is not used.
3. **[Effect]** Spawn the game through `hostable.spawn_with`, as `spawn` does, with `GameSpawned.price = 0`. Today the
   event carries `mode.price()`; the free path passes 0.
4. **[Interaction]** `Setup.spend_credit(player_id, game_id)`:
   - an allowlisted reporter only (`'Quest: not reporter'` otherwise);
   - it reverts `'Setup: no credit'` when `credits == 0`;
   - otherwise `credits -= 1` and it emits `CreditSpent { player_id, game_id, credits }`.
5. **[Effect]** Mark the game free (section 4.2), then mint the game token to the caller as `spawn` does.

**It differs from `spawn` in three ways:**

- There is no USDC `transferFrom` and no `Economy.purchase`: nothing burned, nothing to the Vault, no LP fee, no
  referral, no terms.
- There is no stake argument.
- The game is marked free.

Estimate: about 7.0M L2 gas (**measured: 6,563,616**, against m at 15,695,888 on the same build), against the paid spawn m at 16,066,315 (`baseline.md`, "After G7a"). That is m less
`Economy.purchase` (about 8.4M) and the USDC `transferFrom` (about 1.0M), plus `spend_credit` (about 0.38M).

**Why the reporter allowlist spends credits:** the only caller that should spend a credit is the game contract that
spawns the game. The allowlist already names it, and a reporter is already trusted with every player's progress, so
with cobbles and credits through the ledger (section 7.4, A6). A separate spender role would be a second list that must
always be equal to the first.

### 4.2 The free game's game over

**Marking the game** (as built: bit 23 of the counters word and bit 126 of the tally, no map): a bit of the game's state word, carried in the game-over tally (`paved::quests::encode`,
`contracts/src/quests.cairo:36`), so the game over reads nothing more. If no bit is free, a `Challenge` map
`free_games: Map<u32, bool>`, appended, costs one read on every game over (about +77k, estimate). The implementation
chooses by measuring.

`finish` (`contracts/src/systems/challenge.cairo:503`) changes for a free game:

- **Quests:** it reports **no quest entries**, so there are no `QuestProgressed` events and no `days` or `weeks`
  writes.
- **Achievements:** it reports the achievement entries as for any game, and `Setup` adds them to the lifetime counts.
- **`Economy`:** it does **not** call `Economy.record`. `record` would revert `'Economy: unknown game'`, since the game
  was never purchased (`contracts/src/systems/economy.cairo:757`).

A paid game's game over is unchanged, apart from the ledger writes in `Setup.report` (section 1.3).

**Its rewards follow the normal rules, and they come to nothing in PAVED.** Paved's reward is `R x h(score / mean)`,
where `R` is frozen from the PAVED its purchase burned, times its stake boost (`curve::reference`,
`contracts/src/economy/curve.cairo:102-106`). A game's weight in the day's mean is its stake (`Day::add`,
`contracts/src/economy/mean.cairo:97-104`). A free game burned nothing and stakes nothing, so under the normal rules its
`R` is 0, its weight 0 and its reward 0. Leaving it out of `Economy` gives exactly that result, and leaves the
accumulator, the mean, the guard and the Vault untouched: "nothing comes in" (B4). A free game is a game played for the
quests' achievements, the leaderboard and the skins, with no PAVED at stake.

**The v1 rule (PM ruling, 2026-10-15): a free game pays 0 PAVED under the normal rules** (no burn, so no mint). The PM
tells the owner, since it touches supply (D-10). A free game that pays like a $2 game would be a mint with no burn
(`quests-v2.md`'s R3a): a later change, with a cap, a simulation and the owner's reading of D-10.

**A free game ranks in the daily leaderboard like any Challenge game (PM ruling, 2026-10-15).** The leaderboard is the
indexer's (D-20), so nothing on chain changes for it. The mark that says "free" is `GameSpawned.price == 0`, an
existing field of an existing event (section 6.2): no new event field and no flag. A paid game's `price` is never 0
(`stake >= 1`, `contracts/src/systems/economy.cairo:648-649`).

### 4.3 Abuse cases

| Case | What stops it |
|---|---|
| **A free game's rewards** | No PAVED: it is not in `Economy` (4.2). Its score does not move the mean, so it cannot push other players under the cliff. It earns the cobbles of the achievements it advances, once each, like any game |
| **Credit farming by free games** | A free game reports no quest progress, so it can never complete a day's or a week's quests. Without this, a player who completes the four dailies in one game would play for free forever after one paid game. Glitchbomb skips a reward game's quest progress too, for a reentrancy reason (Sources) |
| **Credit farming by paid games** | A daily credit needs every live daily completed by paid games of that day, so at least one paid entry ($2). The credit it buys has no PAVED value (4.2). Credits and cobbles are bound to the account, so many accounts gain nothing that can be moved |
| **Training** | Off chain, with no on-chain gain (D-22). It never reports, so it earns no cobbles, no credit and no achievement |
| **The tutorial claim** | `claim_tutorial` is unchecked (D-21, P-49 (2)), so any account can claim First Stone and its 10 cobbles. They cannot be moved, and they are a fifth of the cheapest skin. Kept (PM ruling, 2026-10-15) |
| **Surrender** (P-28's note: "if a reward ever attaches to Daily Run or Settler, revisit whether a surrender counts") | Revisited: a paid surrender still counts. It cost a full entry ($2), and Daily Run's 5 cobbles (at most $0.50 at pack prices) do not pay for it. A free game's surrender counts for the achievements only, and a credit is earned by paid play first |
| **A reporter that lies** | A reporter can credit any player any progress, so any cobbles and credits. Today the only reporter is `Challenge`, which reports for the caller of the move that ended its own game (`contracts/src/systems/setup.cairo:5-8`). The owner must never allowlist an account or an untrusted contract (audit A6) |
| **Slippage on a pack** | `min_out`, as for a game; the swap must fill whole |

## 5. X and the rarity of skins

### 5.1 X = 19

The Challenge deck is `Deck::Simple` (`contracts/src/types/mode.cairo:57-62`). It holds the 72 tiles of the base deck
(`total_count`, `contracts/src/elements/decks/simple.cairo:29-31`, `base.cairo:32-34`) and keeps 38 of them for a game
(`count`, `simple.cairo:34-36`), drawn uniformly (`contracts/src/types/deck.cairo:111-133`). The 72 tiles are of **19
distinct plans**: every `Plan` but `None` (`contracts/src/types/plan.cairo:43-64`), each at least once in the base
deck's table (`contracts/src/elements/decks/base.cairo:41-114`), with the counts its test asserts (`:167-186`).

**X = 19.** At most 19 skins are active for a player, one per plan. The starter tile is always plan `RFFFRFCFR`
(`contracts/src/models/game.cairo:159`), one of that plan's four copies.

### 5.2 The rarity table

**Formula:** `price(c) = 50 + 50 x (9 - c) / 8`, rounded to the nearest 5 (halves up). Here `c` is the plan's count
among the 72 tiles, from 1 (rarest) to 9 (commonest). The rarest plan costs 100 cobbles, the commonest 50, and the price
falls linearly with the count. A game keeps a uniform 38 of the 72, so the rarity of a plan in a game is the same ratio.

| Plan (`u8` code) | Count in 72 | Share | Price (cobbles) |
|---|---:|---:|---:|
| `CCCCCCCCC` (1) | 1 | 1.4 % | 100 |
| `SFRFRFRFR` (17) | 1 | 1.4 % | 100 |
| `FFCFFFFFC` (6) | 2 | 2.8 % | 95 |
| `WFFFFFFFR` (19) | 2 | 2.8 % | 95 |
| `CCCCCFRFC` (3) | 3 | 4.2 % | 90 |
| `CFFFCFFFC` (4) | 3 | 4.2 % | 90 |
| `FFCFFFCFF` (5) | 3 | 4.2 % | 90 |
| `RFRFFFCFR` (12) | 3 | 4.2 % | 90 |
| `RFRFRFCFF` (14) | 3 | 4.2 % | 90 |
| `SFRFRFCFR` (15) | 3 | 4.2 % | 90 |
| `CCCCCFFFC` (2) | 4 | 5.6 % | 80 |
| `RFFFRFCFR` (9) | 4 | 5.6 % | 80 |
| `SFRFRFFFR` (16) | 4 | 5.6 % | 80 |
| `WFFFFFFFF` (18) | 4 | 5.6 % | 80 |
| `FFFFCCCFF` (7) | 5 | 6.9 % | 75 |
| `FFFFFFCFF` (8) | 5 | 6.9 % | 75 |
| `RFRFCCCFR` (11) | 5 | 6.9 % | 75 |
| `RFFFRFFFR` (10) | 8 | 11.1 % | 55 |
| `RFRFFFFFR` (13) | 9 | 12.5 % | 50 |

The counts add up to 72. A whole theme of 19 skins costs 1,580 cobbles: about $111 at the 1,000 pack's price, or about
$316 at the $0.20 reference.

**Decided:** the owner sets each price with `set_skin_price(theme, plan, cobbles)`, bounded 50 to 100 (0 withdraws it from
sale; `SkinPriced` event). The table is the default for every theme. A theme may price otherwise within the bounds, by
the same calls.

### 5.3 Buying and activating

**`buy_skin(theme, plan)`:**

- **[Check]** The price is non-zero, the skin is not owned (`'Setup: skin owned'`), and `cobbles >= price`
  (`'Setup: not enough cobbles'`).
- **[Effect]** `cobbles -= price`, set the plan's bit in `skins[(caller, theme)]`.
- **[Event]** `SkinBought { player_id, theme, plan, cobbles, balance }`.

Buying does not activate.

**`set_skins(changes: Span<(plan, theme)>)`:**

- For each change, the plan is 1 to 19. The theme is either 0 (the default theme, always allowed) or a theme whose skin
  of that plan the caller owns (`'Setup: skin not owned'`).
- **[Effect]** One write of `active_skins[caller]` (B6: "one write per change"; a batch of changes is still one write).
- **[Event]** `SkinsActivated { player_id, active }`, with the packed word, so the indexer stores the whole set.

At most one theme per plan holds by construction: one `u8` per plan. "Inactive" is theme 0.

## 6. Events, ABI, indexer, deployment

### 6.1 New and changed entry points

**`Setup`, new:**

| Entry point | Who | Section |
|---|---|---|
| `set_quest_cobbles(quest_id: u32, cobbles: u8)` | owner | 3.2 |
| `set_achievement_cobbles(achievement_id: u32, cobbles: u8)` | owner | 3.2 |
| `set_pack(pack_id: u8, cobbles: u32, price: u128, active: bool)` | owner | 2.2 |
| `set_skin_price(theme: u8, plan: u8, cobbles: u8)` | owner | 5.2 |
| `buy_pack(pack_id: u8, referrer: ContractAddress, min_out: u256)` | player | 2.3 |
| `claim_quest(quest_id: u32, period: u64)` | player | 3.3 |
| `claim_achievement(achievement_id: u32)` | player | 3.3 |
| `claim_daily_credit(day: u64)`, `claim_weekly_credit(week: u64)` | player | 3.4 |
| `buy_skin(theme: u8, plan: u8)` | player | 5.3 |
| `set_skins(changes: Span<(u8, u8)>)` | player | 5.3 |
| `spend_credit(player_id: felt252, game_id: u32)` | reporter | 4.1 |
| views: `account(player_id) -> AccountView` (cobbles, credits, counts, claimed bits), `day_progress(player_id, day)`, `week_progress(player_id, week)`, `quest_cobbles(quest_id)`, `achievement_cobbles(achievement_id)`, `pack(pack_id)`, `skin_price(theme, plan)`, `skins(player_id, theme) -> u32`, `active_skins(player_id) -> Array<u8>` | anyone | |

**`Setup`, changed in behaviour, same ABI:**

- `report` writes the ledger.
- `retire_quest` and `retire_achievement` also clear the cobbles.

**`Challenge`, new:** `spawn_free() -> u32`.

**`Challenge`, changed in behaviour, same ABI:** `finish` (internal) for a free game: no quest entries, no
`Economy.record`.

**`Economy`, new:** `set_seller(seller)` (owner, once, never zero), `sell(player: ContractAddress, price: u256,
referrer: ContractAddress, min_out: u256)` (the seller only), and the view `seller()`.

**`Economy`, changed in behaviour, same ABI:** `purchase` calls the money-moving part it now shares with `sell`
(section 2.3); its referral rule also ignores the seller. Its effects on a game are unchanged.

**No entry point changes signature, and none is removed.**

### 6.2 New events

The names avoid every name of quiver's events, which are flat in `Setup`'s enum (`QuestDefined`, `QuestProgressed`,
`QuestCompleted`, `QuestClaimed`, `QuestRetired`, `QuestReporterSet`, `AchievementDefined`, `AchievementProgressed`,
`AchievementRetired`, `AchievementReporterSet`).

| Contract | Event | Keys, then data |
|---|---|---|
| `Setup` | `QuestCobblesSet` | `quest_id`; `cobbles`, `kind` |
| `Setup` | `AchievementCobblesSet` | `achievement_id`; `cobbles` |
| `Setup` | `PackSet` | `pack_id`; `cobbles`, `price`, `active` |
| `Setup` | `PackBought` | `player_id`; `pack_id`, `cobbles`, `price`, `referrer`, `balance` |
| `Setup` | `CobblesClaimed` | `player_id`; `kind` (1 quest, 2 achievement), `id`, `period`, `cobbles`, `balance` |
| `Setup` | `CreditClaimed` | `player_id`; `kind` (1 daily, 2 weekly), `period`, `credits` |
| `Setup` | `CreditSpent` | `player_id`; `game_id`, `credits` |
| `Setup` | `SkinPriced` | `theme`, `plan`; `cobbles` |
| `Setup` | `SkinBought` | `player_id`; `theme`, `plan`, `cobbles`, `balance` |
| `Setup` | `SkinsActivated` | `player_id`; `active` (the packed word) |
| `Economy` | `SellerSet` | `seller` |
| `Economy` | `Sold` | `player_id`; `price`, `referrer`, `referral`, `burned_quote`, `burned`, `margin`, `supply`, `vault_paved` |

Every balance-moving event carries the new `balance` or `credits`, so the indexer can check its sums against the chain.

`GameSpawned` keeps its fields; a free game has `price = 0`. **This is the free mark** (PM ruling 7: the design picks
an event field or a flag): the indexer stores it and the client shows it. Its `game_id`
also appears in `CreditSpent`.

### 6.3 The indexer's impact (for CLIENT)

The indexer decodes strictly: an unknown selector is a `DecodeError` and halts it
(`packages/indexer/src/events.ts:8-13`, `:401-413`). So **every event of 6.2 must be known to the indexer before the
contracts that emit them are indexed**. These are the 11 `Setup` events and the 2 `Economy` events, by name: `Setup`'s
are flat variants, so their selector is the variant's name; `Economy`'s variants are named as their structs
(`events.ts:9-10`).

It must also learn:

- **Free games:** a free game (`GameSpawned.price == 0`) has no `Purchased`, `Recorded` or `Settled`. Joins on those
  must not drop it. **It ranks in the daily leaderboard like any Challenge game, marked free** (PM ruling, 2026-10-15;
  recorded for CLIENT). No value on chain depends on the leaderboard, and since On the Podium has no cobbles (3.1), it
  credits none.
- **Packs:** `PackBought` on `Setup` and `Sold` on `Economy`, in the same transaction. `Sold` carries the referral as
  `Purchased` does, so referral totals sum both events.
- **Quest progress:** the per-day progress the indexer derives from `QuestProgressed` is unchanged, since a free game
  emits none. For a claim button, the authority is the views `day_progress`, `week_progress` and `account`, or the
  ledger rebuilt from the same reports. Both give the same sums.
- **New API rows** (CLIENT's names): cobbles and credits per player, claimed bits per period, packs, skin prices, owned
  skins, active skins.

New entry points for the client's ABI pattern: the `Setup` entry points of 6.1, `Challenge.spawn_free` and the
`Economy` views. CLIENT regenerates its ABI from `contracts/abis/` (`scripts/abis.sh`) in the implementation's pull
request.

### 6.4 The fresh deployment (Sepolia is deployed fresh)

`scripts/deploy.sh`'s fresh path adds the following, each read back by a view (no storage-slot reads are needed, since
the views exist). Each goes in the same multicall as the definitions, after them:

1. The new `Setup`, `Challenge` and `Economy` classes.
2. `Economy.set_seller(Setup)`.
3. `Setup.set_pack` x 4, the owner's tiers (2.1): `(1, 50, 5,000,000, true)`, `(2, 100, 9,000,000, true)`,
   `(3, 500, 40,000,000, true)`, `(4, 1,000, 70,000,000, true)`.
4. `Setup.set_quest_cobbles` x 13 (3.1).
5. `Setup.set_achievement_cobbles` x 15: every achievement but 9.
6. No skin prices until a theme's art exists. A theme without prices sells nothing. When theme 1 ships,
   `set_skin_price(1, p, price)` for the 19 plans of 5.2.

The reporter allowlist (`set_reporter(Challenge, true)`) already exists and now also allows `spend_credit`. Nothing
new is deployed beyond the three classes, and no role is added: the owner of each system is the deployer, as today.

## 7. Test plan and audit lens

### 7.1 Unit tests (`Setup`, `Economy`, `Challenge`)

- **Packing:** every packed slot (`accounts`, `days`, `weeks`, `quest_cobbles`, `achievement_cobbles`, `packs`,
  `active_skins`) round-trips at zero, at one, and at every field's maximum. The saturating counters stop at their
  maximum and never wrap.
- **Calendar:**
  - day and week numbers at the boundaries: 00:00:00 and 23:59:59 UTC, Sunday 23:59:59 to Monday 00:00:00;
  - the week of 1970-01-05 is week 0;
  - `is_active` on the copied schedules for every fresh quest, for 9 consecutive days and 3 weeks.
- **Setters:** each owner setter refuses a non-owner, every bound (cobbles out of 5 to 15 or 10 to 90, a shape that is
  neither daily nor weekly, a task the ledger does not sum, a total above 65,535, an id above 63, a pack with zero cobbles
  or price), and emits its event.
- **Claims:**
  - success;
  - the second claim reverts `'Setup: claimed'`;
  - not completed, by one count under the total;
  - not live: the wrong day of a rotating quest, a week before the start;
  - no cobbles;
  - a retired quest;
  - First Stone before and after `claim_tutorial`;
  - achievement 9 refused.
- **Credits:** each daily missing one quest by one count; a day with no live daily; a second claim; the weekly
  equivalent.
- **Skins:**
  - buy with too few cobbles, a second buy, a price of 0;
  - activate an unowned skin; theme 0 is always allowed;
  - a batch of 19 changes is one write;
  - two changes of the same plan in one batch: the last wins, as specified, and is tested.
- **`sell`:**
  - the seller only;
  - a price not on `Economy`;
  - **the split equals the game's:** for the same price, referrer and pool state, `sell` and `purchase` (stake-1
    price, or a price set equal) give the same referral, burn quote, margin, PAVED burned and PAVED to the Vault;
  - the referral rule: a zero referrer, the buyer, the Vault, the router, `Economy`, `Challenge` and `Setup` are each
    ignored with no revert; any other address gets `referral_bps` of the price;
  - `min_out` and a partial fill revert;
  - no terms, no player per game, no day and no mean written.

### 7.2 Integration (`tests::e2e`, through the real contracts)

- **The report:** a paid game over writes `days`, `weeks` and `accounts` with the tally's sums (every counter at 0 and
  at its maximum, as `e2e::quests` does today). A free game over writes `accounts` only, emits no `QuestProgressed`, and
  makes no `Economy` call. A move that does not end a game writes nothing.
- **Pack purchase, end to end:**
  - USDC leaves the player;
  - `Economy` holds nothing after the call;
  - the Vault's PAVED rises by the margin's part;
  - the supply falls by the burn;
  - the referrer gets 5 % of the price in USDC, or nothing for an ignored referrer;
  - cobbles are credited;
  - with no approval, the call reverts and nothing changes.
- **The day's credit, end to end:** play paid games on a rotating day until the four dailies are met, claim the four
  cobbles and the credit, spawn free, finish it, and check that the credit is gone and the day's sums are unchanged by the
  free game.
- **Pause:** `spawn_free` refuses while paused; a free game in flight still ends.
- **`spawn_free` with no credit:** it reverts, and no game is created and no token minted.
- **Goldens and parity unchanged:** a paid game's score and moves do not change. `git diff` of the goldens is empty.

### 7.3 Gas (`contracts/tests/gas.cairo`)

New scenarios, measured on Linux (VPS or CI), with figures recorded in `docs/measures/baseline.md`:

- `claim_quest`, `claim_achievement`, `claim_daily_credit`, `claim_weekly_credit`;
- `buy_pack` with no referrer and with one;
- `buy_skin`, `set_skins` with 1 and 19 changes;
- `spawn_free`, and a free game's game over.

The paid game overs g, i, k, l and s get new ceilings. **The +0.59M per paid game over is an estimate**: the
implementation PR measures it (the PM's ruling of 2026-10-15 names the tool G6; the repository's gas bench is this
file) and states the figure against P-22's guard (+1.5M). Above the guard, the change goes back to the PM before
merging. The spawns m and n must not move beyond the deck noise G7a
describes.

### 7.4 Fuzz, where value moves

- **The ledger:** random reports (random tallies, random block times across days and weeks), each followed by every
  claim the ledger allows. The cobbles credited must equal the sum of the cobbles of exactly the (quest, period) and
  achievement pairs whose targets the reports met, and no claim may succeed twice.
- **The split:** random prices and referrers. `sell` and `purchase` split a price the same way, and the referral, the
  burn quote and the margin add up to the price.
- **Skins:** random sequences of buys and activations. `cobbles` never goes negative, and the active theme of every plan
  is 0 or an owned theme.

### 7.5 The audit lens: value and access

An auditor checks these properties, each against the code and the tests above:

- **A1 No cobble minted outside a claim or a purchase.** `accounts.cobbles` grows only in `claim_quest`,
  `claim_achievement` and `buy_pack`, each by an amount read from owner-set storage. `buy_pack` adds cobbles only after a
  successful payment of exactly the pack's price, in the same transaction.
- **A2 No double claim.** Each claim sets its bit in the same write that credits the cobbles: per (player, quest, period),
  per (player, achievement), and the credit bit per (player, day) and (player, week). No path clears a bit.
- **A3 No transfer path.** No entry point moves cobbles, credits or skins from one account to another, or acts for an
  address other than the caller. The exceptions are `report` and `spend_credit`, reporter only, which name the player.
  There is no ERC-20 or ERC-721 surface for cobbles or skins.
- **A4 Cobbles are spent only on skins.** `cobbles` falls only in `buy_skin`, by the skin's price, and only for a skin not
  yet owned.
- **A5 A credit is spent once.** `credits` falls only in `spend_credit`, by one, for one spawned game, and only when
  positive. A failed spawn reverts the decrement. A credit is earned only by `claim_daily_credit` or
  `claim_weekly_credit`, once per period.
- **A6 Access.**
  - Every setter is owner only.
  - `report` and `spend_credit` are reporter only, and the reporter list is owner only.
  - `sell` is seller only, and the seller is set once.
  - The auditor states the residual trust: a reporter can credit arbitrary progress, so arbitrary cobbles and credits.
- **A7 A free game brings nothing into the Vault, and takes nothing out.** `spawn_free` makes no token transfer and no
  `Economy` call. Its game over makes no `Economy.record`. No `settle` can pay it (`'Economy: unknown game'`).
- **A8 A free game cannot earn a credit.** Its game over reports no quest entries.
- **A9 A pack's split is the game's.** `sell` and `purchase` run the same money-moving code, with the same
  `burn_bps`, `referral_bps` and referral rule. The referral, the burn quote and the margin add up to the price. `Setup`
  holds no USDC after `buy_pack`, and `Economy` holds none after `sell`, beyond what its existing rule keeps for the next
  swap.
- **A10 The pack price is the owner's.** The client cannot pass a price: `buy_pack` reads it from storage.

## 8. Decided and open

### Decided within the rulings (each with what reverses it)

1. **Everything in `Setup`**, after Glitchbomb's layout; `Challenge` gains `spawn_free`; `Economy` gains `sell`.
   Reversal: a separate `Shop` system if `Setup`'s CASM passes 50 % of the cap.
2. **The proof of claims is `Setup`'s own ledger**: one slot per (player, day), one per (player, week), and one per
   player, written by the report. It is not quiver's storage mode, which is above the P-22 guard, and not the indexer,
   which would be a trusted minter. Reversal: the measured report cost passes the guard; then the weekly slot goes, and a
   weekly claim sums seven day slots.
3. **Packs are priced in USDC base units**, the game price's source (a constant, no oracle), set by `Setup`'s owner.
   `Setup` reads the USDC address from `Economy`.
4. **A pack's swap moves the guard's rate**, at most once per block, as a game's purchase does, because it runs the
   same code. Reversal: the audit finds the guard needs game purchases only; then `sell` skips that one step.
5. **Cobbles per quest:** 5, 10 or 15 by the family's target; Daily Run 5; weeklies 15. **Cobbles per achievement: its
   points.**
6. **Claims are by the player, for itself, never automatic**; past periods have no deadline.
7. **A free game** is not in `Economy`, reports no quest progress but does report achievement progress, obeys the spawn
   pause, and spends its credit through the reporter allowlist.
8. **X = 19**, from the code. The default skin price is `50 + 50 x (9 - c) / 8`, rounded to 5.
9. **A paid surrender still counts** for Daily Run and Settler (P-28's note revisited).
10. **The free mark is `GameSpawned.price == 0`**, an existing field, not a new flag.

### Decided by the owner (2026-10-15, P-61 section C)

1. **Pack revenue takes the game's split**, swapped to PAVED: 70 % burned, 25 % to the Vault, 5 % to the LP, with the
   game's referral (5 % of the price out of the Vault's part, the same addresses ignored, plus the seller). Fixed, not a
   default: a pack runs the game's own code in `Economy` (section 2.3). There is no treasury share.
2. **Progressive tiers** replace B1's list: 50 cobbles for $5 (-50 %), 100 for $9 (-55 %), 500 for $40 (-60 %) and 1,000
   for $70 (-65 %), from the reference of 100 for $20. These are the fresh deployment's defaults, configurable by
   `Setup`'s owner (`set_pack`). The same price per cobble for two packs no longer holds.

### Decided (PM ruling, 2026-10-15)

1. **A free game pays 0 PAVED under the normal rules** (no burn, so no mint): the v1 rule. The PM tells the owner,
   since it touches supply (D-10). A paying free game would be a later change.
2. **The earn rate is accepted as designed**, about 1,240 cobbles a month from quests and 580 once from achievements. It
   is calibrated on Sepolia with measured figures, and the amounts stay configurable by `Setup`'s owner.
3. **On the Podium has no cobbles in v1.**
4. **First Stone's 10 cobbles are kept**, from the unchecked tutorial claim. Cobbles cannot be moved, so a farmed 10 has no
   market value, and there is one claim per account.
5. **Free games rank in the daily leaderboard** like any Challenge game. The indexer marks them free from
   `GameSpawned.price == 0`, so the client can show it. Recorded for CLIENT.
6. **The +0.59M L2 gas per paid game over was an estimate**; part 1 measured +940,298 with three slots (#440), within the
   guard. The implementation PR measures it and states it against
   P-22's guard (section 7.3).

### Open

Nothing is open in this design. The implementation's measures (section 7.3) may send the report's cost back to the PM
under P-22's guard.
