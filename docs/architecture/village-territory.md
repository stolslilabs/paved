# The village territory: owned cells, placement and score (#640, design)

Track CORE's design for #640, part of the PvP plan #637. #642 (rewards and tiers) and #643 (attacks) build on it.

The owner's decisions of 2026-10-20 bind:

- The territory is bought cell by cell (parcels) and stays connected.
- No border rule: a side facing a cell not owned has no constraint and stays open, so a forest facing out is not
  closed. At most 38 cells.
- Parcels cost Cobbles and are gated by the player's level (#641): a player at level 4 cannot buy the 5th parcel,
  whatever their Cobbles, until they reach level 5.
- Forced placement: a tile is placed when it is received (#642), with no rearranging.

The owner ruled on the open points on 2026-10-21 (on #640; section 7 holds the decision rows): the 3 x 3 start, the price
and level table (a), and demolition at a doubling daily price. Point 4 stays as proposed. Everything else here is a
proposal the team may improve.

## 1. Summary

- **A new system, `Village`** (`contracts/src/systems/village.cairo`), modelled on `Story`: it embeds the engine
  (placement, structure state, assessment) and keeps one game per player in its own `PavedStorage`. `Story` is not
  made bigger.
- **A village is a game that never ends.** Founding it writes the usual starter (`RFFFRFCFR` facing South) at
  `(CENTER, CENTER)` and gives the 3 x 3 of cells around it (proposal, section 7.1). Each tile placed is built as in a
  game: the same `assert_fits` (at least one placed side neighbour, the same category on every facing edge), the same
  structure state, and a structure scores when it closes. The village's score is that game's score.
- **The territory rule is one more check before the move**: the cell is owned. Nothing else changes. A side facing a
  cell not owned is an empty position for the engine, so a structure that reaches it stays open until the cell is
  bought and a tile placed on it: that is the "no border rule" with no code of its own.
- **`buy_parcel(x, y)`**: the caller's village, a cell not owned, next to an owned one (so the territory stays
  connected), at most 38 cells, the caller's level at least the parcel's number, then the price debited on `Setup`'s
  ledger. The 9 starting cells are not parcels: the first one bought is parcel 1.
- **Placement is not a player call.** Forced placement means the tile comes from #642's reward. `Village` exposes
  `place(player_id, plan, orientation, x, y)` to the placers the owner allows (#642's system, as `Story` is a
  reporter of `Setup`); #642 may instead add its entry point to `Village` and call the same internal function.
- **`demolish(x, y)`** (the owner's decision): the caller takes a placed tile out of its village, never the starter, for 5
  Cobbles doubled after each demolition of the chain day (5, 10, 20, 40...), back to 5 the next day; no refund. The
  structure state cannot take a tile out, so the village is rebuilt (section 3a).
- **The off-chain engine gets the same rules**: a territory mask on `EngineGame` (`territory`), the parcel rule, forced
  placement and the demolition's rebuild, and a parity test that replays one village on both sides.

## 2. Storage (`Village`)

Coordinates, not a bitmap (the issue left it to the design):

- The territory is at most 38 cells and connected, so a cell is at most 30 cells from the starter (29 parcels in a
  line beyond the 3 x 3). A bitmap over that bounded grid would be 61 x 61 = 3,721 bits, 15 felts, and a parcel's
  four neighbours would span three rows. A map keyed by the cell reads one slot per neighbour, and the view lists the
  cells in purchase order.
- Every coordinate stays within 31 of `CENTER` (`0x7fffffff`), so the engine's `u32` bounds are never near.

| Variable | Key | Value |
|---|---|---|
| `setup: ContractAddress` | | the `Setup` whose ledger is debited (constructor, `set_setup`) |
| `levels: ContractAddress` | | the contract whose `level(player_id)` gates the parcels (#641); zero: every player is level 1 (section 5) |
| `placers: Map<ContractAddress, bool>` | placer | allowed to place tiles (owner, `set_placer`) |
| `villages: Map<felt252, felt252>` | `player_id` | `game_id` [0, 32) · `cells` [32, 40) (the 9 included) · `tiles` [40, 48) (placed, the starter excluded); 0: no village |
| `parcels: Map<(felt252, u8), felt252>` | `(player_id, parcel)` | the cell of parcel `parcel` (1 to 29): `x` [0, 32) · `y` [32, 64) |
| `owned: Map<(felt252, u32, u32), u8>` | `(player_id, x, y)` | the parcel's number, 0 when not bought |
| `demolitions: Map<felt252, felt252>` | `player_id` | `day` [0, 64) · `count` [64, 96): the demolitions of that chain day; a word of another day reads as 0 |

The 9 starting cells are not written: a cell is owned when it is in the 3 x 3 around `CENTER` or `owned` is non-zero.
That saves 18 writes at founding.

The village's tiles, structures and score are the game's, in `PavedStorage` under `selector!("paved")` (no member
named `paved`): `game_configs`, `game_states`, `tiles`, `tile_positions`, `structures`. Tile 1 is the starter; placed
tiles take ids 2 to 38, which fit the 8 bits of `tile_positions`. The game's mode is `Challenge` (solo: one player,
nothing walked at scoring), its `tile_limit` 38; it is never over and never draws.

Upgrades (`upgrades.md`): every name is new, `Village` is upgradable (OpenZeppelin's `upgrade`, the repository's
`OwnableComponent`), and a pin test reads each variable at the raw address of its name.

## 3. Calls

| Call | Who | Checks, in order | Effects |
|---|---|---|---|
| `found()` | any account, once | no village yet (`Village: already founded`) | a game; the starter; emits `VillageFounded` |
| `buy_parcel(x, y)` | the village's player | a village (`Village: no village`); the cell not owned (`Village: cell owned`); a side neighbour owned (`Village: not adjacent`); under 38 cells (`Village: territory full`); level >= parcel (`Village: level too low`); the price on `Setup` (`Setup: not enough cobbles`) | the cell; the Cobbles debited; emits `ParcelBought` |
| `place(player_id, plan, orientation, x, y)` | an allowed placer (`Village: not placer`) | a village; a plan 1 to 19, an orientation 1 to 4; the cell owned (`Village: cell not owned`); free (`Tile: already exists`); fits (`Tile: no neighbors`, `Tile: cannot place`) | the tile built and assessed (the engine's `Built` and `Scored`); emits `TilePlaced`; returns the points |
| `demolish(x, y)` | the village's player | a village; a placed tile there (`Village: no tile`), not the starter (`Village: starter stays`); the price on `Setup` (`Setup: not enough cobbles`) | the day's counter; the village rebuilt in a new game; the Cobbles debited; emits `TileDemolished`; returns the price |
| `set_setup`, `set_levels`, `set_placer`, `upgrade` | the owner | non-zero (`set_setup`) | emit `SetupSet`, `LevelsSet`, `PlacerSet` |

Views: `village(player_id)` (game, cells, tiles, score, next parcel's price and level), `cells(player_id)` (in order:
the 9, then the parcels), `tiles(player_id)` (plan, orientation, x, y, by id), `is_owned(player_id, x, y)`,
`parcel_price(parcel)`, `parcel_level(parcel)`, `next_demolition(player_id)` (the chain day, the demolitions made that
day, the price of the next: what the client shows), `setup`, `levels`, `is_placer`.

`Setup` gains `ISetupVillage::spend_parcel(player_id, parcel, cobbles) -> u64`: an allowlisted reporter only (as
`credit_story`), it debits the account or reverts `Setup: not enough cobbles`, emits `ParcelPaid` with the balance,
and returns it; `spend_demolition(player_id, day, count, cobbles) -> u64` does the same for a demolition and emits
`DemolitionPaid`. The owner adds `Village` to the reporters, as for `Story`.

## 3a. Demolition (the owner's decision of 2026-10-21)

- **The price**: `demolition_price(count) = 5 x 2^count`, `count` the demolitions the player already made that chain
  day; the exponent stops at 58 (`5 x 2^58`, the last price under `u64`, far above any balance). No daily cap: the price
  explodes.
- **The day**: the quests' clock, `block_time / 86400` (`Setup`'s `DAY`). The counter is one slot per account (`day`,
  `count`); a slot of an earlier day reads as count 0, so the reset costs no write. A demolition that reverts (short of
  Cobbles) reverts its count with it.
- **No refund**: the tile is gone; nothing is credited, no copy is kept (#642's tiers count what is placed).
- **The rebuild**: the union-find structure state has no removal, and a closed structure may reopen. `demolish` starts a
  new game for the village (the starter at the centre), replays every other placed tile in its placement order as a move
  (placed on the structure state, assessed when it closes a structure; the neighbour check is skipped, since the edges
  matched when each was placed and a tile may have lost its only neighbour), and points the village at it. The score is
  the new game's: the village scores as if the demolished tile had never been placed. The old game stays as dead storage.
  The tiles keep their order and are renumbered (ids 2 on); the territory does not change. The replay emits the `Scored`
  of the rebuilt structures again, under the new game id.
- **The engine** does the same (`EngineGame.demolish`, `demolitionRefusal`, `demolitionPrice`), and the parity fixture
  holds demolitions.

## 4. Events

- `VillageFounded { #[key] player_id, game_id }`.
- `ParcelBought { #[key] player_id, parcel, x, y, cells, cobbles, level }`: `level` is the level the gate read.
- `TilePlaced { #[key] player_id, game_id, tile_id, plan, orientation, x, y, points, score }`: `points` the move
  scored, `score` the village's after it.
- The engine's own `Built` and `Scored` (game id, tile id, category, size, points), from `Village`.
- `TileDemolished { #[key] player_id, tile_id, plan, x, y, day, count, cobbles, game_id, score }`: `tile_id` in the game
  it left, `count` the day's demolitions after it, `game_id` and `score` the rebuilt village's.
- `Setup`'s `ParcelPaid { #[key] player_id, parcel, cobbles, balance }` and
  `DemolitionPaid { #[key] player_id, day, count, cobbles, balance }`.

The indexer applies `ParcelPaid` and `DemolitionPaid` to the Cobbles balance (`parcel_purchases`,
`demolition_purchases`, schema 17; it halts on a parcel out of order, a day's demolition out of order or at another
price, or a balance that does not follow). The tables of `Village`'s own events (`villages`, `village_cells`,
`village_tiles`) wait for `Village`'s deployment: a follow-up (section 9).

## 5. The level gate and #641

#641 (XP and level) has no interface yet. `Village` reads the level through a one-function interface,
`IPlayerLevel::level(player_id) -> u32`, at the address `levels` the owner sets. Until #641 lands, `levels` is zero and
every player is level 1, so only parcel 1 can be bought: the gate fails closed. When #641 lands, the owner sets
`levels` to the contract that holds the level (or #641 implements `IPlayerLevel` where it stores it); no upgrade of
`Village` is needed if the signature is kept.

## 6. The off-chain engine (`packages/game-core/src/engine`)

- `EngineConfig.territory?: readonly { x, y }[]` (relative coordinates, as the rest of the engine): when it is given,
  `refusal` returns `Village: cell not owned` for a cell outside it, before the engine's other checks, and
  `legalPlacements` keeps only owned cells. `territory` is a mask, not a deck: the caller (the village screen, #643's
  replay) passes the defender's cells.
- `EngineGame.village({ territory, player? })` starts a village: the starter at `(0, 0)`, no deck and no draw;
  `place(plan, placement)` builds a given plan (forced placement) with the same legality and scoring as `build`.
- A parity test replays one village with the same parcels and tiles in snforge and in vitest and compares the score
  after every tile and the refusal of a tile placed outside the territory.

## 7. Decision rows (owner, 2026-10-21, on #640)

| # | Point | Decision |
|---|---|---|
| 1 | The starting territory | 9 cells, the 3 x 3 around the starter. The "38 tiles" count does not matter: the starter is simply the first cell, and the territory keeps the issue's cap of 38 cells (9 + 29 parcels). |
| 2 | The price and level table | (a): parcel `k` (1 to 29) needs level `k` and costs `10 x k` Cobbles (4,350 for all 29). |
| 3 | Demolition | Allowed, at a fixed price that doubles after each use and resets every day: 5 Cobbles (5, 10, 20, 40, 80...), the chain's day (the quests' clock), a per-account daily counter in storage, no refund of the tile, no daily cap (section 3a). |
| 4 | A tile with no legal cell | As proposed: the normal rule (at least one placed side neighbour) is kept; a reward whose tiles fit nowhere offers only the Cobbles or the merge (#642). |

## 8. Size, gas and tests

Measured after the code (section 9, as built): `Village`'s and `Setup`'s CASM against the cap
(`scripts/class-sizes.sh`), the gas of `found`, `buy_parcel` and `place` (`contracts/tests/gas.cairo`), snforge
tests under `paved::tests::village`, a fuzz of the territory invariant (connected, at most 38, the price paid equals
the sum of the curve), and the audit of the Cobbles path (`spend_parcel`, the reporter allowlist).
