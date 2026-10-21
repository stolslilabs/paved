# The village territory: owned cells, placement and score (#640, design)

Track CORE's design for #640, part of the PvP plan #637. #642 (rewards and tiers) and #643 (attacks) build on it.

The owner's decisions of 2026-10-20 bind:

- The territory is bought cell by cell (parcels) and stays connected.
- No border rule: a side facing a cell not owned has no constraint and stays open, so a forest facing out is not
  closed. At most 38 cells.
- Parcels cost Cobbles and are gated by the player's level (#641): a player at level 4 cannot buy the 5th parcel,
  whatever their Cobbles, until they reach level 5.
- Forced placement: a tile is placed when it is received (#642), with no rearranging.

Everything else here is a proposal. The open points are in section 7, and were posted for the owner on #640; the code
builds on the proposals until the owner answers there.

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
- **The off-chain engine gets the same rule**: a territory mask on `EngineGame` (`territory`), and a parity test
  that replays one village on both sides.

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
| `set_setup`, `set_levels`, `set_placer`, `upgrade` | the owner | non-zero (`set_setup`) | emit `SetupSet`, `LevelsSet`, `PlacerSet` |

Views: `village(player_id)` (game, cells, tiles, score, next parcel's price and level), `cells(player_id)` (in order:
the 9, then the parcels), `tiles(player_id)` (plan, orientation, x, y, by id), `is_owned(player_id, x, y)`,
`parcel_price(parcel)`, `parcel_level(parcel)`, `setup`, `levels`, `is_placer`.

`Setup` gains `ISetupVillage::spend_parcel(player_id, parcel, cobbles) -> u64`: an allowlisted reporter only (as
`credit_story`), it debits the account or reverts `Setup: not enough cobbles`, emits `ParcelPaid` with the balance,
and returns it. The owner adds `Village` to the reporters, as for `Story`.

## 4. Events

- `VillageFounded { #[key] player_id, game_id }`.
- `ParcelBought { #[key] player_id, parcel, x, y, cells, cobbles, level }`: `level` is the level the gate read.
- `TilePlaced { #[key] player_id, game_id, tile_id, plan, orientation, x, y, points, score }`: `points` the move
  scored, `score` the village's after it.
- The engine's own `Built` and `Scored` (game id, tile id, category, size, points), from `Village`.
- `Setup`'s `ParcelPaid { #[key] player_id, parcel, cobbles, balance }`.

The indexer keeps a `villages` table (player, game, cells, tiles, score), `village_cells` (player, parcel, x, y) and
`village_tiles` (player, tile id, plan, orientation, x, y), and applies `ParcelPaid` to the Cobbles balance.

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

## 7. Open points (for the owner, posted on #640)

1. **The starting territory.** Proposed: 9 cells, the 3 x 3 around the starter, which counts in the 38 (so 29
   parcels and 37 tiles at most, the 37 draws of a 38-tile game). The starter is the usual one at the centre.
2. **The price and level table.** Built as (a), which matches the owner's example (the 5th parcel needs level 5):
   parcel `k` (1 to 29) needs level `k` and costs `10 x k` Cobbles (4,350 for all 29). The other proposal, (b), is
   the client's fake: `20 x (cells - 8)` Cobbles and one more level every 4 cells. Both are two pure functions
   (`parcel_price`, `parcel_level`): a ruling changes them and their tests only.
3. **Demolition** of a placed tile: none (proposed). Forced placement and no rearranging; nothing is built for it.
4. **A tile with no legal cell.** Forced placement needs a free owned cell where the tile fits. Proposed: the
   normal rule (at least one placed side neighbour) is kept, so a parcel bought far from the tiles is used once the
   tiles reach it; a reward whose tiles fit nowhere offers only the Cobbles or the merge (#642).

## 8. Size, gas and tests

Measured after the code (section 9, as built): `Village`'s and `Setup`'s CASM against the cap
(`scripts/class-sizes.sh`), the gas of `found`, `buy_parcel` and `place` (`contracts/tests/gas.cairo`), snforge
tests under `paved::tests::village`, a fuzz of the territory invariant (connected, at most 38, the price paid equals
the sum of the curve), and the audit of the Cobbles path (`spend_parcel`, the reporter allowlist).
