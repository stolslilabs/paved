# Native storage (phase P2)

The contracts of `contracts/` are plain Starknet contracts since P2: no Dojo world, no Dojo model,
no Dojo permission. This document is the reference for the contract split, the storage layout, the
events and the access rules. Brief: `docs/briefs/p2-native.md`.

## Contract split

Three game contracts and one test token, as under Dojo, with the same interfaces (`IAccount`,
`IDaily`, `ITutorial`; same function names, arguments and returns). Two changes: the functions that
write state take `ref self` (they were `self: @` under Dojo, where the world did the writing, so the
ABI now marks them `external` instead of `view`), and `IAccount` gains the view `player(id)`. `Daily` and `Tutorial` also expose the read-only views of
`IGameView` (and `Daily` those of `ITournamentView`), documented in `public-interface.md`:

| Contract | Role | Constructor |
|---|---|---|
| `Account` (`systems/account.cairo`) | Player registry | `owner` |
| `Daily` (`systems/daily.cairo`) | Daily games, tournaments, entry fee and prizes | `owner`, `account`, `token` |
| `Tutorial` (`systems/tutorial.cairo`) | Tutorial games | `owner`, `account` |
| `Token` (`mocks/token.cairo`) | ERC20 mock with a faucet, tests only | none |

Why three contracts and not one: `Daily` and `Tutorial` share entry point names (`spawn`, `discard`,
`surrender`, `build`), and Starknet selectors are the bare function name, so one contract would have
to rename them. Keeping three keeps the client's calls unchanged.

Each contract owns its storage. Under Dojo the world shared one storage between the systems; the
only data shared across contracts today is the player registry, so:

- `Account` keeps the players.
- `Daily` and `Tutorial` read a player with one view call, `IAccount::player(id)`, to the `account`
  address given at deployment. They never write a player.
- Game ids are counted per contract (`Daily` game 1 and `Tutorial` game 1 are two games). Under Dojo
  `world.uuid()` was global; the first game of a contract still gets id 1, so seeds and the golden
  games are unchanged.

## Storage layout

`store.cairo` declares the game storage once, as a `#[starknet::storage_node]` (`PavedStorage`)
rooted at `selector!("paved")`, and the `Store` reads and writes it through native
`starknet::storage` paths (`Map`). `Store` keeps the interface it had over the Dojo world (`game`,
`player`, `builder`, `tile`, `tile_position`, `character`, `character_at`, `tournament` and their
`set_*`), so the components and helpers change little. Since P5-4 the neighbourhood of a move is
read by `structure::placement::NeighborhoodTrait::read` (the 8 tiles around and their refs), which
replaces `neighbors` and `neighborhood`.
It holds no state: every call works on the storage of the contract that runs it.

Each Dojo model keeps its keys; the `Map` is keyed by them and the values are packed into whole
felts where the fields fit. Keys are not stored: the `Store` puts them back on read, as the Dojo
world did, so a missing entry reads as the model with its keys set and every value zero.

