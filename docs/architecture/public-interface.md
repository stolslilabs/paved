# Public read-only interface

The views that `Daily` and `Tutorial` expose so that a client can show a game, its board, the
characters of its player and the Daily tournaments without an indexer. Events give the lists ("my
games", history); views give the current state of one game or one tournament.

This is a published interface. Its types (`contracts/src/views.cairo`) are plain structs built for
the client, not the storage structs: the storage will change in phase P5 (persistent structure
state, packing) and these views will not.

## Stability promise

- A view keeps its name, its arguments and the meaning of every field.
- A struct only grows at its end: a new field is appended after the last one. A field is never
  removed, reordered, renamed or given another meaning, and its type never changes.
- A new code of an enumerated field (`mode`, `status`, `plan`, `role`, `spot`, `orientation`) may be
  added; existing codes keep their meaning. A client treats a code it does not know as "unknown".
- The paging cap (`MAX_PAGE`) may only grow.
- A view never writes state and costs nothing to the write path: no storage is added or read by
  the write entry points for the views.

A client that decodes by ABI (starknet.js, starknet.py) keeps working when fields are appended, as
long as it reads the ABI of the deployed class.

## Conventions

| Thing | Type | Meaning |
|---|---|---|
| `game_id` | `u32` | Id of a game, counted per contract from 1 (`Daily` game 1 and `Tutorial` game 1 are two games) |
| `player_id` | `felt252` | Address of the player's account, as a felt |
| tile id | `u32` | Order of draw within the game, from 1. Tile 1 is the starter tile, placed at spawn. Each drawn tile is placed or discarded before the next is drawn, so the order of the placed tiles by id is their order of placement |
| `x`, `y` | `u32` | Board position; the starter tile is at (`CENTER`, `CENTER`), `CENTER = 0x7fffffff`; `y + 1` is north, `x + 1` is east. `0, 0` means "not on the board" |
| `mode` | `u8` | `1` Daily, `3` Tutorial (`2` was Weekly and is never given again) |
| `plan` | `u8` | `Plan` code (`types/plan.cairo`); `0` means none |
| `orientation` | `u8` | `0` none (not placed), `1` north, `2` east, `3` south, `4` west |
| `role` | `u8` | `1` Lord, `2` Lady, `3` Adventurer, `4` Paladin, `5` Pilgrim, `6` Woodsman, `7` Herdsman (the last two since P4) |
| `spot` | `u8` | `0` none, `1` center, `2` north-west, `3` north, `4` north-east, `5` east, `6` south-east, `7` south, `8` south-west, `9` west |
| score, points | `u32` | Game points, no decimals |
| time | `u64` | Block timestamp, seconds |
| prize | `u256` | Amount of the entry token, in its base unit (18 decimals for the test token) |

## Missing data

- **A game that does not exist** (id 0, or above the last id given): `game`, `tiles`, `builder` and
  `characters` revert with `Game: does not exist`. A zeroed view would be indistinguishable from a
  real game in some fields (score 0, not over), so the views refuse it.
- **A player who is not the player of the game**: `builder` and `characters` revert with
  `View: not the game player`. Games are single-player; the player is the one who spawned it.
- **A tournament**: `tournament` never reverts. A day with no entry returns its id, its start and
  end times, and zero everywhere else. An id above `MAX_TOURNAMENT_ID = 213503982334600`
  (`(2^64 - 1) / 86400 - 1`, the last day whose end time fits in a `u64`) can never hold a
  tournament: it returns its id and zero everywhere else, `start_time` and `end_time` included.

## Views of `Daily` and `Tutorial` (`IGameView`)

### `game(game_id: u32) -> GameView`

| # | Field | Type | Meaning |
|---|---|---|---|
| 1 | `id` | `u32` | `game_id` |
| 2 | `player_id` | `felt252` | The player of the game |
| 3 | `mode` | `u8` | Mode code (see conventions) |
| 4 | `seed` | `felt252` | Current seed of the game. It changes after every draw; tutorial games always draw the same deck |
| 5 | `score` | `u32` | Current score (the final score once `over`) |
| 6 | `over` | `bool` | The game has ended (last tile played, or surrender) |
| 7 | `tile_count` | `u32` | Tiles drawn so far, the starter tile included. It is the total that `tiles` pages over: ids `1..=tile_count` |
| 8 | `placed_count` | `u32` | Tiles on the board, the starter tile included |
| 9 | `discarded_count` | `u32` | Tiles discarded |
| 10 | `tile_id` | `u32` | Id of the tile to place now; `0` when there is none (the game is over) |
| 11 | `plan` | `u8` | Plan of the tile to place now; `0` when there is none |
| 12 | `remaining_count` | `u32` | Tiles still to draw after the tile to place now; `0` when the game is over |
| 13 | `deck_size` | `u32` | Tiles in a full game of this mode, the starter tile included (Daily 38, Tutorial 10) |
| 14 | `start_time` | `u64` | Time of the spawn |
| 15 | `end_time` | `u64` | Time of the end of the game when it counted for its tournament; `0` otherwise (game not over, ended after its tournament closed). Always `0` for a Tutorial game, even when it is over: no tournament, so no end time |
| 16 | `tournament_id` | `u64` | The tournament the game counted for, set when the game ends in time; `0` otherwise. `0` while a Daily game runs, set at game over, and still `0` for a Daily game over after its day closed. Always `0` for a Tutorial game: it belongs to no tournament |

`tile_count = placed_count + discarded_count + (1 if a tile is held, else 0)`. A game abandoned by
`surrender` keeps the tile that was in hand: it is in `tile_count` but neither placed nor
discarded, and `tile_id` is `0`.

### `tiles(game_id: u32, from: u32, count: u32) -> Array<TileView>`

Pages over the tiles of the game in id order. `from` is a zero-based offset: the page holds the
tiles with ids `from + 1` to `from + n`, where `n = min(count, MAX_PAGE, tile_count - from)`.

- `from >= tile_count`, or `count = 0`: an empty array (no revert).
- `count` above `MAX_PAGE = 64` is read as 64. A Daily game has at most 38 tiles, so one call
  `tiles(game_id, 0, 64)` returns a whole game.
- A client pages with `from += page.len()` until a page comes back shorter than the count it asked.

`TileView`:

| # | Field | Type | Meaning |
|---|---|---|---|
| 1 | `id` | `u32` | Tile id (order of draw) |
| 2 | `status` | `u8` | `1` placed, `2` discarded, `3` held: drawn, neither placed nor discarded (the tile to place now, or the tile in hand at a surrender) |
| 3 | `plan` | `u8` | Plan of the tile |
| 4 | `orientation` | `u8` | Orientation; `0` unless placed |
| 5 | `x` | `u32` | Position; `0` unless placed |
| 6 | `y` | `u32` | Position; `0` unless placed |

### `builder(game_id: u32, player_id: felt252) -> BuilderView`

| # | Field | Type | Meaning |
|---|---|---|---|
| 1 | `game_id` | `u32` | `game_id` |
| 2 | `player_id` | `felt252` | `player_id` |
| 3 | `tile_id` | `u32` | Tile in hand: the tile to place now; `0` when there is none. After a surrender it is the tile that was in hand (`status` 3 in `tiles`), unlike `GameView.tile_id` |
| 4 | `plan` | `u8` | Plan of the tile in hand; `0` when there is none |
| 5 | `placed_count` | `u8` | Characters on the board |
| 6 | `available_count` | `u8` | Characters still to place (`7 - placed_count`; `5 - placed_count` before P4) |

A character placed on a structure comes back to the player when the structure is solved, so
`available_count` can grow again.

### `characters(game_id: u32, player_id: felt252) -> Array<CharacterView>`

Always seven entries, one per role, in role order (Lord, Lady, Adventurer, Paladin, Pilgrim, Woodsman,
Herdsman). Before P4 there were five: the first five entries are unchanged, the two roles of P4 are
appended.

| # | Field | Type | Meaning |
|---|---|---|---|
| 1 | `role` | `u8` | Role code |
| 2 | `placed` | `bool` | The character is on the board |
| 3 | `tile_id` | `u32` | Tile it stands on; `0` unless placed |
| 4 | `x` | `u32` | Position of that tile; `0` unless placed |
| 5 | `y` | `u32` | Position of that tile; `0` unless placed |
| 6 | `spot` | `u8` | Spot on that tile; `0` unless placed |

## Views of `Daily` only (`ITournamentView`)

### `current_tournament_id() -> u64`

The tournament of the current block time: `block_timestamp / 86400`. One tournament per UTC day.

### `tournament(id: u64) -> TournamentView`

| # | Field | Type | Meaning |
|---|---|---|---|
| 1 | `id` | `u64` | `id` |
| 2 | `start_time` | `u64` | `id * 86400`; games spawned from then on enter this tournament; `0` above `MAX_TOURNAMENT_ID` |
| 3 | `end_time` | `u64` | `(id + 1) * 86400`; first second when the tournament is over and prizes can be claimed; `0` above `MAX_TOURNAMENT_ID` |
| 4 | `over` | `bool` | `block_timestamp >= end_time` |
| 5 | `prize` | `u256` | Prize pool: entry prices and sponsored amounts. Claims do not reduce it |
| 6 | `top1_player_id` | `felt252` | First place; `0` when empty |
| 7 | `top1_score` | `u32` | Its score |
| 8 | `top1_claimed` | `bool` | Its reward was claimed |
| 9 | `top2_player_id` | `felt252` | Second place; `0` when empty |
| 10 | `top2_score` | `u32` | Its score |
| 11 | `top2_claimed` | `bool` | Its reward was claimed |
| 12 | `top3_player_id` | `felt252` | Third place; `0` when empty |
| 13 | `top3_score` | `u32` | Its score |
| 14 | `top3_claimed` | `bool` | Its reward was claimed |

A game counts for the tournament of its spawn only if it ends before that tournament is over.

### `entry_price() -> PriceView`

What `spawn` pulls from the player: the ERC20 and the amount. It is read from the same source as
`spawn` (the token the contract was deployed with, and the price of the mode), so the two cannot
diverge.

| # | Field | Type | Meaning |
|---|---|---|---|
| 1 | `token` | `ContractAddress` | The ERC20 that `spawn` pulls the entry price from (the player approves the `Daily` contract on it) |
| 2 | `amount` | `u256` | The price of one stake unit, in the base unit of the token: 2,000,000 (2 USDC, 6 decimals). `spawn(stake, ..)` pulls `stake x amount` |

## Events for lists

The views read one game; lists come from events. The player id is a key of the two events a list
needs, so a node can filter them (`starknet_getEvents` with `keys`):

| Event | Keys, in order | Data |
|---|---|---|
| `GameSpawned` | selector, `game_id`, `player_id` | `mode`, `tournament_id` (`0` for Tutorial), `start_time`, `price` |
| `GameOver` | selector, `game_id`, `player_id`, `tournament_id` | `mode`, `score` (final), `start_time`, `end_time` |

"My games": `GameSpawned` with keys `[[selector], [], [player_id]]`. "My finished games and their
scores": `GameOver` with the same filter. "Games of a tournament": `GameOver` with keys
`[[selector], [], [], [tournament_id]]` (`tournament_id` is `0` for a game that did not count, and
for every Tutorial game). A Tutorial game belongs to no tournament: its `GameSpawned` and its
`GameOver` carry `tournament_id = 0`.
The other events are listed in `native-storage.md`.

## How the views are read today

For the record, not part of the interface: the views are computed from the storage of
`native-storage.md`. The player of a game is `GameConfig.player_id`, recorded at spawn (so a game
with no build has one too). `placed_count = built + 1`, `discarded_count = discarded`, the tile to
place now is tile `tile_count` while the game is not over, and a tile is `held` when it is the
builder's `tile_id`, which is `GameState.held_tile` (kept by a surrender, 0 after the last tile).
`end_time` and `tournament_id` come from `GameEnd`. Phase P5 may compute them otherwise; the fields
keep their meaning.

## Changes since publication

Append only: each entry says what changed and why a client that follows the promise above keeps
working.

- **P4, Woodsman and Herdsman** (the forest roles of 2024 come back).
  - `role` has two new codes: `6` Woodsman, `7` Herdsman. A client that does not know them treats
    them as unknown roles.
  - `characters` returns seven entries instead of five: the two new roles are appended after
    Pilgrim, the first five entries are what they were.
  - `builder`: `available_count` counts against seven characters (`7 - placed_count`), and
    `placed_count` can reach 7. No field was added, moved or retyped.
  - `Daily.build(role, spot)` accepts the two new roles: `Role::Woodsman` on a forest or on a road,
    `Role::Herdsman` on a forest or on a city (the codes of the other roles and their permissions
    are unchanged). The ABI of `Daily` gains the two variants of `Role`; `Tutorial` does not take a
    role.
  - A forest scores like any structure through the `Scored` event, with `category` `FOREST`,
    `size` the number of tiles of the forest and `points` the points of one character (a Woodsman
    and a Herdsman of the same forest give two events). The event is also emitted when the points
    are 0 (a forest that closes next to no closed city for the Herdsman): the character comes back
    all the same. Forests are scored only when closed, see `native-storage.md`.

- **S1, Lobby library class** (P-26).
  - The constructors of `Daily` and `Tutorial` take a new last argument, `lobby_class: ClassHash`:
    `Daily(owner, account, token, lobby_class)` and `Tutorial(owner, account, lobby_class)`. The class is
    set at construction and cannot change.
  - Every function, view and event of both contracts is unchanged. A client does not call the Lobby and
    needs no ABI for it; `contracts/deployments/<network>.json` gains `classes.Lobby`, the class hash.

- **P8 E3, the economy wired** (`docs/architecture/economy.md`, "As built: E3").
  - `Daily.spawn()` becomes `Daily.spawn(stake: u8, referrer: ContractAddress, min_out: u256) -> u32`. The player
    approves `Daily` on USDC for `stake x entry_price().amount` (stake 1 to 10). `referrer` is a registered player
    other than the caller, or zero (any other is ignored). `min_out` is the least PAVED the burn's swap must buy:
    the pool's quote (`Economy.quote_swap(Economy.quote(stake).burn_quote)` on devnet) less the slippage. A
    client that calls `spawn()` without arguments must change: this is the one breaking change, agreed in P-31.
  - `entry_price()` keeps its shape. `token` is USDC (`MockUSDC` on devnet, 6 decimals) and `amount` is the price of
    one stake unit (2,000,000), which is also `GameSpawned.price`.
  - The tournament's `prize` no longer grows with entries: it is sponsor-only, and `sponsor` works on a day with no
    game.
  - `Account` gains `set_economy(economy)` (owner, once) and the view `economy() -> ContractAddress`, and the
    event `EconomySet { economy }`, emitted once at deploy.
  - `Economy` (its own address in `contracts/deployments/<network>.json`) emits `Purchased` (keys `game_id`,
    `player_id`), `Recorded` (key `game_id`), `DayClosed` (key `day`) and `Settled` (keys `game_id`,
    `player_id`); its views are `quote`, `quote_swap`, `day`, `terms`, `config`, `ema`, `rate`, `pool`,
    `addresses`, `owner`, and `settle(game_ids)` is open to anyone from `(D + 2) x 86400`.
    `contracts/abis/Economy.json` is its ABI. Every view and event of `Daily` and `Tutorial` keeps its fields.
  - P-37: after a day, what no rank can claim returns to its sponsors. `Daily.claim(tournament_id, 0)` (rank 0) is a
    sponsor's reclaim of its part, pro rata to what it put in, once, after the day is over. The ranks' shares are
    fixed: 1/6 to rank 3, a third of the rest to rank 2, the remainder to rank 1, and an empty rank's share is
    reclaimable (rank 1 no longer takes it). New event, emitted from `Daily`'s address and declared in
    `contracts/abis/Lobby.json`: `Reclaimed` (keys `tournament_id`, `sponsor`; data `amount: u256`). The ABI of
    `Daily` is unchanged.
