# Public read-only interface

The views that `Daily` and `Tutorial` expose so that a client can show a game, its board, the
characters of its player and the Daily tournaments without an indexer. Events give the lists ("my
games", history); views give the current state of one game or one tournament.

This is a published interface. Its types (`contracts/src/views.cairo`) are plain structs built for
the client, not the storage structs: the storage will change in phase P5 (persistent structure
state, packing) and these views will not.

**D-18 broke this interface once** (characters leave the game, built in D-18b): see "Breaking change D-18" at
the end. Where the sections before it mention characters (`role`, `spot`, `characters`, the counters of
`builder`), they describe the interface before D-18.

## Stability promise

- A view keeps its name, its arguments and the meaning of every field.
- A struct only grows at its end: a new field is appended after the last one. A field is never
  removed, reordered, renamed or given another meaning, and its type never changes.
- A new code of an enumerated field (`mode`, `status`, `plan`, `role`, `spot`, `orientation`) may be
  added; existing codes keep their meaning. A client treats a code it does not know as "unknown".
- The paging cap (`MAX_PAGE`) may only grow.
- A view never writes state and costs nothing to the write path: no storage is added or read by
  the write entry points for the views.
- **Exception, D-18:** the promise above is broken once, by "Breaking change D-18" below. It is
  accepted for Sepolia because mainnet is not launched. The promise holds again from the D-18
  release on.
- **Exception, D-20 (planned):** broken once more by "Breaking change D-20" below, for the same reason.

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
| `role` | `u8` | `1` Lord, `2` Lady, `3` Adventurer, `4` Paladin, `5` Pilgrim, `6` Woodsman, `7` Herdsman (the last two since P4) Removed by D-18 |
| `spot` | `u8` | `0` none, `1` center, `2` north-west, `3` north, `4` north-east, `5` east, `6` south-east, `7` south, `8` south-west, `9` west Removed by D-18 |
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
  - P-37, P-37b: after a day nobody ranked in (nobody played, or every score 0), its sponsors take back what each put
    in. `Daily.claim(tournament_id, 0)` (rank 0) is a sponsor's reclaim, once, after the day is over; on a day with
    a ranked game it reverts, since rank 1 takes the shares of the empty ranks as before (the ranks' rewards are
    unchanged). New event, emitted from `Daily`'s address and declared in `contracts/abis/Lobby.json`: `Reclaimed`
    (keys `tournament_id`, `sponsor`; data `amount: u256`). The ABI of `Daily` is unchanged. The prize of a reclaimed
    day stays its historical total (`tournament(day).prize` does not go down); the `Reclaimed` events give what went
    back to each sponsor.
- **P8 E5b, the game NFT minted at spawn** (`docs/architecture/economy.md`, "As built: E5b").
  - `Account` gains `set_collection(collection)` (owner, once, non-zero), the view `collection() -> ContractAddress`
    and the event `CollectionSet { collection }`, as `set_economy`. `contracts/abis/Account.json` is regenerated.
  - `Daily.spawn(...)` and `Tutorial.spawn()` keep their signatures. Each now mints the game's token in `Collection`
    to the caller, in the same transaction: id `game_id` for Daily and `2^32 + game_id` for Tutorial, a plain mint
    with no receiver callback (the `Transfer` event with `from = 0`). While the `Account` has no collection the spawn
    reverts with `'Lobby: collection not set'` and leaves no game.
  - No entry point of `Daily`, `Tutorial` or `Lobby` takes a token id, and none calls `Collection.mint` on a caller's
    behalf.
  - `contracts/deployments/<network>.json` gains `contracts.Collection`.

- **U-1, upgradable contracts** (D-17, P-42, `docs/architecture/upgrades.md`).
  - `Daily`, `Tutorial`, `Account`, `Economy` and `Collection` expose OpenZeppelin's `IUpgradeable`:
    `upgrade(new_class_hash)`, owner only, emitting `Upgraded { class_hash }`. `Daily`, `Tutorial` and `Account`
    had an `upgrade(class_hash)` already, with the same selector and event; only the argument's name changes.
  - `Economy` and `Collection` gain the two-step ownership of the other three: `owner()` (unchanged selector and
    result), `pending_owner()`, `transfer_ownership(new_owner)`, `accept_ownership()`, and the events
    `OwnershipTransferStarted` and `OwnershipTransferred` (the latter emitted once by each constructor). Their
    owner-only setters revert with `Ownable: caller is not owner` instead of `Economy: not owner` and
    `Collection: not owner`.
  - `Daily` and `Tutorial` gain `set_lobby_class(class_hash)` (owner only) and the event
    `LobbyClassSet { class_hash }`. The constructors are unchanged.
  - A client that reads the views and sends the player calls keeps working. An indexer that refuses unknown
    selectors must know `LobbyClassSet` before the owner first calls `set_lobby_class`.

## Breaking change D-18

D-18 (`docs/programme/DECISIONS.md`) removes characters from the game; P-45 gives the details. **Built in
D-18b**: the lists below are the ABIs of the branch (`contracts/abis/Daily.json`, `Tutorial.json`, regenerated by
`scripts/abis.sh`). A client that follows the stability promise does not keep working: it must follow this list.
One more ABI changes than the plan said: `Account.json` declares the shared `paved::events::Event`, so its `Built`
loses `role` and `spot` too (`Account` never emits it). The other contracts' ABIs (`Lobby`, `Economy`,
`Collection`, the tokens and mocks) do not mention roles, spots or characters and are unchanged.