| Model | Map key | Slots | Packing (low bits first) |
|---|---|---|---|
| `GameConfig` | `game_id: u32` | 2 | `player_id`; `mode u8, start_time u64, tile_limit u16`. Written once, at spawn |
| `GameState` | `game_id: u32` | 2 | `seed`; `tiles u128, tile_count u8, score u32, discarded u8, built u8, over bool, held_tile u8, characters u16`. Written by every action |
| `GameEnd` | `game_id: u32` | 1 | `end_time u64, tournament_id u64`. Written once, when the game ends in time; absent reads as 0 |
| `Player` | `id: felt252` | 2 | `name`; `master` |
| `Builder` | none: a facade over `GameState` | 0 | `held_tile` is its `tile_id`, `characters` its roles (`u16`, bit `i` set: the role of code `i` is on the board; roles 1 to 7 use bits 1 to 7, the 16 bits leave room for new roles). `Store::builder(game, p)` returns it for the game's player and the zero builder for anyone else |
| `Tile` | `(game_id, id)` | 1 | low 128 bits: `plan u8, orientation u8, x u32, y u32, occupied_spot u8` (no player: the player is in `GameConfig`); high bits: `refs`, 9 x 12 bits (area `a` at `12 (a - 1)`), the structure id each node of the placed tile was given at placement (0 for an area without moves). `Store::tile` reads the `Tile` struct, which has no refs field; `Store::tile_with_refs` reads both. `Store::set_tile` keeps the refs, and puts a placed tile that has none on the structure state (the starter tile at spawn, a board written by a test); a build writes its tile with `set_placed_tile(tile, refs)` |
| `TilePosition` | `(game_id, x, y)` | 1 | `tile_id u32` |
| `Characters` | `game_id: u32` | 1 | per role `1..=7`, 16 bits each (role `r` at bits `16 r`): `tile_id u8, spot u4, weight u2, power u2`; a role not on the board is 0. One slot per game, rewritten on place and recover. `Store::character(game, p, role)` unpacks one role into a `Char`; `Store::character_at(game, tile, spot)` finds the character on a tile spot (one slot read, the roles scanned) for the oracle's walks |
| `Structures` | `(game_id, tile_id, slot: u8)` | 1 or 2 per placed tile | the record page of a tile (P5-4, `structure/record.cairo`): 4 records of 48 bits per slot, two in each 128-bit half: `parent u12, size u10, open u10, chars u16`. Record `r` of a tile (its rank among the areas of the plan that have moves) is slot `r / 4`, position `r % 4`; a second slot only for the plans of more than 4 such areas (the three `sfrfrf*`). Written by the build that places the tile, rewritten by later unions and scorings |
| `Tournament` | `id: u64` | 5 | `prize`; `top1_player_id`; `top2_player_id`; `top3_player_id`; `top1_score u32, top2_score u32, top3_score u32, top1_claimed, top2_claimed, top3_claimed` |
| game counter | none | 1 | `u32`, last game id given |
| account | none | 1 | address of `Account` (zero in `Account` itself) |

`Store::player` reads the local `players` map when the `account` slot is zero (in `Account`), and
calls `IAccount::player` otherwise. `Store::game` composes the `Game` struct of the three game records
(`live_game` leaves `GameEnd` out, which a move does not need), and `set_game_config`,
`set_game_state` and `set_game_end` write them apart; a move rewrites `GameState` only. The structure state (P5-4) is the `Structures` pages and the refs
of the tiles: see `docs/architecture/structure-state.md`.

Other storage, outside `PavedStorage`: `owner` and `pending_owner` (`components/ownable.cairo`) in every contract, and
`token_address` (`components/payable.cairo`) in `Daily`.

The models are plain structs (`models/index.cairo`), with their impls unchanged.

## Events

Every event is a Starknet event of the contract that emits it (declared in the contract's `#[event]`
enum, so it is in the ABI). Keys are the variant selector, then the fields marked `key`. Events that
are raised deep in the game logic (scoring) are emitted by `Store::emit`, which writes the same keys
and data as the contract's `self.emit` would.

| Event | Contract | Fields (`key` first) | When |
|---|---|---|---|
| `PlayerCreated` | Account | `key player_id`, `name`, `master` | `create` |
| `GameSpawned` | Daily, Tutorial | `key game_id`, `key player_id`, `mode`, `tournament_id`, `start_time`, `price` | `spawn` |
| `Built` | Daily, Tutorial | `key game_id`, `player_id`, `tile_id`, `plan`, `orientation`, `x`, `y`, `role`, `spot` | a tile is built |
| `Discarded` | Daily, Tutorial | `key game_id`, `player_id`, `tile_id`, `plan`, `points` (penalty) | a tile is discarded |
| `Scored` | Daily, Tutorial | `key game_id`, `player_id`, `category`, `size` (tiles; 0 for a wonder), `points` | a structure is solved and scores; a forest emits one per character (Woodsman, Herdsman), with `category` FOREST and the size of the forest, even with 0 points |
| `GameOver` | Daily, Tutorial | `key game_id`, `key player_id`, `key tournament_id`, `mode`, `score`, `start_time`, `end_time` | the game ends (last tile, or surrender); `tournament_id` and `end_time` are 0 when the game ended after its tournament closed (it does not count), and always in Tutorial |
| `Sponsored` | Daily | `key tournament_id`, `sponsor`, `amount` | `sponsor` |
| `Claimed` | Daily | `key tournament_id`, `player_id`, `rank`, `reward` | `claim` |
| `OwnershipTransferStarted` | all three | `previous_owner`, `new_owner` | `transfer_ownership` (the new owner is only pending) |
| `OwnershipTransferred` | all three | `previous_owner`, `new_owner` | constructor, `accept_ownership` |
| `Upgraded` | all three | `class_hash` | `upgrade` |

