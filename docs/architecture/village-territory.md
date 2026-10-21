# The village territory: owned cells, placement and score (#640, design)

Track CORE's design for #640, part of the PvP plan #637. #642 (rewards and tiers) and #643 (attacks) build on it.

The owner's decisions of 2026-10-20 bind:

- The territory is bought cell by cell (parcels) and stays connected.
- No border rule: a side facing a cell not owned has no constraint and stays open, so a forest facing out is not
  closed. At most 38 cells (refined on 2026-10-21, decision 1: no size tied to a game's 38 tiles; section 7).
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
  connected), under the owner's cap (`max_cells`), the caller's level at least the parcel's number, then the price debited on `Setup`'s
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

- The territory is at most `MAX_CELLS_LIMIT` (100) cells and connected, so a cell is at most 92 cells from the starter
  (91 parcels in a line beyond the 3 x 3). A bitmap over that bounded grid would be 185 x 185 = 34,225 bits, 137 felts,
  and a parcel's four neighbours would span three rows. A map keyed by the cell reads one slot per neighbour, and the view lists the
  cells in purchase order.
- Every coordinate stays within 93 of `CENTER` (`0x7fffffff`), so the engine's `u32` bounds are never near.

| Variable | Key | Value |
|---|---|---|
| `setup: ContractAddress` | | the `Setup` whose ledger is debited (constructor, `set_setup`) |
| `placers: Map<ContractAddress, bool>` | placer | allowed to place tiles (owner, `set_placer`) |
| `max_cells: u8` | | the most cells a territory may hold, the 9 included (constructor, `set_max_cells`; 9 to `MAX_CELLS_LIMIT` = 100) |
| `villages: Map<felt252, felt252>` | `player_id` | `game_id` [0, 32) · `cells` [32, 40) (the 9 included) · `tiles` [40, 48) (placed, the starter excluded); 0: no village |
| `parcels: Map<(felt252, u8), felt252>` | `(player_id, parcel)` | the cell of parcel `parcel` (1 to `max_cells - 9`): `x` [0, 32) · `y` [32, 64) |
| `owned: Map<(felt252, u32, u32), u8>` | `(player_id, x, y)` | the parcel's number, 0 when not bought |
| `demolitions: Map<felt252, felt252>` | `player_id` | `day` [0, 64) · `count` [64, 96): the demolitions of that chain day; a word of another day reads as 0 |

The 9 starting cells are not written: a cell is owned when it is in the 3 x 3 around `CENTER` or `owned` is non-zero.
That saves 18 writes at founding.

The village's tiles, structures and score are the game's, in `PavedStorage` under `selector!("paved")` (no member
named `paved`): `game_configs`, `game_states`, `tiles`, `tile_positions`, `structures`. Tile 1 is the starter; placed
tiles take ids 2 on (at most 100, within the 8 bits of `tile_positions`). The game's mode is `Challenge` (solo: one
player, nothing walked at scoring), its `tile_limit` 100; it is never over and never draws.

Upgrades (`upgrades.md`): every name is new, `Village` is upgradable (OpenZeppelin's `upgrade`, the repository's
`OwnableComponent`), and a pin test reads each variable at the raw address of its name.

## 3. Calls