### `Daily` and `Tutorial`: functions

| Item | Before | After |
|---|---|---|
| `Daily.build` | `build(game_id: u32, orientation: Orientation, x: u32, y: u32, role: Role, spot: Spot)` (`systems/daily.cairo:223`) | `build(game_id: u32, orientation: Orientation, x: u32, y: u32)` |
| `Tutorial.build` | `build(game_id: u32)` (`systems/tutorial.cairo:142`) | unchanged; the scripted role and spot of each Tutorial move go (`Mode::parameters`, `types/mode.cairo:80`) |
| `characters(game_id, player_id) -> Array<CharacterView>` (both) | seven entries, one per role | **removed** |
| `builder(game_id, player_id) -> BuilderView` (both) | `BuilderView { game_id, player_id, tile_id, plan, placed_count: u8, available_count: u8 }` | `BuilderView { game_id, player_id, tile_id, plan }`; the two counters go, so the decoded layout changes |

Types that leave the ABI of `Daily`: the enums `Role` (`None`, `Lord`, `Lady`, `Adventurer`, `Paladin`,
`Pilgrim`, `Woodsman`, `Herdsman`) and `Spot` (`None`, `Center`, `NorthWest`, `North`, `NorthEast`,
`East`, `SouthEast`, `South`, `SouthWest`, `West`), and the struct `CharacterView { role, placed, tile_id,
x, y, spot }`. `GameView` and `TileView` do not mention characters and are unchanged. The character checks of `build` go with the arguments: `Builder: already placed`, the structure-idle check
(`Game: structure not idle`) and the role and category compatibility check. The other errors of `build` are
unchanged.

### Events

| Event | Before | After |
|---|---|---|
| `Built` | keys `game_id`; data `player_id, tile_id, plan, orientation, x, y, role, spot` (`events.cairo:126-137`) | data `player_id, tile_id, plan, orientation, x, y`: **`role` and `spot` go** (they are the only character placement; there is no other event) |
| `Scored` | keys `game_id`; data `player_id, category, size, points` | **layout unchanged**; no field names a role, a spot or a character. The meaning changes: one `Scored` per closed structure, whether or not a character stood on it; a forest gives one event (no longer one per Woodsman and Herdsman), with `category` FOREST, and its points are the roads plus the cities |
| `Discarded`, `GameSpawned`, `GameOver`, `PlayerCreated`, `Sponsored`, `Claimed` | | unchanged |

`Built` is emitted by `Daily` and `Tutorial` from the same struct, so both lose the two fields. The event
selector is the name's hash and does not change. Tile positions are not affected; `Tile.occupied_spot`
stays in storage as a dead field (`structure-state.md`, "D-18").

### 1. Tutorial

Yes, `Tutorial` changes, through the code it shares with `Daily`; its own functions keep their signatures.

- **Entry points.** `spawn()`, `discard(game_id)`, `surrender(game_id)` and `build(game_id)` keep their
  signatures (`systems/tutorial.cairo:142`; the ABI already has no `role` or `spot`). The scripted
  deck gives each move its orientation, position, role and spot (`Mode::parameters`, `types/mode.cairo:80`,
  read at `components/tutoriable.cairo:171`), and `build` places that character
  (`tutoriable.cairo:205-219`). After D-18 the role and spot of the script go, so a Tutorial move only
  builds the tile. Tutorial scores change like Daily's (structures score on closing).
