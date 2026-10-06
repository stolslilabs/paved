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
`player`, `builder`, `tile`, `tile_position`, `neighbors`, `neighborhood`, `character`,
`character_position`, `tournament` and their `set_*`), so the components and helpers change little.
It holds no state: every call works on the storage of the contract that runs it.

Each Dojo model keeps its keys; the `Map` is keyed by them and the values are packed into whole
felts where the fields fit. Keys are not stored: the `Store` puts them back on read, as the Dojo
world did, so a missing entry reads as the model with its keys set and every value zero.

| Model | Map key | Slots | Packing (low bits first) |
|---|---|---|---|
| `Game` | `id: u32` | 3 | `seed`; `tiles u128, tile_count u32, score u32, discarded u8, built u8, mode u8, over bool`; `start_time u64, end_time u64, tournament_id u64, tile_limit u16` |
| `Player` | `id: felt252` | 2 | `name`; `master` |
| `Builder` | `(game_id, player_id)` | 1 | `tile_id u32, characters u8` |
| `Tile` | `(game_id, id)` | 2 | `player_id`; `plan u8, orientation u8, x u32, y u32, occupied_spot u8` |
| `TilePosition` | `(game_id, x, y)` | 1 | `tile_id u32` |
| `Char` | `(game_id, player_id, index)` | 1 | `tile_id u32, spot u8, weight u8, power u8` |
| `CharPosition` | `(game_id, tile_id, spot)` | 2 | `player_id`; `index u8` |
| `Tournament` | `id: u64` | 5 | `prize`; `top1_player_id`; `top2_player_id`; `top3_player_id`; `top1_score u32, top2_score u32, top3_score u32, top1_claimed, top2_claimed, top3_claimed` |
| game counter | none | 1 | `u32`, last game id given |
| account | none | 1 | address of `Account` (zero in `Account` itself) |

`Store::player` reads the local `players` map when the `account` slot is zero (in `Account`), and
calls `IAccount::player` otherwise. Packing is the only change of representation; no structure state
is added (that is P5).

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
| `Scored` | Daily, Tutorial | `key game_id`, `player_id`, `category`, `size` (tiles; 0 for a wonder), `points` | a structure is solved and scores |
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
  call overwrites the pending owner); the pending owner completes it with `accept_ownership()`,
  which clears the pending owner. A mistyped address therefore never takes the ownership.
- **Player**: an address registered in `Account`. A player acts only on their own game: every game
  entry point loads the `Builder` keyed by `(game_id, caller)`, and a missing builder reverts
  (`Builder: Does not exist`). Games are single-player; the builder is created by `spawn` for the
  caller only.
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