| Call | Who | Checks, in order | Effects |
|---|---|---|---|
| `found()` | any account, once | no village yet (`Village: already founded`) | a game; the starter; emits `VillageFounded` |
| `buy_parcel(x, y)` | the village's player | a village (`Village: no village`); the cell not owned (`Village: cell owned`); a side neighbour owned (`Village: not adjacent`); under `max_cells` (`Village: territory full`); level >= parcel (`Village: level too low`); the price on `Setup` (`Setup: not enough cobbles`) | the cell; the Cobbles debited; emits `ParcelBought` |
| `place(player_id, plan, orientation, x, y)` | an allowed placer (`Village: not placer`) | a village; a plan 1 to 19, an orientation 1 to 4; the cell owned (`Village: cell not owned`); free (`Tile: already exists`); fits (`Tile: no neighbors`, `Tile: cannot place`) | the tile built and assessed (the engine's `Built` and `Scored`); emits `TilePlaced`; returns the points |
| `demolish(x, y)` | the village's player | a village; a placed tile there (`Village: no tile`), not the starter (`Village: starter stays`); the day's price at most `2^32 - 1` (`Village: price too high`); the price on `Setup` (`Setup: not enough cobbles`) | the day's counter; the village rebuilt in a new game; the Cobbles debited; emits `TileDemolished`; returns the price |
| `set_setup`, `set_max_cells`, `set_placer`, `upgrade` | the owner | non-zero (`set_setup`); 9 to 100 (`set_max_cells`, `Village: invalid max cells`) | emit `SetupSet`, `MaxCellsSet`, `PlacerSet`; a cap lowered under a village leaves its cells, it buys no more |

Views: `village(player_id)` (game, cells, tiles, score, next parcel's price and level), `cells(player_id)` (in order:
the 9, then the parcels), `tiles(player_id)` (plan, orientation, x, y, by id), `is_owned(player_id, x, y)`,
`parcel_price(parcel)`, `parcel_level(parcel)` (defined for parcels 1 to 91), `max_cells`, `next_demolition(player_id)` (the chain day, the demolitions made that
day, the price of the next: what the client shows), `setup`, `is_placer`.

`Setup` is not changed. `Village` pays with `ISetupSpend::spend_cobbles(player_id, cobbles, reason)` (#639's spender
allowlist, `Setup: not spender` otherwise): it debits the account or reverts `Setup: not enough cobbles`, and emits
`CobblesSpent` with the reason `'VILLAGE_PARCEL'` or `'VILLAGE_DEMOLISH'` and the balance. The owner adds `Village` to
the spenders (`set_spender`). An earlier draft added `spend_parcel` and `spend_demolition` to `Setup`; the shared spend
path landed on main meanwhile, and using it keeps `Setup` at its size (it was 50.5 % of the cap with the draft, past
P-64's 50 % review point).

## 3a. Demolition (the owner's decision of 2026-10-21)

- **The price**: `demolition_price(count) = 5 x 2^count`, `count` the demolitions the player already made that chain
  day, doubled after each one with no cap (a `u128`; it saturates only past count 125, never reached). No daily cap: the
  price explodes. `Setup.spend_cobbles` takes a `u32`, so one demolition is paid at most `MAX_DEMOLITION_PRICE`
  (`2^32 - 1`): the 30th of a day costs `5 x 2^29` (2,684,354,560), the 31st `5 x 2^30` (5,368,709,120) and is refused
  (`Village: price too high`), whatever the balance; it is never charged a lower price. (The first build clamped the
  exponent at 29, so the 31st cost the 30th's price again; the review of #669 caught it.)
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
- `Setup`'s `CobblesSpent { #[key] player_id, spender, reason, cobbles, balance }` (#639), `reason` `'VILLAGE_PARCEL'`
  or `'VILLAGE_DEMOLISH'`.

The indexer already applies `CobblesSpent` to the Cobbles balance (`cobble_spends`): nothing to add for the ledger. The
tables of `Village`'s own events (`villages`, `village_cells`, `village_tiles`) wait for `Village`'s deployment
(`scripts/deploy.sh` and the indexer's sources): a follow-up.

## 5. The level gate and #641

#641 landed (`docs/architecture/xp-level.md`): the level is a pure function of the XP that `Setup` keeps, read with
`ISetupLevel::player_level(player_id).level` (level 1 at 0 XP, level `L` from `50 L (L - 1)` XP). `buy_parcel` reads it
from the same `Setup` it pays, so parcel 1 is open at once, and parcel `k` needs level `k`. The draft's stand-in (an
owner-set `levels` address, level 1 while unset) is gone; it was never deployed, so no slot is left behind.

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
| 1 | The starting territory | 9 cells, the 3 x 3 around the starter; the starter is simply the first cell. The "38 tiles" count does not matter: **no village size is tied to it.** Built as: the cap is an owner-set parameter of `Village` (`max_cells`, given to the constructor and changed by `set_max_cells`), not a constant from the deck size. Why a cap stays at all: the level gate and the price bound how fast a territory grows, not how far, and the demolition replays every tile left in one transaction, so the cap keeps that rebuild (and the 8-bit tile ids) bounded; the owner may set it from 9 to `MAX_CELLS_LIMIT` (100), a technical limit to revisit with the demolition's gas. The deployment's value is the owner's (38 is the value proposed, the issue's first figure). |
| 2 | The price and level table | (a): parcel `k` needs level `k` and costs `10 x k` Cobbles (4,350 for 29 parcels, a cap of 38). |
| 3 | Demolition | Allowed, at a fixed price that doubles after each use and resets every day: 5 Cobbles (5, 10, 20, 40, 80...), the chain's day (the quests' clock), a per-account daily counter in storage, no refund of the tile, no daily cap (section 3a). |
| 4 | A tile with no legal cell | As proposed: the normal rule (at least one placed side neighbour) is kept; a reward whose tiles fit nowhere offers only the Cobbles or the merge (#642). |

## 8. Size, gas and tests (as built)

Class sizes (`scripts/class-sizes.sh`, release build on the VPS, 3.4 GB peak RSS; CASM is the binding cap of 81,920):

| Class | Sierra | CASM | Of the cap | Note |
|---|---:|---:|---:|---|
| `Village` (new) | 24,932 | 57,155 | 69.8 % | one copy of the engine, as `Story` (58,650, 71.6 %) |
| `Setup` | 19,604 | 43,431 | 53.0 % | unchanged by #640 (its source is main's; #641 took it there) |

L2 gas of each new call (test profile), measured in CI: the contracts' test build does not fit the VPS's 8 GB cap, so
the `Test game` job of PR #669 ran `paved::tests::village` (run 39600293782). The ceilings of
`contracts/src/tests/village.cairo` are these + 5 %.

| Call | Scenario | L2 gas |
|---|---|---:|
| `found` | a new village | 1,375,619 |
| `buy_parcel` | parcel 2 (level and spend on `Setup`) | 1,790,305 |
| `place` | a tile that closes nothing | 4,138,220 |
| `place` | a tile that closes a road of 4 | 6,742,891 |
| `demolish` | 3 tiles replayed | 10,475,680 |
| `demolish` | 36 tiles replayed (a village of 38 tiles) | 117,124,175 |

A demolition costs about 3.25 M per tile replayed. At the technical limit of 100 cells (98 tiles replayed) that is about
320 M, 29 % of the 1.11 x 10^9 a transaction may use: the reason for `MAX_CELLS_LIMIT`. These figures are from the
CI run before `max_cells` replaced the constant (one more storage read in `buy_parcel`), within the 5 % margin.

Tests: `paved::tests::village` (founding, parcels and their refusals, the level gate read from `Setup`, the owner's cap,
a fuzz of the territory invariant (connected, within the cap, the price paid equals the sum of the curve), placement
and its refusals, no border rule, demolition (its sequence 5, 10, 20, 40, the day boundary, a refused one keeping its
price, the rebuild), admin, storage pins, the parity replay, gas). Cobbles move only through `Setup.spend_cobbles`, for
the caller of `buy_parcel` and `demolish`, at the price of the curve: the access lens is the spender allowlist (an
allowed `Village` debits only its own caller) and the value lens the curve and the reverting balance check, both
tested.