- **Views.** `Tutorial` embeds the same `IGameView` as `Daily` (`systems/tutorial.cairo:155-190`, the
  `ViewsImpl` of `views.cairo`): `characters` is removed and `builder` changes as below.
- **Events.** `Tutorial` emits the same `paved::events` structs: `Built` loses `role` and `spot`
  (`tutoriable.cairo:188-198`), `Scored` is unchanged in layout.
- **Shared code.** `tutoriable` is a twin of `playable` (the build of `Daily`): both call
  `Game::assess`, `Structures` and `Store`, and both use `Builder::place` and the `Characters` word. The
  storage layout is `Daily`'s.

### 2. The builder view and the views that remain

`builder` **stays**, with fewer fields (built in D-18b): it still answers the tile in hand and the
"not the player of the game" revert, and a `characters` view cannot be kept without characters. As built: the
counters simply go (`placed_count` and `available_count` would be a constant 0 and 7), so the struct is shorter, not
padded. Every view that remains on `Daily` and `Tutorial` after D-18, fields in order:

| View | Contract | Status | Fields, in order (type) |
|---|---|---|---|
| `game(game_id: u32) -> GameView` | both | unchanged | `id` u32, `player_id` felt252, `mode` u8, `seed` felt252, `score` u32, `over` bool, `tile_count` u32, `placed_count` u32, `discarded_count` u32, `tile_id` u32, `plan` u8, `remaining_count` u32, `deck_size` u32, `start_time` u64, `end_time` u64, `tournament_id` u64 |
| `tiles(game_id: u32, from: u32, count: u32) -> Array<TileView>` | both | unchanged | `id` u32, `status` u8, `plan` u8, `orientation` u8, `x` u32, `y` u32 |
| `builder(game_id: u32, player_id: felt252) -> BuilderView` | both | **changed** | old: `game_id` u32, `player_id` felt252, `tile_id` u32, `plan` u8, `placed_count` u8, `available_count` u8. New: `game_id` u32, `player_id` felt252, `tile_id` u32, `plan` u8 |
| `characters(game_id, player_id) -> Array<CharacterView>` | both | **removed** | old: `role` u8, `placed` bool, `tile_id` u32, `x` u32, `y` u32, `spot` u8 |
| `tournament(id: u64) -> TournamentView` | `Daily` | unchanged | `id` u64, `start_time` u64, `end_time` u64, `over` bool, `prize` u256, `top1_player_id` felt252, `top1_score` u32, `top1_claimed` bool, `top2_player_id` felt252, `top2_score` u32, `top2_claimed` bool, `top3_player_id` felt252, `top3_score` u32, `top3_claimed` bool |
| `current_tournament_id() -> u64` | `Daily` | unchanged | `u64` |
| `entry_price() -> PriceView` | `Daily` | unchanged | `token` ContractAddress, `amount` u256 |

### 3. Quests

The Daily quests count `Scored` events through the tally of a finished game (`quests.cairo:63-93`). Today
`Scored` is emitted **per structure** for roads, cities and wonders (`assessment.cairo:41-52`, `:84-95`:
one event, every character of the structure recovered) and **per character** for forests (`forest.cairo:182-193`,
one `solve` per Woodsman or Herdsman, `count_forest` each time). After D-18 a forest gives one event and one
`count_forest` per closure, so task 4 (`FOREST_SCORED`) counts forest closures. Whether a forest with 0
points still emits: yes (D-18b, `structure/forest.cairo` `assess_forest`): `Scored` with category FOREST and
points 0, and one `count_forest`, because the unit is the closure. `docs/architecture/quests.md`, tasks 2, 4 and 5, say so. Tasks 2, 5 and 6 keep their definitions but count more, since a structure no longer needs a character to score; tasks 7 to 10 are unchanged.

### Scoring seen from a client

Points no longer depend on the player's choices: a road, a city, a forest and a wonder score when they
close (`structure-state.md`, "D-18: scoring without characters"). A structure still open at game over
scores nothing. A client has no role picker, no `characters` call and no available-character counter.