`player_id` is a key of `GameSpawned` and `GameOver` so that a client lists a player's games from
events (`docs/architecture/public-interface.md`).

`category` is the `Category` value (`types/category.cairo`), `mode` the `Mode` value, `plan`,
`orientation`, `role`, `spot` their `u8` values. The ERC20 mock keeps its OpenZeppelin events.

## Access control

Own, minimal, no Dojo permission:

- **Owner**, set at deployment (constructor argument, must be non-zero). The owner may `upgrade` the
  contract class and hand the ownership over. `upgrade` replaces the class: the owner has full
  control of the contract and of its funds (in `Daily`, the prize pools held in the token), so the
  owner key holds the funds. Treat it as such (hardware or multisig account).
- **Two-step handover**: `transfer_ownership(new_owner)` only records `new_owner` as pending (a new
  call overwrites the pending owner, so a pending proposal is withdrawn by proposing the owner's own
  address); the pending owner completes it with `accept_ownership()`,
  which clears the pending owner. A mistyped address therefore never takes the ownership.
- **Player**: an address registered in `Account`. `spawn` checks the registration
  (`Player: Does not exist`) and records the caller in `GameConfig.player_id`. A player acts only on
  their own game: `build`, `discard` and `surrender` take the builder of the caller from the game,
  which exists for `GameConfig.player_id` only, and revert for anyone else
  (`Builder: Does not exist`). They no longer call `Account`: an address cannot be unregistered, so
  the callers accepted are the same. Games are single-player.
- **Prize claim**: a tournament rank pays only the address recorded at that rank, once, after the
  tournament is over (`Tournament::claim`, unchanged).
- No entry point lets a caller write another player's record or another player's game.

Entry points (every `external` function):

| Contract | Entry point | Who may call | Check |
|---|---|---|---|
| Account | `create(name, master)` | anyone, once per address | `Player: Already exist` |
| Account | `player(id)` (view) | anyone | none |
| Daily | `spawn()` | a registered player | `Player: Does not exist`; pays the entry price (`transferFrom` caller) |
| Daily | `build(game_id, orientation, x, y, role, spot)` | the player of `game_id` | builder `(game_id, caller)` exists, game started and not over |
| Daily | `discard(game_id)` | the player of `game_id` | same |
| Daily | `surrender(game_id)` | the player of `game_id` | same |
| Daily | `claim(tournament_id, rank)` | the player at `rank` of a closed tournament | registered player, tournament exists, rank holder, not claimed, tournament over |
| Daily | `sponsor(amount)` | anyone with the token approved | current tournament exists; pays `amount` (`transferFrom` caller) |
| Daily | `game`, `tiles`, `builder`, `characters`, `tournament`, `current_tournament_id` (views) | anyone | none; see `public-interface.md` |
| Tutorial | `spawn()` | a registered player | `Player: Does not exist` |
| Tutorial | `build(game_id)`, `discard(game_id)`, `surrender(game_id)` | the player of `game_id` | builder `(game_id, caller)` exists, game started and not over |
| Tutorial | `game`, `tiles`, `builder`, `characters` (views) | anyone | none; see `public-interface.md` |
| all three | `owner()`, `pending_owner()` (views) | anyone | none |
| all three | `transfer_ownership(new_owner)` | owner | `Ownable: caller is not owner`, `new_owner` non-zero |
| all three | `accept_ownership()` | the pending owner | `Ownable: caller not pending` |
| all three | `upgrade(class_hash)` | owner | `Ownable: caller is not owner`, `class_hash` non-zero |
| Token (mock) | ERC20 entry points, `mint()` | anyone | test and devnet only, never deploy on a public network (see below) |