Games open when the upgrade is installed (Sepolia) are scored under the new rules from the upgrade on, and keep
what they scored before (`structure-state.md`, "As built: D-18"). Their `Built` events from before the upgrade keep
`role` and `spot`: an indexer decodes `Built` by the shape of its data.

## Planned change D-19

D-19 and P-47 (`docs/programme/DECISIONS.md`): a tile's owner is the player who places it, and a closed structure
scores for the owner with the most tiles in it (nobody on a tie). Built in D-19b; the design as built is in
`structure-state.md`, "As built: D-19". Read from the ABIs on main (`contracts/abis/Daily.json`, `Tutorial.json`)
and the code, and confirmed by D-19b: `scripts/abis.sh` shows no diff, `TileView` has no `owner` field, `Built` and
`Scored` keep their layouts. `Lobby`'s ABI does not change, but its class does: it writes tiles through the same
store, whose tile slot now carries the owner's seat, so its class hash goes from `0x0005889…45e3` to `0x075abca…dfa2`
and the D-19 upgrade needs a `set_lobby_class` (until D-24 removes the Lobby library).

**D-19 itself needs no ABI change.** In single player (Daily, Tutorial: the only modes) every tile is the game's
player's, so the winner of every structure is that player, and every view and event already says so:

| Item | Today | What D-19 does to it | Kind |
|---|---|---|---|
| `TileView` (`views.cairo:55-62`; `tiles`, `daily.cairo:283`, `tutorial.cairo:178`) | `id, status, plan, orientation, x, y` | nothing required: the owner of every tile is `GameView.player_id`. An `owner: felt252` field appended after `y` is optional | addition (new field at the end), not a break |
| `Built` (`events.cairo:43-52`) | keys `game_id`; data `player_id, tile_id, plan, orientation, x, y` | unchanged: `player_id` is the caller who builds, which is the tile's owner | none |
| `Scored` (`events.cairo:65-72`) | keys `game_id`; data `player_id, category, size, points` | unchanged in layout. `player_id` becomes the structure's winner, which is the game's player in single player; `size` stays the node count of the formula, not the majority's tile count | none |
| `GameView`, `BuilderView`, `GameOver`, the other events | | unchanged | none |
| `Lobby` (`Lobby.json`) | | ABI unchanged: `Lobby` does not score; it writes tiles with seat 0 (the game's player), so its class changes with the tile's packing, not its ABI | none |

What the multiplayer mode would add (each one decided with that mode, not by D-19):

- `TileView.owner: felt252`, appended after `y` (an addition): the client cannot otherwise colour a tile by its
  owner. A tile written before D-19, and the starter tile, read owner 0, which means the game's player in single
  player; a multiplayer mode needs its own value for a starter tile owned by nobody.
- `Scored` on a tie: `player_id` 0 and `points` 0, still emitted so that an indexer sees the closure (built by
  D-19b, unreachable in single player; the multiplayer mode confirms it). Same layout, a new meaning of `player_id`
  0: META's indexer must not credit it to a player.
- Per-player scores: `GameView.score` and `GameOver.score` are the game's one score (`GameState.score`). A
  multiplayer game needs a score per player: a new view (or fields appended to `GameView`) and a `GameOver` per
  player, or a new event. A new field appended to a struct is an addition; changing what `score` means would be a
  break.
- The players of a game (`GameView.player_id` is one player) and whose turn it is: new views or appended fields.

## Breaking change D-20

D-20 and P-48 (`docs/programme/DECISIONS.md`): tournaments leave the code. The daily prize goes (sponsoring,
claiming, reclaiming, the `tournament` view); the daily seed, the day id, the economy settlement and the daily
leaderboard (served by the indexer) stay. **Not built yet**: the lists below are read from the ABIs on main
(`contracts/abis/Daily.json`, `Tutorial.json`, `Lobby.json`, `Account.json`) and the code; part B regenerates them
with `scripts/abis.sh`. The inventory and what becomes of the on-chain ranking are in `leaderboard.md`, "D-20:
tournaments leave the code (planned)". D-20 ships to Sepolia in the same upgrade as D-19.

**Stability promise.** D-20 is a stated exception, as D-18 was: a view, two entry points, a struct and three events
leave the interface, which the promise above does not allow. It is accepted for the same reason (mainnet is not
launched; Sepolia only). The promise holds again from the D-20 release on.

### `Daily`: entry points and views

| Item | Before (main) | After |
|---|---|---|
| `claim(tournament_id: u64, rank: u8)` (`IDaily`, `systems/daily.cairo:17`) | rank 1 to 3: the reward; rank 0: a sponsor's reclaim of a day nobody ranked in (P-37b) | **removed** |
| `sponsor(amount: felt252)` (`IDaily`, `daily.cairo:18`) | adds to the current day's prize | **removed** |
| `tournament(id: u64) -> TournamentView` (`ITournamentView`, `views.cairo:110`) | see "Views of `Daily` only" | **removed** |
| `TournamentView` (struct, `views.cairo:72-88`) | `id` u64, `start_time` u64, `end_time` u64, `over` bool, `prize` u256, `top1_player_id` felt252, `top1_score` u32, `top1_claimed` bool, `top2_player_id` felt252, `top2_score` u32, `top2_claimed` bool, `top3_player_id` felt252, `top3_score` u32, `top3_claimed` bool | **removed** from the ABI with the view |
| `current_tournament_id() -> u64` (`ITournamentView`, `views.cairo:111`) | `block_timestamp / 86400` | **unchanged** (proposed): the day id, ruling 2 |
| `entry_price() -> PriceView` (`ITournamentView`, `views.cairo:112`) | | **unchanged** |
| `spawn`, `discard`, `surrender`, `build`, `IDailyQuests`, `IGameView`, `IOwnable`, `upgrade`, `set_lobby_class` | | unchanged |

The errors of the prize leave with it: `Tournament: not found`, `not over`, `already claimed`, `invalid player`,
`nothing to claim`, `prize overflow`, `nothing to reclaim`, and `ERC20: refund failed` (`PayableComponent::refund`).
`ERC20: pay failed` stays (`Lobby`'s purchase, `lobby.cairo:110`).

### `Tutorial`

No entry point or view changes (it never had `claim`, `sponsor` or `tournament`). Its ABI loses the events
`Sponsored` and `Claimed`, which it declares through `paved::events::Event` and never emits. `Account`'s ABI loses
them for the same reason.

### `Lobby` (declared class, never deployed)

| Item | Before (main) | After |
|---|---|---|
| `ILobby.claim(tournament_id: u64, rank: u8)` (`lobby.cairo:30`) | | **removed** |
| `ILobby.sponsor(amount: felt252)` (`lobby.cairo:31`) | | **removed** |
| event `Reclaimed` (`Lobby::Event`, `lobby.cairo:215`, `:218-227`) | | **removed** |
| the other `ILobby` functions, `ILobbyClass` | | unchanged |

A new `Lobby` class is declared and set on `Daily` and `Tutorial` with `set_lobby_class` (`LobbyClassSet` emitted). Superseded by D-24: the `Lobby` class ends and its cold paths go back into Challenge.

### Events

| Event | Emitted by | Before (main) | After |
|---|---|---|---|
| `Sponsored` (`events.cairo:88-94`) | `Daily` | keys `tournament_id`; data `sponsor, amount` | **removed** from the ABIs of `Daily`, `Tutorial` and `Account`; a past event (below) |
| `Claimed` (`events.cairo:96-103`) | `Daily` | keys `tournament_id`; data `player_id, rank, reward` | **removed**, as `Sponsored`; a past event |
| `Reclaimed` (`lobby.cairo:218-227`) | `Daily`'s address (declared by `Lobby` only, so it is in `Lobby.json`, not in `Daily.json`) | keys `tournament_id, sponsor`; data `amount` | **removed** from `Lobby.json`; a past event |
| `GameSpawned` | `Daily`, `Tutorial` | keys `game_id, player_id`; data `mode, tournament_id, start_time, price` | **unchanged**: layout, names and values |
| `GameOver` | `Daily`, `Tutorial` | keys `game_id, player_id, tournament_id`; data `mode, score, start_time, end_time` | **unchanged**: layout, names and values |
| `PlayerCreated`, `Built`, `Discarded`, `Scored`, `LobbyClassSet`, the quest and achievement events | | | unchanged |

`Vault`'s own `Claimed { account, amount }` (`economy/vault.cairo:118`, the stakers' USDC) is another event of
another contract and stays. Its selector is the same as `paved::events::Claimed`'s (the hash of the name): a reader
tells them apart by the emitting address.

### Past events: what an indexer replaying history must know

Emitted before the D-20 upgrade, from `Daily`'s address only, and never after it. An indexer that replays history
strictly (ruling 7) keeps knowing them and skips them. Their layouts, in felts (selector = `sn_keccak` of the name,
`u256` as two felts, low then high):

| Event | `keys` | `data` | Emitted by (main) |
|---|---|---|---|
| `Sponsored` | `[selector("Sponsored"), tournament_id: u64]` | `[sponsor: ContractAddress, amount: felt252]` | `Daily.sponsor` (`hostable.cairo:163-168`) |
| `Claimed` | `[selector("Claimed"), tournament_id: u64]` | `[player_id: felt252, rank: u8, reward.low, reward.high]` | `Daily.claim`, rank 1 to 3 (`hostable.cairo:136-141`) |
| `Reclaimed` | `[selector("Reclaimed"), tournament_id: u64, sponsor: ContractAddress]` | `[amount.low, amount.high]` | `Daily.claim`, rank 0 (`lobby.cairo:266`) |

### The day id in `GameSpawned` and `GameOver`

Both keep the day id, in the field they carry today, **`tournament_id: u64`**, with the same layout and the same
values: the day id is `timestamp / 86400` (`TournamentImpl::compute_id`, which stays under another home).

- `GameSpawned.tournament_id` (data, 2nd field): the day of the spawn for a Daily game, `0` for a Tutorial game
  (`hostable.cairo:84-107`).
- `GameOver.tournament_id` (3rd key): the day the game counted for, set when the game ends in the day it started;
  `0` for a game that ended after its day and for every Tutorial game (`playable.cairo:36-52`, `events.cairo:105-117`).
- `GameView.tournament_id` (16th field) and `current_tournament_id()` keep it too.

The daily leaderboard groups on these keys (`indexer.md`, "What is derived") and keeps working unchanged. The
field keeps its name: a rename to `day` would keep every selector and layout but break decoders by name, so it is not
proposed (`leaderboard.md`, "Open for the PM").

## Breaking change D-21

D-21, D-22 and P-49 (`docs/programme/DECISIONS.md`): the tutorial leaves the contracts; only a claim of its
achievement stays on chain, in the quest system of D-24. **Not built yet**; read from the ABIs on main. Inventory:
`leaderboard.md`, "D-21: the tutorial leaves the contracts (planned)". D-21 is a stated exception to the stability
promise, as D-18 and D-20 are.

| Item | Before (main) | After |
|---|---|---|
| `Tutorial` (`Tutorial.json`): `spawn() -> u32`, `discard(game_id)`, `surrender(game_id)`, `build(game_id)`, `IGameView`, `IOwnable`, `upgrade`, `set_lobby_class` | the scripted tutorial | **unused from the upgrade on, still deployed on Sepolia** (ruling 1); not deployed on a new network. Its source leaves the repository; `contracts/abis/Tutorial.json` is kept, frozen, for the history its events left. It stays callable on Sepolia with its current class (see "Open for the PM" below) |
| `Lobby.tutorial_discard(game_id)`, `tutorial_surrender(game_id)`, `tutorial_report()` (`lobby.cairo:34-39`) | | **removed** (and the whole class with D-24) |
| `Collection.tutorial() -> ContractAddress` | the Tutorial minter | unchanged: the Sepolia `Tutorial`, or zero on a new network |
| `Collection.set_minters(daily, tutorial)` | refuses a zero `tutorial` (`collection.cairo:324`) | accepts a zero `tutorial` (a new network has none); with D-23 its first argument is `challenge` |
| `Daily` (Challenge), `Account` | | no entry point or view changes for D-21 |
| **New, planned:** `Setup.claim_tutorial()` | | the player's claim of First Stone: idempotent (one flag per player), no check, no value. Emits `AchievementProgressed { #[key] player_id: felt252, #[key] task_id: u32 = 10, count: u32 = 1 }` from the `Setup` address, once per player (D-24 below) |

**Codes.** `mode` 3 (Tutorial) in `GameSpawned`, `GameOver` and `GameView`, and the token ids from `TUTORIAL_OFFSET`
(`0x100000000`) up, keep their meaning for what was emitted and minted before D-21, and are never given to anything
else (P-42, ruling 4). No other `mode` code changes meaning. A task 10 `AchievementProgressed` comes from `Tutorial`'s
address before D-21 and from `Setup` after.

**Open for the PM.** The Sepolia `Tutorial` keeps its class and its `lobby_class`, so it stays playable by anyone who
calls it, mints Tutorial tokens through `Collection` and emits task 10. Nothing in the contracts can switch it off
without upgrading it (its `set_lobby_class` refuses zero). Proposed: leave it (test network), and the indexer stops
following `Tutorial` from the upgrade block; an upgrade of `Tutorial` to a class that reverts everything is the
alternative if the PM wants it closed.

## Breaking change D-23

D-23 and P-50 (`docs/programme/DECISIONS.md`): `Daily` is renamed Challenge, and each game's seed comes from its token
id. **Not built yet**; the inventory, the storage check and the seed are in `leaderboard.md`, "D-23: Daily becomes
Challenge (planned)". A stated exception to the stability promise, as D-18 is. The names below are proposed; the
selectors of the entry points and of the events do not change (a selector is the function's or the event's own name),
only the contract, interface, impl, enum and file names do.

| Kind | Old | New |
|---|---|---|
| Contract | `Daily` (`paved::systems::daily::Daily`) | `Challenge` (`paved::systems::challenge::Challenge`) |
| ABI file | `contracts/abis/Daily.json` | `contracts/abis/Challenge.json` |
| Interface | `IDaily` | `IChallenge` |
| Interface | `IDailyQuests` | leaves for `Setup` (D-24) |
| Impl names in the ABI | `DailyImpl`, `DailyQuestsImpl` | `ChallengeImpl` (the quests impl leaves) |
| Event enum | `paved::systems::daily::Daily::Event` | `paved::systems::challenge::Challenge::Event`; its variants and their keys are unchanged |
| Enum `Mode` (in `Lobby.json`, the `spawn` argument) | `Daily` | `Challenge`: u8 code 1 and Serde index 1 unchanged; `Lobby` itself ends with D-24 |
| `mode` code 1 in `GameSpawned`, `GameOver`, `GameView` | "Daily" | "Challenge": same value, same meaning (the paid mode) |
| Collection view | `daily() -> ContractAddress` | `challenge() -> ContractAddress` |
| Collection argument | `set_minters(daily, tutorial)` | `set_minters(challenge, tutorial)` |
| Errors | `'Daily: account is zero'`, `'Daily: token is zero'`, `'Daily: lobby class is zero'` | `'Challenge: ...'`; the third goes with `lobby_class` (D-24) |
| Errors (quest definitions) | `'Daily: quest not on UTC day'`, `'Daily: task total is zero'`, `'Daily: task id repeated'` | the `Setup` contract's own (D-24) |
| Deployment key | `contracts.Daily` in `contracts/deployments/<network>.json` | `contracts.Challenge` |
| Views, events, structs of `paved::views` and `paved::events` | | none holds "Daily": unchanged names |

**`spawn`.** `Challenge.spawn(stake: u8, referrer: ContractAddress, min_out: u256) -> u32`: the signature of
`Daily.spawn` (`systems/daily.cairo:14-16`), unchanged. What changes is the game it creates: its seed is
Poseidon(salt, token id) instead of the day's seed, so `GameView.seed` (same field, same type) differs for every game,
and two games of one day no longer draw the same deck. The day id stays in `GameSpawned.tournament_id`,
`GameOver.tournament_id`, `GameView.tournament_id` and `current_tournament_id()`.

**What the indexer and the client must rename** (read only here): the key `contracts.Daily` (META:
`packages/indexer/src/deployment.ts:53`; CLIENT: `packages/chain/src/deployment.ts:45`), the ABI import
`contracts/abis/Daily.json` (`packages/chain/src/abis.ts:2`) and the contract names in `ContractName`
(`abis.ts:13`, `:41`), the calls addressed to `"Daily"` (`views.ts:185-193`, `economy/writer.ts:281`, `:390`), the
mode label (`views.ts:24`, `app-web/src/pages/Player.tsx:156`), and `Collection.daily()` if read. The key changes in
the Sepolia upgrade of D-19 to D-24; proposed: both read `Challenge` with a fallback to `Daily` before it.

## Breaking change D-24

D-24 and P-51 (`docs/programme/DECISIONS.md`): `Lobby`'s cold paths go back into Challenge, and the quests and
achievements move to a new contract, **`Setup`** (one system, recommended; the D-24 system, named Setup by D-25). **Not built yet**; inventory and design:
`leaderboard.md`, "D-24: Lobby's cold paths and a quest system (planned)". A stated exception to the stability promise.

### What leaves Challenge (`Daily`) and `Lobby`

| Item | Before (main) | After |
|---|---|---|
| `IDailyQuests`: `define_quest(quest_id, schedule, tasks, conditions)`, `retire_quest(quest_id)`, `define_achievement(achievement_id, window, tasks, points)`, `retire_achievement(achievement_id)` (`systems/daily.cairo:28-46`) | on `Daily`, owner-only | **moved to `Setup`**, same signatures |
| `ILobbyClass.set_lobby_class(class_hash)`, event `LobbyClassSet { class_hash }` (`daily.cairo:265-275`, `:153`) | on `Daily` and `Tutorial` | **removed** from Challenge |
| Constructor of `Daily` | `(owner, account_address, token_address, lobby_class)` (`daily.cairo:159-165`) | `(owner, account_address, token_address)` for a new deploy (Sepolia upgrades in place) |
| The quiver events in Challenge's ABI (`QuestDefined`, `QuestProgressed`, `QuestRetired`, `QuestCompleted`, `QuestClaimed`, `QuestReporterSet`, the `Achievement*` ones) | declared and emitted by `Daily` | emitted by `Setup` only. They stay in Challenge's ABI, never emitted, only if part B keeps the components declared to hold their dead storage |
| `spawn`, `discard`, `surrender`, `build` | wrappers of a library call (`spawn`, `discard`, `surrender`), `build` in `Daily` | same signatures; the code runs in Challenge |
| The `Lobby` class (`Lobby.json`): `ILobby` (`spawn`, `claim`, `sponsor`, `discard`, `surrender`, `tutorial_*`, `report`, the four definitions), event `Reclaimed` | declared, never deployed, run by library call | **ends**: no Lobby class or contract until the multiplayer mode is planned (the name is reserved for it, P-51 (2)) |

### `Setup`: the planned ABI (the quest part)

| Entry point or view | Who | What |
|---|---|---|
| `constructor(owner: ContractAddress)` | deployer | |
| `report(player_id: felt252, quests: Span<TaskProgress>, achievements: Span<TaskProgress>)` | an allowlisted reporter (Challenge) | one call per game over; `TaskProgress { task_id: u32, count: u32 }` (quiver); emits one `QuestProgressed` per quest entry and one `AchievementProgressed` per achievement entry. Reverts `'Quest: not reporter'` for any other caller |
| `set_reporter(reporter: ContractAddress, allowed: bool)` | owner | emits `QuestReporterSet` and `AchievementReporterSet` |
| `claim_tutorial()` | any player | idempotent; the first call emits `AchievementProgressed { player_id: caller, task_id: 10, count: 1 }` |
| `define_quest`, `retire_quest`, `define_achievement`, `retire_achievement` | owner | as on `Daily` today, same checks |
| `is_reporter(reporter: ContractAddress) -> bool`, `tutorial_claimed(player_id: felt252) -> bool` | anyone | views (proposed: the client shows whether First Stone was claimed) |
| `IOwnable` (`owner`, `pending_owner`, `transfer_ownership`, `accept_ownership`), `upgrade(new_class_hash)` | owner | as the other contracts (P-42) |

Events of `Setup`, with quiver 0.2.0's layouts (unchanged from those `Daily` emits today): `QuestDefined { #[key]
quest_id, schedule, tasks, conditions }`, `QuestProgressed { #[key] player_id, #[key] task_id, count }`, `QuestRetired
{ #[key] quest_id }`, `AchievementDefined { #[key] achievement_id, window, tasks, points }`, `AchievementProgressed
{ #[key] player_id, #[key] task_id, count }`, `AchievementRetired { #[key] achievement_id }`, `QuestReporterSet
{ #[key] reporter, allowed }`, `AchievementReporterSet { #[key] reporter, allowed }`; plus `Upgraded` and the ownership
events. The indexer follows them from `Setup`'s deployment block; the ones `Daily` and `Tutorial` emitted before stay
history (not migrated, P-51 (5)).