**Mock token.** `mocks/token.cairo` has an open `mint()`: anyone mints 1E6 tokens. It stays compiled
(the devnet deploy and the client's `Token.json` ABI need it) and is not gated by `cfg(test)`; its
header says "test and devnet only, never deploy on a public network". A public network uses a real
token whose address is the `token_address` constructor argument of `Daily`.

**Constructors.** `Daily` and `Tutorial` revert on a zero `account_address`, and `Daily` on a zero
`token_address` (`Daily: account is zero`, `Daily: token is zero`, `Tutorial: account is zero`).

Token interactions follow checks-effects-interactions: state is written before `transferFrom` /
`transfer`, and a failed transfer reverts the whole call. The token and the `Account` address are
fixed at deployment and trusted; only an `upgrade` by the owner can change them.

## Tests

`snforge` only. `contracts/src/tests/setup.cairo` (and its copy `contracts/tests/setup.cairo`,
checked by `scripts/measure.sh check-setup`) deploys `Token`, `Account`, `Tutorial`, `Daily` with `deploy`, and
gives the tests a `TestStore`: the same reads and writes as `Store`, run against a deployed contract
with `snforge_std::interact_with_state`. The golden harness only changes the line that builds its
store.

## Vendored code

`origami_random` came from the Dojo organisation's git repository; the one module used (`deck`) is
copied into `helpers/random_deck.cairo` with its source and MIT licence named in the file.

## Forest scoring (P4, from the structure state since P5-5)

The roles of 2024, restored from `b0f837e^`. The forest starts of the layouts
(`elements/layouts/*`, `starts()`), which `b0f837e` had commented out, are active again: each tile
built assesses every forest it touches, as it does for roads and cities. Since P5-5 the assessment
reads the forest's root (`structure/forest.cairo`); the recursive `ForestCount` and `SimpleCount`
walks live on only in the test oracle (`tests/oracle.cairo`).

- A forest is **closed** when every tile around it exists (as for any structure, `open == 0` on its
  root) **and every road adjacent to it is closed**: one open adjacent road keeps the forest open.
  Adjacent cities do not keep it open.
- **Woodsman**: `distinct closed roads adjacent to the forest x 300 x bonus(size) / woodsmen`.
  **Herdsman**: the same with the distinct **closed** cities adjacent (rule **P-15**: an open city
  never counts, and a city is never counted twice). `bonus(n) = 1.0235^n`
  (`helpers/multiplier.cairo`), `size` is the number of tile areas of the forest. A road or a city
  touched at several places counts once. The size of the forest therefore enters the points only
  through the bonus, not as a factor.
- **P-15 is the one rule change of P5.** The 2024 walk stopped at the open edge of a city and
  marked the part it had seen as visited; a second contact of the forest with the same city then
  walked only the rest of it, which could look closed, and the open city counted. Golden
  `test_golden_daily_forest_herdsman_open_city`: 2024 figure 314, P5 figure 0.
- A Woodsman is also allowed on a road, where it scores as a Lord (weight and power 1); a Herdsman
  is also allowed on a city, where it scores as a Lord too (weight and power 1). Neither is allowed
  on the other structures (the Woodsman on a city, the Herdsman on a road, both on a wonder).
- A forest is assessed from the forest starts of the tile that is built, as roads and cities are
  from theirs: the build that completes the forest scores it, and a build that does not touch it
  does not assess it (behaviour of 2024, kept). A road that closes away from a forest never
  re-assesses it (P-16, PR P5-8, is not ruled into the code yet).
- Cost: a build that does not close a forest holding a Woodsman or a Herdsman pays one root read
  (`open`, `chars`) per forest start of the tile. The build that does pays a scan bounded by the
  forest's tiles (one tile read per node, plus the finds of its adjacent roads and cities).
