# Public read-only interface

The views that `Challenge` (named `Daily` before D-23) and `Tutorial` expose so that a client can show a game, its board, the
characters of its player and the Daily tournaments without an indexer. Events give the lists ("my
games", history); views give the current state of one game or one tournament.

**Since D-21 a fresh network has no Tutorial**: the rows below that name `Tutorial`, its deck or `mode` `3` describe the
old Sepolia `Tutorial` only (legacy), and `Mode` `3` reads as `None` in the contracts.

This is a published interface. Its types (`contracts/src/views.cairo`) are plain structs built for
the client, not the storage structs: the storage will change in phase P5 (persistent structure
state, packing) and these views will not.

**Where the current state is.** The sections from "Breaking change D-18" on are a changelog, read as a stack: an earlier
row keeps the names and strings a later section renamed. The state as it stands is in three sections at the end: "The
events of `Challenge`, current", "What the constructors emit at deployment", "Current surface: `Economy`, `PavedToken`,
`Faucet`", and the two short notes after them (the price constant, `Collection.set_minters`).

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
- **Exception, D-20:** broken once more by "Breaking change D-20" below, for the same reason. The promise holds
  again from the D-20 release on.

A client that decodes by ABI (starknet.js, starknet.py) keeps working when fields are appended, as
long as it reads the ABI of the deployed class.

## Conventions

| Thing | Type | Meaning |
|---|---|---|
| `game_id` | `u32` | Id of a game, counted per contract from 1 (`Challenge` game 1 and `Tutorial` game 1 are two games). A Challenge game's token id in `Collection`, and since D-23 the source of its seed |
| `player_id` | `felt252` | Address of the player's account, as a felt |
| tile id | `u32` | Order of draw within the game, from 1. Tile 1 is the starter tile, placed at spawn. Each drawn tile is placed or discarded before the next is drawn, so the order of the placed tiles by id is their order of placement |
| `x`, `y` | `u32` | Board position; the starter tile is at (`CENTER`, `CENTER`), `CENTER = 0x7fffffff`; `y + 1` is north, `x + 1` is east. `0, 0` means "not on the board" |
| `mode` | `u8` | `1` Challenge (named Daily before D-23, same code); `3` Tutorial (legacy: the old Sepolia `Tutorial` only, `None` on a fresh network); `2` was Weekly. `2` and `3` are never given again |
| `plan` | `u8` | `Plan` code (`types/plan.cairo`); `0` means none |
| `orientation` | `u8` | `0` none (not placed), `1` north, `2` east, `3` south, `4` west |
| `role` | `u8` | `1` Lord, `2` Lady, `3` Adventurer, `4` Paladin, `5` Pilgrim, `6` Woodsman, `7` Herdsman (the last two since P4) Removed by D-18 |
| `spot` | `u8` | `0` none, `1` center, `2` north-west, `3` north, `4` north-east, `5` east, `6` south-east, `7` south, `8` south-west, `9` west Removed by D-18 |
| score, points | `u32` | Game points, no decimals |
| time | `u64` | Block timestamp, seconds |
| prize | `u256` | Amount of the entry token, in its base unit (18 decimals for the test token) |

## Missing data

- **A game that does not exist** (id 0, or above the last id given): `game`, `tiles`, `builder`,
  `initial_seed` and `characters` revert with `Game: does not exist`. A zeroed view would be indistinguishable from a
  real game in some fields (score 0, not over), so the views refuse it.
- **A player who is not the player of the game**: `builder` and `characters` revert with
  `View: not the game player`. Games are single-player; the player is the one who spawned it.
- **A tournament**: `tournament` never reverts. A day with no entry returns its id, its start and
  end times, and zero everywhere else. An id above `MAX_TOURNAMENT_ID = 213503982334600`
  (`(2^64 - 1) / 86400 - 1`, the last day whose end time fits in a `u64`) can never hold a
  tournament: it returns its id and zero everywhere else, `start_time` and `end_time` included.

## Views of `Challenge` and `Tutorial` (`IGameView`)

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
| 15 | `end_time` | `u64` | Time of the end of the game when it ended in the day it started; `0` otherwise (game not over, ended after its day closed). Always `0` for a Tutorial game, even when it is over: no day, so no end time |
| 16 | `day_id` | `u64` | The day the game counted for (`timestamp / 86400`), set when the game ends in the day it started; `0` otherwise. `0` while a Daily game runs, set at game over, and still `0` for a Daily game over after its day closed. Always `0` for a Tutorial game: it belongs to no day. Named `tournament_id` before D-20 (same position, type and values) |
| 17 | `expires_at` | `u64` | `start_time + 86400` (S1): from this second on, `build` and `discard` revert `'Game: expired'`; `surrender` stays open. The same second as `Economy`'s expiry (`terms.time + 86400`). Fixed for the life of the game, over or not. Appended by S1 |

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

The draw order is a promise (S1, for the client's next-tile prediction): `tiles` lists every drawn
tile, ids `1..=tile_count` in the order they were drawn, with its status. A discarded tile reads
`x = y = 0` here, but its reseed hashed the position it was drawn with, `(CENTER, CENTER)`
(`docs/architecture/client-spec-core.md`, section 3).

### `initial_seed(game_id: u32) -> felt252`

The seed the game started with, before the deck's withdrawal and the first draw (S1): its token's
seed, `Poseidon(0, Challenge, game_id)` (`TokenSeed`, D-23), right for every game. With `tiles`, what a
client replays to compute the next draw locally (`client-spec-core.md`, section 3), for every game spawned
by a class from G1 (78ab2ab0) on: the only games a network gets under D-27 (one fresh Sepolia deployment, no
upgrade of the pre-G1 class live there). A game spawned by a pre-G1 class built its deck with the old walk
(`tests::legacy_g1::tiles_before_g1`): if a class were ever upgraded over such games, the client's open-time
check against `game()` fails for them, and it falls back to no prediction. Reverts `Game: does not exist`
for no game.

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

## Views of `Challenge` only (`IChallengeView`)

`ITournamentView` before D-20; the `tournament(id)` view and its `TournamentView` left with the prize (D-20).

### `current_day() -> u64`

The day of the current block time: `block_timestamp / 86400`. One day per UTC day. `current_tournament_id()` before
D-20 (same value; a new selector, since a selector is the name's hash).

### `entry_price() -> PriceView`

What `spawn` pulls from the player: the ERC20 and the amount. It is read from the same source as
`spawn` (the token the contract was deployed with, and the price of the mode), so the two cannot
diverge. `Economy` checks the price against `BASE_PRICE`, which is built from the same constant, so `spawn` and `Economy`
cannot disagree either ("One constant sets the price of a stake unit", at the end).

| # | Field | Type | Meaning |
|---|---|---|---|
| 1 | `token` | `ContractAddress` | The ERC20 that `spawn` pulls the entry price from (the player approves the `Challenge` contract on it) |
| 2 | `amount` | `u256` | The price of one stake unit, in the base unit of the token: 2,000,000 (2 USDC, 6 decimals). `spawn(stake, ..)` pulls `stake x amount` |

## The spawn pause of `Challenge` (`IChallengeGuardian`, G4)

The emergency stop of new purchases (`upgrade-owner.md`, section 3). A guardian, set by the owner, may pause `spawn`;
only the owner unpauses. Nothing else pauses: `build`, `discard`, `surrender`, the game-over report to `Setup`,
`Economy.record` and `Economy.settle` work while paused, so every game already bought can end and be paid.

| Entry point or view | Who | What |
|---|---|---|
| `set_guardian(guardian: ContractAddress)` | owner | sets the guardian; zero means no guardian. Emits `GuardianSet { guardian }` (every call). Others revert `'Ownable: caller is not owner'` |
| `pause_spawn()` | the guardian (non-zero) or the owner | pauses `spawn`. Emits `SpawnPaused { by }` (the caller) when it pauses; while already paused it does nothing (no revert, no event). Others revert `'Challenge: not guardian'` |
| `unpause_spawn()` | owner | unpauses `spawn`. Emits `SpawnUnpaused` when it unpauses; while not paused it does nothing. Others, the guardian included, revert `'Ownable: caller is not owner'` |
| `guardian() -> ContractAddress` | anyone | the guardian, zero if none |
| `spawn_paused() -> bool` | anyone | whether `spawn` is paused |

While paused, `spawn` reverts with `'Challenge: spawn paused'` before any call or transfer: no game, no purchase, no
token. A client reads `spawn_paused()` to disable its "play" button and say why, and follows `SpawnPaused` and
`SpawnUnpaused` to refresh. The three events have no keyed field:

| Event | `keys` | `data` |
|---|---|---|
| `GuardianSet` | `[selector("GuardianSet")]` | `[guardian]` |
| `SpawnPaused` | `[selector("SpawnPaused")]` | `[by]` |
| `SpawnUnpaused` | `[selector("SpawnUnpaused")]` | `[]` |

A fresh deployment has no guardian and is not paused; so is a `Challenge` upgraded in place to this class (both
storage slots read zero).

## The errors of `Challenge.build`

`build(game_id, orientation, x, y)` checks `x` and `y` first, before any read or write:

| Error | When |
|---|---|
| `'Challenge: invalid position'` | `x` or `y` is `0` or `4294967295` (`u32::MAX`). Checked before everything else, so it also wins over `'Game: does not exist'` and the others below |
| `'Game: does not exist'`, `'Game: not yet started'`, `'Game: is over'`, `'Game: expired'` | the game is not there, has not started, is over, or is past `expires_at` |
| `'Builder: does not exist'` | the caller is not the player of the game |
| `'Tile: already exists'`, `'Tile: no neighbors'`, `'Tile: cannot place'` and the other board errors | the position is taken, has no neighbour, or the tile does not fit |

The rule is exact: a build reads the eight neighbours of `(x, y)`, so a position with a coordinate of `0` or `u32::MAX`
can never be built (its neighbour leaves `u32`), and every other position is left to the board's own checks. The board
has no other bound: `CENTER` (`0x7fffffff`) only marks where the starter tile lies. Before this check, such a call
reverted with a raw `u32_sub Overflow` (or `u32_add Overflow`). The ABI does not change: only the error is new.

## Events for lists

The views read one game; lists come from events. The player id is a key of the two events a list
needs, so a node can filter them (`starknet_getEvents` with `keys`):

| Event | Keys, in order | Data |
|---|---|---|
| `GameSpawned` | selector, `game_id`, `player_id` | `mode`, `day_id` (`0` for Tutorial), `start_time`, `price` |
| `GameOver` | selector, `game_id`, `player_id`, `day_id` | `mode`, `score` (final), `start_time`, `end_time` |

"My games": `GameSpawned` with keys `[[selector], [], [player_id]]`. "My finished games and their
scores": `GameOver` with the same filter. "Games of a day": `GameOver` with keys
`[[selector], [], [], [day_id]]` (`day_id` is `0` for a game that did not count, and
for every Tutorial game). A Tutorial game belongs to no day: its `GameSpawned` and its
`GameOver` carry `day_id = 0`. The field was `tournament_id` before D-20: same position, type and values.
The other events of `Challenge` are listed in "The events of `Challenge`, current" at the end (the table of
`native-storage.md` is history).

## How the views are read today

For the record, not part of the interface: the views are computed from the storage of
`native-storage.md`. The player of a game is `GameConfig.player_id`, recorded at spawn (so a game
with no build has one too). `placed_count = built + 1`, `discarded_count = discarded`, the tile to
place now is tile `tile_count` while the game is not over, and a tile is `held` when it is the
builder's `tile_id`, which is `GameState.held_tile` (kept by a surrender, 0 after the last tile).
`end_time` and `day_id` come from `GameEnd`. Phase P5 may compute them otherwise; the fields
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
    the pool's quote (`Economy.quote_swap(Economy.quote(stake).burn_quote)` on devnet) less the slippage. (Both
    rules changed afterwards. **Referrer, since D-25 E and P-58**: it counts only if it is a non-zero address other than the
    payer, the Vault, the router, `Economy` and the game (`Challenge`); `Challenge` drops the payer, `Economy` and itself
    (`challenge.cairo:476-480`), `Economy.purchase` drops the payer, the Vault, the router, `Economy` and the game
    (`economy.cairo:668-673`), and a dropped referrer is ignored: no referral, the spawn goes on, `Purchased.referrer`
    and `referral` read 0. **`min_out`, since P-56**: it bounds the whole swap, the burn quote and the Vault's part
    together less any referral, not the burn's part alone; the swap itself must pay at least `min_out`
    (`economy.cairo` `swap`, `'Economy: swap below min_out'`), and the client takes it from
    `quote_swap(price - referral)`: see "`Economy`" under P-56 below.) A
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
    `addresses`, `owner`, and `settle(game_ids)` is open to anyone from `(D + 2) x 86400`. (It now also has `router()`
    and, since P-56, `split_bps()`; the full current surface is under "Current surface: `Economy`, `PavedToken`,
    `Faucet`" at the end.)
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

- **G4, the pause guardian on `Challenge.spawn`** (above, "The spawn pause of `Challenge`"; `upgrade-owner.md`,
  section 3).
  - `Challenge` gains three entry points, `set_guardian(guardian)` (owner), `pause_spawn()` (the guardian or the
    owner) and `unpause_spawn()` (owner), two views, `guardian()` and `spawn_paused()`, and three events,
    `GuardianSet { guardian }`, `SpawnPaused { by }` and `SpawnUnpaused`, under the new interface
    `paved::systems::challenge::IChallengeGuardian` (impl `ChallengeGuardianImpl`). `contracts/abis/Challenge.json`
    is regenerated.
  - `spawn` keeps its signature; while paused it reverts `'Challenge: spawn paused'` and leaves no game. Nothing else
    changes: a client that never reads the new views keeps working, and sees that revert only once the guardian
    pauses. An indexer that refuses unknown selectors must know the three events before the owner first calls
    `set_guardian`.

- **Gems v1, part 1** (P-61, `docs/architecture/gems-v1.md`; below, "Gems v1, part 1: `Setup` and `Challenge`").
  - `Setup` gains the interface `ISetupGems`: seven entry points and five views, and five events. `Challenge` gains
    `spawn_free() -> u32`. `contracts/abis/Setup.json` and `Challenge.json` are regenerated. No entry point changes
    signature and none is removed.
  - A free game's `GameSpawned.price` is 0 (a paid game's never is). Its game over emits `GameOver` as any game's, then
    reports achievement progress only: no `QuestProgressed`, and `Economy` emits nothing for it (no `Purchased`,
    `Recorded` or `Settled`).
  - An indexer that refuses unknown selectors must know the five new events of `Setup` before the contracts that emit them
    are indexed.

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

D-20 and P-48 (`docs/programme/DECISIONS.md`), with the PM's rulings of 2026-10-13: tournaments leave the code. The
daily prize goes (sponsoring, claiming, reclaiming, the `tournament` view), the on-chain ranking goes (task 9 is no
longer reported), and the day id is renamed `day_id`; the daily seed, the economy settlement and the daily leaderboard
(served by the indexer) stay. **Built by D-20b**: the lists below are the diff of `contracts/abis/*.json` regenerated
with `scripts/abis.sh` on the D-20b branch against main. The inventory is in `leaderboard.md`, "As built: D-20". D-20
reaches Sepolia with the fresh deployment of P-53, not as an upgrade (`upgrades.md`, "D-20 on Sepolia").

**Stability promise.** D-20 is a stated exception, as D-18 was: a view, two entry points, a struct and three events
leave the interface, and the day id's names change, which the promise above does not allow. It is accepted for the
same reason (mainnet is not launched; Sepolia only). The promise holds again from the D-20 release on.

### The renames (ruling 2)

Layouts, order and types unchanged; only the names change. A renamed event field keeps every selector and every
key and data position; a renamed function gets a new selector (the hash of its name), so a caller must use the new
name.

| Before (main) | After | Where |
|---|---|---|
| `GameSpawned.tournament_id: u64` (data, 2nd field) | `GameSpawned.day_id: u64` | `Daily`, `Tutorial`, `Account` ABIs (`paved::events::GameSpawned`) |
| `GameOver.tournament_id: u64` (3rd key) | `GameOver.day_id: u64` | `Daily`, `Tutorial`, `Account` ABIs (`paved::events::GameOver`) |
| `GameView.tournament_id: u64` (16th field) | `GameView.day_id: u64` | `Daily`, `Tutorial` ABIs (`paved::views::GameView`) |
| `current_tournament_id() -> u64` | `current_day() -> u64` (new selector) | `Daily` |
| interface `paved::views::ITournamentView`, impl `TournamentViewImpl` | `paved::views::IDailyView`, `DailyViewImpl` | `Daily` ABI only: no selector depends on it |

`entry_price() -> PriceView` stays, now under `IDailyView`.

### `Daily`: entry points and views

| Item | Before (main) | After |
|---|---|---|
| `claim(tournament_id: u64, rank: u8)` (`IDaily`) | rank 1 to 3: the reward; rank 0: a sponsor's reclaim of a day nobody ranked in (P-37b) | **removed** |
| `sponsor(amount: felt252)` (`IDaily`) | adds to the current day's prize | **removed** |
| `tournament(id: u64) -> TournamentView` (`ITournamentView`) | the prize, the claimed flags and the three ranks of a day | **removed** |
| `TournamentView` (struct) | `id` u64, `start_time` u64, `end_time` u64, `over` bool, `prize` u256, `top1_player_id` felt252, `top1_score` u32, `top1_claimed` bool, `top2_player_id` felt252, `top2_score` u32, `top2_claimed` bool, `top3_player_id` felt252, `top3_score` u32, `top3_claimed` bool | **removed** from the ABI with the view |
| `current_tournament_id() -> u64` | `block_timestamp / 86400` | **renamed** `current_day()` (above) |
| `entry_price() -> PriceView` | | unchanged |
| `spawn`, `discard`, `surrender`, `build`, `IDailyQuests`, `IGameView`, `IOwnable`, `upgrade`, `set_lobby_class` | | unchanged (`GameView`'s 16th field renamed) |

The errors of the prize leave with it: `Tournament: not found`, `not over`, `already claimed`, `invalid player`,
`nothing to claim`, `prize overflow`, `nothing to reclaim`, and `ERC20: refund failed`. `ERC20: pay failed` stays, from
`Lobby`'s purchase only (`PayableComponent::pay` raised it too, and went).

### `Tutorial` and `Account`

No entry point or view changes (they never had `claim`, `sponsor` or `tournament`). Their ABIs lose the events
`Sponsored` and `Claimed`, which they declared through `paved::events::Event` and never emitted, and the struct
`core::integer::u256`, which only `Claimed` used in them. `GameSpawned` and `GameOver` carry `day_id` (above), and so
does `Tutorial`'s `GameView`.

### `Lobby` (declared class, never deployed)

| Item | Before (main) | After |
|---|---|---|
| `ILobby.claim(tournament_id: u64, rank: u8)` | | **removed** |
| `ILobby.sponsor(amount: felt252)` | | **removed** |
| event `Reclaimed` (`Lobby::Event`) | | **removed** |
| the other `ILobby` functions, `ILobbyClass` | | unchanged |

On an existing deployment a new `Lobby` class is declared and set on `Daily` and `Tutorial` with `set_lobby_class`
(`LobbyClassSet` emitted); Sepolia gets it with the fresh deployment of P-53.
Superseded by D-24: the `Lobby` class ends and its cold paths go back into Challenge.

### Events

| Event | Emitted by | Before (main) | After |
|---|---|---|---|
| `Sponsored` | `Daily` | keys `tournament_id`; data `sponsor, amount` | **removed** from the ABIs of `Daily`, `Tutorial` and `Account`; a past event (below) |
| `Claimed` | `Daily` | keys `tournament_id`; data `player_id, rank, reward` | **removed**, as `Sponsored`; a past event |
| `Reclaimed` | `Daily`'s address (declared by `Lobby` only, so it was in `Lobby.json`, not in `Daily.json`) | keys `tournament_id, sponsor`; data `amount` | **removed** from `Lobby.json`; a past event |
| `GameSpawned` | `Daily`, `Tutorial` | keys `game_id, player_id`; data `mode, tournament_id, start_time, price` | layout and values unchanged; `tournament_id` renamed `day_id` |
| `GameOver` | `Daily`, `Tutorial` | keys `game_id, player_id, tournament_id`; data `mode, score, start_time, end_time` | layout and values unchanged; `tournament_id` renamed `day_id` |
| `AchievementProgressed` with `task_id` 9 (`WIN`) | `Daily` | at the game over of a game that took rank 1 of its day at that moment | **never emitted** from the D-20 upgrade on (ruling 1); task 9 stays defined, never reused |
| `PlayerCreated`, `Built`, `Discarded`, `Scored`, `LobbyClassSet`, the other quest and achievement events | | | unchanged |

`Vault`'s own `Claimed { account, amount }` (`economy/vault.cairo`, the stakers' USDC) is another event of another
contract and stays. Its selector is the same as the past `paved::events::Claimed`'s (the hash of the name): a reader
tells them apart by the emitting address.

### Past events: what an indexer replaying history must know

Emitted before the D-20 upgrade, from `Daily`'s address only, and never after it. An indexer that replays history
strictly (ruling 7) keeps knowing them and skips them. Their layouts, in felts (selector = `sn_keccak` of the name,
`u256` as two felts, low then high):

| Event | `keys` | `data` | Emitted by (main, before D-20) |
|---|---|---|---|
| `Sponsored` | `[selector("Sponsored"), tournament_id: u64]` | `[sponsor: ContractAddress, amount: felt252]` | `Daily.sponsor` (`hostable.cairo`) |
| `Claimed` | `[selector("Claimed"), tournament_id: u64]` | `[player_id: felt252, rank: u8, reward.low, reward.high]` | `Daily.claim`, rank 1 to 3 (`hostable.cairo`) |
| `Reclaimed` | `[selector("Reclaimed"), tournament_id: u64, sponsor: ContractAddress]` | `[amount.low, amount.high]` | `Daily.claim`, rank 0 (`lobby.cairo`) |

On Sepolia none of the three was ever emitted (`Daily` at `0x06a9...5ac8`, read on 2026-10-13 from block 0 to block
16,538,960; `leaderboard.md`, "As built: D-20"), so an indexer replaying Sepolia meets none of them.

### The day id in `GameSpawned`, `GameOver` and `GameView`

Same layout and values as before D-20, under the name `day_id`: the day id is `timestamp / 86400`
(`paved::day::day_id`, which was `TournamentImpl::compute_id`).

- `GameSpawned.day_id` (data, 2nd field): the day of the spawn for a Daily game, `0` for a Tutorial game.
- `GameOver.day_id` (3rd key): the day the game counted for, set when the game ends in the day it started; `0` for a
  game that ended after its day and for every Tutorial game.
- `GameView.day_id` (16th field) and `current_day()` carry it too.

The daily leaderboard groups on these keys (`indexer.md`, "What is derived") and keeps working: an indexer that
decodes by position is unaffected; one that decodes by name reads `day_id` from the D-20 classes on and
`tournament_id` before.

## Breaking change D-21

D-21, D-22 and P-49 (`docs/programme/DECISIONS.md`): the tutorial leaves the contracts; only a claim of its
achievement stays on chain, in the quest system of D-24. **Built by step D** (with D-24); the table is the ABI diff as
built (`contracts/abis/`). Inventory: `leaderboard.md`, "As built: D-21, the tutorial leaves the contracts". D-21 is a stated exception to the stability
promise, as D-18 and D-20 are.

| Item | Before (main) | After |
|---|---|---|
| `Tutorial` (`Tutorial.json`): `spawn() -> u32`, `discard(game_id)`, `surrender(game_id)`, `build(game_id)`, `IGameView`, `IOwnable`, `upgrade`, `set_lobby_class` | the scripted tutorial | **unused from the upgrade on, still deployed on Sepolia** (ruling 1); not deployed on a new network. Its source leaves the repository, and so does `contracts/abis/Tutorial.json` (in git at 38f1c959, for the history its events left). It stays callable on Sepolia with its current class (see "Open for the PM" below) |
| `Lobby.tutorial_discard(game_id)`, `tutorial_surrender(game_id)`, `tutorial_report()` (`lobby.cairo:34-39`) | | **removed** (and the whole class with D-24) |
| `Collection.tutorial() -> ContractAddress` | the Tutorial minter | **removed** (PM's addendum: the Tutorial NFT path). The slot stays, written by `set_minters` only and read by `token_uri` for Sepolia's Tutorial tokens |
| `Collection.set_minters(daily, tutorial)` | refuses a zero `tutorial` (`collection.cairo:324`) | accepts a zero `tutorial` (a new network has none; `deploy.sh` passes 0); with D-23 its first argument is `challenge` |
| `Daily` (Challenge), `Account` | | no entry point or view changes for D-21 |
| **New:** `Setup.claim_tutorial()` | | the player's claim of First Stone: idempotent (one flag per player), no check, no value. Emits `AchievementProgressed { #[key] player_id: felt252, #[key] task_id: u32 = 10, count: u32 = 1 }` from the `Setup` address, once per player (D-24 below) |

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
id. **Built by D-23b**; the plan, the storage check and the seed are in `leaderboard.md`, "D-23: Daily becomes
Challenge (planned)", and "As built (D-23b)" below gives the ABI diff. A stated exception to the stability promise, as
D-18 is. The selectors of the entry points and of the events do not change (a selector is the function's or the
event's own name), only the contract, interface, impl, enum and file names do.

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
Poseidon(salt, the Challenge contract's address, token id) instead of the day's seed (as built, with the PM's
addition of 2026-10-14), so `GameView.seed` (same field, same type) differs for every game,
and two games of one day no longer draw the same deck. The day id stays in `GameSpawned.day_id`,
`GameOver.day_id`, `GameView.day_id` and `current_day()` (renamed by D-20).

**What the indexer and the client must rename** (read only here): the key `contracts.Daily` (META:
`packages/indexer/src/deployment.ts:53`; CLIENT: `packages/chain/src/deployment.ts:45`), the ABI import
`contracts/abis/Daily.json` (`packages/chain/src/abis.ts:2`) and the contract names in `ContractName`
(`abis.ts:13`, `:41`), the calls addressed to `"Daily"` (`views.ts:185-193`, `economy/writer.ts:281`, `:390`), the
mode label (`views.ts:24`, `app-web/src/pages/Player.tsx:156`), and `Collection.daily()` if read. The key changes in
the Sepolia upgrade of D-19 to D-24; proposed: both read `Challenge` with a fallback to `Daily` before it.

### As built (D-23b)

`contracts/abis/Daily.json` is replaced by `Challenge.json` (`scripts/abis.sh`). Against `Daily.json` of main
(d62c6a37), the whole diff is:

| Item | `Daily.json` | `Challenge.json` |
|---|---|---|
| impls | `DailyImpl`, `DailySetupImpl`, `DailyViewImpl` | `ChallengeImpl`, `ChallengeSetupImpl`, `ChallengeViewImpl` |
| interfaces | `paved::systems::daily::IDaily`, `paved::systems::daily::IDailySetup`, `paved::views::IDailyView` | `paved::systems::challenge::IChallenge`, `paved::systems::challenge::IChallengeSetup`, `paved::views::IChallengeView` |
| event enum | `paved::systems::daily::Daily::Event` | `paved::systems::challenge::Challenge::Event` |
| event struct | `paved::systems::daily::SetupSet` | `paved::systems::challenge::SetupSet` (variant `SetupSet`: same selector and layout) |
| `PlayerCreated` | the struct `paved::events::PlayerCreated` and its variant | **removed** (below) |

Every function, its arguments and outputs, every other event and every struct is unchanged. `Collection.json`: the
view `daily()` is `challenge()` (a new selector), and the first argument of `set_minters` is named `challenge` (same
selector). No other ABI changes.

- **`Mode`**: `Mode::Challenge`, code 1 (`types/mode.cairo`); the felt is `'CHALLENGE'`; codes 2 and 3 still read as
  `None` (`paved::types::mode::tests::test_reserved_u8_into_mode`).
- **Errors**: `'Challenge: token is zero'`, `'Challenge: setup is zero'`, `'Challenge: economy not set'`,
  `'Challenge: collection not set'`.
- **Storage**: no field is renamed and no address moves. `Collection`'s field stays `daily`, at `sn_keccak("daily")`,
  and `challenge()` reads it (`tests::collection::test_collection_pins_the_challenge_minter_at_daily`,
  `tests::e2e::upgrades::test_upgrade_layout_pins_setup_and_economy_by_name`).
- **The seed**: `TokenSeed` (`seed.cairo`), Poseidon(salt, contract address, token id), the token id being the game
  id, the contract `Challenge`'s own address and the salt 0: a Challenge game's initial seed is Poseidon(0,
  `Challenge`'s address, game id), so each deployment has its own decks (PM, 2026-10-14; `TokenSeed { contract }`,
  set to `get_contract_address()` at spawn). Three inputs where the day seed had two: Poseidon pads the inputs by
  their count, so the two forms meet only through a Poseidon collision. `DailySeed` and `Mode::seed` are gone; the day id
  (`day_id`, `current_day()`, the economy's day) is unchanged. `GameView.seed` is still the current seed (moved on by
  the first draw at spawn).
- **`PlayerCreated`**: removed from `paved::events::Event`, so from `Challenge.json`. No game contract ever emitted it
  (`Account` did, until D-25 E). Removed once META's indexer (#349) stopped reading it from the ABI: the indexer knows
  the name as a past event and skips it.
- **Deployment key**: `scripts/deploy.sh` (devnet and the fresh path) writes `contracts.Challenge`, and
  `contracts/deployments/devnet.json` is regenerated so. `sepolia.json` keeps `contracts.Daily` until the fresh
  Sepolia deployment (F, P-53): the interim client and the pinned `--repoint` and `--d18` (06c024d) read it.

## Breaking change D-24

D-24 and P-51 (`docs/programme/DECISIONS.md`): `Lobby`'s cold paths go back into Challenge, and the quests and
achievements move to a new contract, **`Setup`** (the D-24 system, named Setup by D-25). **Built by step D**; the tables are the
ABI diff as built. Inventory and design: `leaderboard.md`, "As built: D-24, Lobby's cold paths and a quest system". A stated exception to the stability promise.

### What leaves Challenge (`Daily`) and `Lobby`

| Item | Before (main) | After |
|---|---|---|
| `IDailyQuests`: `define_quest(quest_id, schedule, tasks, conditions)`, `retire_quest(quest_id)`, `define_achievement(achievement_id, window, tasks, points)`, `retire_achievement(achievement_id)` (`systems/daily.cairo:28-46`) | on `Daily`, owner-only | **moved to `Setup`**, same signatures |
| `ILobbyClass.set_lobby_class(class_hash)`, event `LobbyClassSet { class_hash }` (`daily.cairo:265-275`, `:153`) | on `Daily` and `Tutorial` | **removed** from Challenge |
| Constructor of `Daily` | `(owner, account_address, token_address, lobby_class)` (`daily.cairo:159-165`) | `(owner, account_address, token_address, setup_address)` for a new deploy, `setup_address` non-zero (`'Challenge: setup is zero'`). Sepolia gets one fresh deployment (P-53), where the constructor sets it. A future in-place upgrade (D-17; mainnet later) sends `upgrade` and `set_setup` in one owner multicall, after `Setup` is deployed and allowlists `Daily`; until `set_setup` runs, a game over still ends and is recorded, with no progress reported |
| **New:** `IDailySetup.set_setup(setup: ContractAddress)`, `setup() -> ContractAddress`, event `SetupSet { setup }` | | the `Setup` a game over reports to: the owner sets it (never zero), anyone reads it |
| The quiver events in Challenge's ABI (`QuestDefined`, `QuestProgressed`, `QuestRetired`, `QuestCompleted`, `QuestClaimed`, `QuestReporterSet`, the `Achievement*` ones) | declared and emitted by `Daily` | **leave Challenge's ABI**: `Daily` keeps their storage, dead, without declaring the components; emitted by `Setup` only |
| Errors of the cold paths | `'Lobby: economy not set'`, `'Lobby: collection not set'` | `'Challenge: economy not set'`, `'Challenge: collection not set'`; `'ERC20: pay failed'` unchanged |
| `spawn`, `discard`, `surrender`, `build` | wrappers of a library call (`spawn`, `discard`, `surrender`), `build` in `Daily` | same signatures; the code runs in Challenge |
| The `Lobby` class (`Lobby.json`): `ILobby` (`spawn`, `claim`, `sponsor`, `discard`, `surrender`, `tutorial_*`, `report`, the four definitions), event `Reclaimed` | declared, never deployed, run by library call | **ends**: no Lobby class or contract until the multiplayer mode is planned (the name is reserved for it, P-51 (2)) |

### `Setup`: the ABI (as built)

| Entry point or view | Who | What |
|---|---|---|
| `constructor(owner: ContractAddress)` | deployer | |
| `report(player_id: felt252, quests: Span<TaskProgress>, achievements: Span<TaskProgress>)` | an allowlisted reporter (Challenge) | one call per game over; `TaskProgress { task_id: u32, count: u32 }` (quiver); emits one `QuestProgressed` per quest entry and one `AchievementProgressed` per achievement entry. Reverts `'Quest: not reporter'` for any other caller |
| `set_reporter(reporter: ContractAddress, allowed: bool)` | owner | emits `QuestReporterSet` and `AchievementReporterSet` |
| `claim_tutorial()` | any player | idempotent; the first call emits `AchievementProgressed { player_id: caller, task_id: 10, count: 1 }` |
| `define_quest`, `retire_quest`, `define_achievement`, `retire_achievement` | owner | as on `Daily` before, same signatures and checks; the messages are `'Setup: quest not on UTC day'`, `'Setup: task total is zero'`, `'Setup: task id repeated'` |
| `is_reporter(reporter: ContractAddress) -> bool`, `tutorial_claimed(player_id: felt252) -> bool` | anyone | views (the client shows whether First Stone was claimed) |
| `IOwnable` (`owner`, `pending_owner`, `transfer_ownership`, `accept_ownership`), `upgrade(new_class_hash)` | owner | as the other contracts (P-42) |

Events of `Setup`, with quiver 0.2.0's layouts (unchanged from those `Daily` emits today): `QuestDefined { #[key]
quest_id, schedule, tasks, conditions }`, `QuestProgressed { #[key] player_id, #[key] task_id, count }`, `QuestRetired
{ #[key] quest_id }`, `AchievementDefined { #[key] achievement_id, window, tasks, points }`, `AchievementProgressed
{ #[key] player_id, #[key] task_id, count }`, `AchievementRetired { #[key] achievement_id }`, `QuestReporterSet
{ #[key] reporter, allowed }`, `AchievementReporterSet { #[key] reporter, allowed }`, and `QuestCompleted { #[key]
player_id, #[key] quest_id, interval_id }` and `QuestClaimed` (the same layout), which `Setup.json` declares and Paved's
quests (event mode) never emit: declared, not emitted (`indexer.md`, "Not indexed in v1" and its `IGNORED` list;
`leaderboard.md:859`); plus `Upgraded` and the ownership
events. The indexer follows them from `Setup`'s deployment block; the ones `Daily` and `Tutorial` emitted before stay
history (not migrated, P-51 (5)).

## Breaking change D-25 (E)

D-25, P-52 and P-53 (`docs/programme/DECISIONS.md`), step E: `Account` leaves the systems, a player's identity is
the wallet address, and `Setup` holds the wiring (P-53 ruling 2: the single registry, read through one view per call).
**Built by step E**; the tables are the ABI diff as built (`contracts/abis/`). A stated exception to the stability
promise. Sepolia gets one fresh deployment (P-53, step F), so no deployed contract is upgraded across this change.

### `Account` (`Account.json`): removed

| Item | Before (main, aff59e06) | After |
|---|---|---|
| `IAccount.create(name: felt252, master: ContractAddress)`, `player(id: felt252) -> Player { id, name, master }` | registration and its view | **removed**: no registration; a player is any address (`get_caller_address()` as a felt, which it already was) |
| `IAccount.set_economy`, `economy()`, `set_collection`, `collection()`, events `EconomySet { economy }`, `CollectionSet { collection }` | the wiring, owner, once, non-zero | **moved to `Setup`** (below), same events, same names and fields |
| `IOwnable`, `upgrade`, the constructor `(owner)` | | removed with the contract |
| `Account.json` | in `contracts/abis/`, written by `scripts/abis.sh` | **removed** (history: `git show aff59e06:contracts/abis/Account.json`). The mock `MockAccount` (`contracts/src/mocks/account.cairo`) serves one test and has no ABI file: no tool needs one |

### `Daily` (`Daily.json`)

| Item | Before (main) | After |
|---|---|---|
| Constructor | `(owner, account_address, token_address, setup_address)` | **`(owner, token_address, setup_address)`**: `account_address` and `'Daily: account is zero'` are gone |
| `spawn(stake, referrer, min_out)` | the caller had to be registered in `Account` (`'Player: Does not exist'`); the referrer counted if registered and not the payer | same signature. **Any account may play.** The referrer counts if it is **a non-zero address other than the payer, `Economy`, `Challenge`, the Vault and the router** (any of those, or zero: no referral, the spawn goes on; the last two are checked by `Economy.purchase` since P-58, and the router is read at each purchase, so `set_router` moves it). The wiring is read from `Setup` in one call |
| `spawn` with no wiring | `'Daily: economy not set'`, `'Daily: collection not set'` (read from `Account`) | the same two errors, read from `Setup.wiring()`. A zero `setup` slot (an in-place upgrade before `set_setup`) reverts `'Challenge: setup is zero'` and leaves no game |
| A game over (`build`, `discard`, `surrender` that ends the game) | reported to `Setup` if `setup` is set, then `Economy.record` (economy read from `Account`) | reported to `Setup`, then `Economy.record` with the economy read from `Setup.wiring()` (a game over checks only the economy; a spawn checks both). With a zero `setup` slot the move **reverts** (`'Challenge: setup is zero'`): the economy is out of reach, so the game stays live until the owner sets the `Setup` (step D ended it unreported) |
| Event `PlayerCreated { #[key] player_id, name, master }` | in `Daily.json` (the shared `paved::events::Event`), emitted by `Account` only | **emitted by nothing deployed**: a past event (below). It stays declared in `Daily.json`, as it always was (never emitted by a game contract), because the indexer's tests read it from there; it leaves the ABI with META's indexer change |
| `GameSpawned`, `Built`, `Discarded`, `Scored`, `GameOver`, `SetupSet` | | unchanged; `player_id` is the address felt, as before |

### `Setup` (`Setup.json`): the wiring

| Entry point or view | Who | What |
|---|---|---|
| `set_economy(economy: ContractAddress)` | owner | once, non-zero: `'Setup: economy already set'`, `'Setup: economy is zero'`; emits `EconomySet { economy }` |
| `set_collection(collection: ContractAddress)` | owner | once, non-zero: `'Setup: collection already set'`, `'Setup: collection is zero'`; emits `CollectionSet { collection }` |
| `wiring() -> Wiring { economy: ContractAddress, collection: ContractAddress }` | anyone | both addresses in one call, each zero until set; `Daily` reads it at spawn and at game over |

`EconomySet` and `CollectionSet` keep `Account`'s names and fields, so their selectors and layouts are those an indexer
already decodes; only the emitter changes (`Setup`'s address). Everything else of `Setup` is as in "Breaking change
D-24".

### Past events: `PlayerCreated`

Emitted by `Account.create` before step E, from `Account`'s address only, and by nothing deployed after it. An indexer
replaying history keeps knowing it and skips it, as for the D-20 prize events.

| Event | `keys` | `data` | Emitted by (main, before E) |
|---|---|---|---|
| `PlayerCreated` | `[selector("PlayerCreated"), player_id: felt252]` | `[name: felt252, master: felt252]` | `Account.create` (`components/manageable.cairo`) |

On Sepolia it was emitted by the deployed `Account` of 06c024d; the fresh deployment (step F) has no `Account`, so an
indexer of the new deployment meets none. Names come from the Controller (the Cartridge username), off chain.

## Breaking change P-56 (V1b): vPAVED, the margin as PAVED, the split

P-56 (`docs/architecture/vault-share.md`, addendum; `economy.md` section 4, "As built: V1b"). Sepolia starts from zero
(D-27), so no client or indexer meets the old layouts and the new ones in one history.

### `Vault` (`Vault.json`): vPAVED

The Vault is now an ERC4626 share over PAVED, "Vault PAVED" / `vPAVED`, 18 decimals. Its constructor is
`(owner, paved, exit_fee)` (`vault.cairo:182-184`; the ABI names the argument `exit_fee`, in basis points), and the deploy passes 500.

| Entry point or view | Who | What |
|---|---|---|
| `deposit(assets, receiver) -> shares` | anyone (approve PAVED first) | mints `assets x (S + 1) / (A + 1)` shares, rounded down; `'Vault: zero shares'` when that is 0 |
| `mint(shares, receiver) -> assets` | anyone | pulls `shares x (A + 1) / (S + 1)` PAVED, rounded up |
| `withdraw(assets, receiver, owner) -> shares` | the owner of the shares, or an approved spender | sends exactly `assets`; burns the shares of `assets` plus the exit fee (`assets x fee`), rounded up |
| `redeem(shares, receiver, owner) -> assets` | the same | burns exactly `shares`; sends their PAVED less the fee (`v x fee / (1 + fee)`), rounded down |
| `asset`, `total_assets`, `convert_to_shares`, `convert_to_assets`, `max_deposit`, `max_mint`, `max_withdraw`, `max_redeem`, `preview_*` | anyone | OpenZeppelin's ERC4626 views; the previews include the fee, `max_withdraw` is `preview_redeem(balance)` |
| `name`, `symbol`, `decimals`, `total_supply`, `balance_of`, `allowance`, `transfer`, `transfer_from`, `approve`, `totalSupply`, `balanceOf`, `transferFrom` | anyone | the share, a plain ERC20 |
| `get_votes`, `get_past_votes`, `get_past_total_supply`, `delegates`, `delegate`, `delegate_by_sig`, `clock`, `CLOCK_MODE`, `nonces` | anyone | votes on vPAVED: units count once delegated (the client's "delegate to myself"); a timestamp clock; `delegate_by_sig` signs the SNIP-12 `Delegation` against `'vPAVED'`, version `'1'` |
| `exit_fee() -> u16` | anyone | bps of the PAVED that leaves (500 at launch) |
| `set_exit_fee(fee: u16)` | owner | 0 to 1,000: `'Vault: fee too high'`; emits `ExitFeeSet { previous, fee }` |
| `owner`, `pending_owner`, `transfer_ownership`, `accept_ownership`, `upgrade(class_hash)` | owner | the two-step owner of every owned contract; `upgrade` is OpenZeppelin's |

**Gone**: `stake`, `unstake`, `claim`, `pending`, `staked`, `total_staked`, `acc`, `accounted` and `tokens`, with the
events `Staked`, `Unstaked`, `Claimed` and `Distributed`. They map as follows:

| Former | Now |
|---|---|
| `stake(amount)` | `deposit(amount, caller)` |
| `unstake(amount)` | `redeem` (shares) or `withdraw` (PAVED) |
| `staked(account)` | `balance_of(account)` in vPAVED, worth `convert_to_assets(balance)` PAVED |
| `total_staked()` | `total_supply()`, which counts the 1,000 dead shares the Vault holds |
| `tokens()` | `asset()`. There is no USDC any more |
| `pending` and `claim` | none: the staker's income is the rate |

**Events** of the Vault's address:

- `Deposit { #[key] sender, #[key] owner, assets, shares }`;
- `Withdraw { #[key] sender, #[key] receiver, #[key] owner, assets, shares }`;
- `Transfer { #[key] from, #[key] to, value }` and `Approval { #[key] owner, #[key] spender, value }`;
- `DelegateChanged { #[key] delegator, #[key] from_delegate, #[key] to_delegate }` and
  `DelegateVotesChanged { #[key] delegate, previous_votes, new_votes }`;
- `ExitFeeSet { previous, fee }`;
- `OwnershipTransferStarted`, `OwnershipTransferred` and `Upgraded`.

The earlier note above, that the Vault's `Claimed` stays, holds for history only: no new Vault emits it.

### `Economy` (`Economy.json`)

| Item | Before | Since P-56 |
|---|---|---|
| `purchase` | the burn quote swapped, the margin and any unswapped USDC sent to the Vault in USDC | one swap of the burn quote and the Vault's part, filled whole (`'Economy: partial fill'` otherwise); the PAVED split by input, the burn's part burned, the Vault's part sent to the Vault as PAVED. `min_out` bounds the whole swap: the client takes it from `quote_swap(price - referral)`. **Since P-58**: reverts `'Economy: wrong delta'` when the router's PAVED leg is not paid out to `Economy` (checked before `min_out`; the rule of `quote_swap`), and a referrer that is the payer, the Vault, the router, `Economy` or the game is ignored (`Purchased.referrer` and `referral` read 0; the share stays in the Vault's part). No signature changes |
| `Config` | `burn_bps, sigma_bps, slope_bps, cap, target` | the same, then **`referral_bps: u16`** appended (Serde order); `configure` refuses `'Economy: referral out of bounds'` (above 1,000) and `'Economy: referral above vault'` |
| `split_bps() -> (u16, u16, u16)` | none | new view: `(burn, vault, referral)` in force, the Vault's part `10,000 - burn` |
| `Quote.min_out_hint` | 99 % of the burn quote at the guard's rate | 99 % of `price - referral` (a referred purchase's whole swap) at the guard's rate |
| `Quote.burn_quote`, `referral`, `margin` | from the constants | from the configuration (7,368 bps and 500 bps at launch); `margin` is the Vault's part without a referrer |
| Event `Purchased` | 17 data felts | **19**: `vault_paved: u256` appended (the PAVED sent to the Vault). `margin` keeps its meaning: the USDC of the Vault's part that went into the swap |
| Event `EconomyConfigured` | `burn_bps, sigma_bps, slope_bps, cap, target` | `referral_bps` appended |

The indexer decodes `Purchased` strictly (17 data felts) and `EconomyConfigured`: both move with this change (INDEXER
follows on this branch).

## The events of `Challenge`, current

What `Challenge` emits today, from `contracts/abis/Challenge.json` and the code (main at 0298cc7c, whose contracts are those
of a28f1e8d). The history sections above stack the changes in the order they were made; this is the list as it stands. Keys
are listed in order after the selector (`sn_keccak` of the event's name); a field not named a key is data, in the order
written. `native-storage.md`'s event table is history and is not this list.

| Event | Keys | Data | Emitted by | Source |
|---|---|---|---|---|
| `GameSpawned` | `game_id`, `player_id` | `mode`, `day_id`, `start_time`, `price` (the unit price, a felt) | `spawn` | `events.cairo:22-32`; `components/hostable.cairo:101-113` |
| `Built` | `game_id` | `player_id`, `tile_id`, `plan`, `orientation`, `x`, `y` | `build` | `events.cairo:34-44` |
| `Discarded` | `game_id` | `player_id`, `tile_id`, `plan`, `points` | `discard` | `events.cairo:46-54` |
| `Scored` | `game_id` | `player_id`, `category`, `size`, `points` | a move that closes a structure | `events.cairo:56-64` |
| `GameOver` | `game_id`, `player_id`, `day_id` | `mode`, `score`, `start_time`, `end_time` | the move that ends a game (`build`, `discard`, `surrender`) | `events.cairo:66-78` |
| `SetupSet` | none | `setup` | `set_setup` (not the constructor) | `systems/challenge.cairo:35-38` |
| `GuardianSet` | none | `guardian` | `set_guardian`, every call | `challenge.cairo:59-62` |
| `SpawnPaused` | none | `by` | `pause_spawn`, when it pauses | `challenge.cairo:64-68` |
| `SpawnUnpaused` | none | none | `unpause_spawn`, when it unpauses | `challenge.cairo:70-72` |
| `OwnershipTransferStarted` | none | `previous_owner`, `new_owner` | `transfer_ownership` | `components/ownable.cairo:42-46` |
| `OwnershipTransferred` | none | `previous_owner`, `new_owner` | `accept_ownership`, and the constructor | `components/ownable.cairo:48-52` |
| `Upgraded` | none | `class_hash` | `upgrade` | OpenZeppelin's `UpgradeableComponent` (`Challenge.json`) |

The first five are the `paved::events::Event` enum (`events.cairo:14-20`), flattened into the ABI of `Challenge`. `Built` carries no `role` and no `spot`
since D-18, and `GameSpawned` and `GameOver` carry `day_id`, not `tournament_id`, since D-20. `PlayerCreated`,
`Sponsored`, `Claimed`, `Reclaimed` and `LobbyClassSet` are past events: no deployed `Challenge` emits them.

## What the constructors emit at deployment

A deployment writes events before any owner act. An indexer must not read them as owner acts.

| Contract | Events of the constructor, in order | Source |
|---|---|---|
| `Challenge` | `OwnershipTransferred { previous_owner: 0, new_owner: owner }`. No `SetupSet`: the constructor writes the `setup` slot without an event | `systems/challenge.cairo:215-217`; `ownable.cairo:100-105` |
| `Setup` | `OwnershipTransferred { previous_owner: 0, new_owner: owner }` | `systems/setup.cairo:226-228` |
| `Collection` | `OwnershipTransferred { previous_owner: 0, new_owner: owner }` | `systems/collection.cairo:292-295` |
| `Economy` | `OwnershipTransferred { previous_owner: 0, new_owner: owner }`, then `PoolSet { pool_key, sqrt_ratio_limit }`, then `EconomyConfigured { burn_bps, sigma_bps, slope_bps, cap, target, referral_bps }` | `systems/economy.cairo:618`, `:623-624` |
| `Vault` | `OwnershipTransferred { previous_owner: 0, new_owner: owner }`, then `ExitFeeSet { previous: 0, fee }`, with `fee` 500 at launch (the deploy passes it as the third constructor argument) | `systems/vault.cairo:190-191`, `:281-287`; `scripts/deploy.sh`, `EXIT_FEE` |
| `PavedToken` | `Transfer { from: 0, to: recipient, value: 1,000,000 PAVED }` (the initial supply). No ownership: it has no owner | `systems/token.cairo:108-109` |
| `Faucet` | `Transfer { from: 0, to: <the deploying account>, value: 10,000 USDC }`, only when the transaction has an account (the premint) | `systems/faucet.cairo:107-110` |

The U-1 bullet above ("`OwnershipTransferred`, emitted once by each constructor") is true of every owned contract, not
only `Economy` and `Collection`. `ExitFeeSet` is the one owner-setter event that is also written at deployment, with
`previous` 0: it is not a change of the fee.

## Current surface: `Economy`, `PavedToken`, `Faucet`

The P-56 sections above give `Economy` as a diff. This is the surface as it stands (`contracts/abis/Economy.json`,
`PavedToken.json`, `Faucet.json`; `systems/economy.cairo`, `token.cairo`, `faucet.cairo`).

### `Economy`

Constructor `(owner, paved, usdc, vault, router, pool_key: PoolKey, sqrt_ratio_limit: u256, config: Config, mean: u64,
rate: u256)` (`economy.cairo:598-628`). It reverts `'Economy: zero address'` for a zero `owner`, `paved`, `usdc`,
`vault` or `router`, `'Economy: zero rate'` for a zero `rate`, `'Economy: rate overflow'` for a `rate` above `u128`, and
the errors of `configure` and `set_pool` for a `config` or `pool_key` they refuse. `PoolKey` is `{ token0, token1, fee:
u128, tick_spacing: u128, extension }` (`economy/ekubo.cairo:25-31`).

Entry points, with their callers:

| Entry point | Who | What | Reverts |
|---|---|---|---|
| `purchase(game_id: u32, player: ContractAddress, day: u64, stake: u8, price: u256, referrer: ContractAddress, min_out: u256) -> u128` | the game (`set_game`), that is `Challenge` | `Challenge` has already moved the price to `Economy`. Pays the referrer, swaps the rest in one whole fill, burns the burn's PAVED, sends the Vault's PAVED to the Vault, freezes the game's terms. Returns `R`. Emits `Purchased` | `'Economy: not the game'`, `'Economy: wrong stake'` (not 1 to 10), `'Economy: wrong price'` (not `stake x 2,000,000`), `'Economy: wrong day'` (not `block_timestamp / 86400`), `'Economy: zero address'` (zero `player`), `'Economy: already purchased'`, `'Economy: price not paid'`, and from the swap `'Economy: transfer failed'`, `'Economy: amount too large'`, `'Economy: partial fill'`, `'Economy: wrong delta'`, `'Economy: swap below min_out'`, `'Economy: rate overflow'` |
| `record(game_id: u32, score: u32)` | the game | records a purchased game's score, once; before the game's expiry it enters the mean of its purchase day. Emits `Recorded` | `'Economy: not the game'`, `'Economy: unknown game'`, `'Economy: already recorded'` |
| `settle(game_ids: Span<u32>) -> u256` | anyone | pays every recorded game of the list from `(day + 2) x 86400` (`day` the game's purchase day), minting PAVED to its player; a game already settled is skipped. Closes the day on its first settlement. Returns the PAVED minted. Emits `DayClosed` (the first time for a day) and `Settled` | `'Economy: unknown game'`, `'Economy: not recorded'`, `'Economy: day cannot close yet'` |
| `configure(config: Config)` | owner | sets the curve and the split for later purchases, within the bounds of `upgrade-owner.md`, section 1. Emits `EconomyConfigured` | `'Economy: burn out of bounds'`, `'Economy: sigma out of bounds'`, `'Economy: slope out of bounds'`, `'Economy: cap out of bounds'`, `'Economy: target out of bounds'`, `'Economy: referral out of bounds'`, `'Economy: referral above vault'` |
| `set_pool(pool_key: PoolKey, sqrt_ratio_limit: u256)` | owner | sets the PAVED/USDC pool and the swap's price bound. Emits `PoolSet` | `'Economy: wrong pool'` (tokens other than PAVED and USDC, in Ekubo's order) |
| `set_game(game: ContractAddress)` | owner, once | sets the game allowed to `purchase` and `record`. Emits `GameSet` | `'Economy: game already set'`, `'Economy: zero address'` |
| `set_router(router: ContractAddress)` | owner | repoints every swap and quote. Emits `RouterSet` | `'Economy: zero address'` |
| `upgrade(new_class_hash)` | owner | OpenZeppelin's; emits `Upgraded` | |
| `owner`, `pending_owner`, `transfer_ownership`, `accept_ownership` | as the other owned contracts | `OwnableComponent` | `'Ownable: caller is not owner'` (every owner entry point above, for any other caller), `'Ownable: caller not pending'`, `'Ownable: new owner is zero'` |

The 20 constants of the `errors` module (`economy.cairo:277-298`) are all in the table. The seven errors of `configure`
are string literals in `validate` (`economy.cairo:100-121`); a `time` that does not fit in 40 bits reverts `'Economy: time
overflow'`, a literal in `TermsStorePacking::pack`.

Views:

| View | Returns | Notes |
|---|---|---|
| `quote(stake: u8) -> Quote` | `Quote { price: u256, burn_quote: u256, referral: u256, margin: u256, min_out_hint: u256, factor: u32, mean: u64, threshold: u64, slope: u32, cap: u8 }` | `'Economy: wrong stake'` outside 1 to 10; `referral` is what a referrer would get; `min_out_hint` is an estimate, never to be sent as `min_out` |
| `quote_swap(usdc_in: u256) -> u256` | the PAVED the purchase's swap pays now, fee included | `'Economy: amount too large'`, `'Economy: partial fill'`, `'Economy: wrong delta'` |
| `day(day: u64) -> DayView` | `DayView { prior: u64, sum: u128, weight: u32, mean: u64, closed: bool }` | `sum`, `weight` and `mean` read 0 until the day closes |
| `terms(game_id: u32) -> TermsView` | `TermsView { player, time: u64, day: u64, stake: u8, reference: u128, sigma_bps: i16, slope_bps: u32, cap: u8, score: u32, recorded: bool, expired: bool, settled: bool, reward: u128 }` | zero for a game never purchased |
| `config() -> Config` | `Config { burn_bps: u16, sigma_bps: i16, slope_bps: u32, cap: u8, target: u128, referral_bps: u16 }` | |
| `split_bps() -> (u16, u16, u16)` | `(burn, vault, referral)` in force | the Vault's part is `10,000 - burn`; the referral comes out of it |
| `ema() -> (Ema, u64)` | `Ema { sum: u128, weight: u32 }` and its mean | points x 1,000 |
| `rate() -> u256` | the price guard's swap rate | PAVED base units per USDC base unit, x 1e18 |
| `pool() -> (PoolKey, u256)` | the pool key and the swap's price bound | |
| `router() -> ContractAddress` | the router in force | the client reads it before every send (`packages/chain/src/economy/views.ts:159`) |
| `addresses() -> Addresses` | `Addresses { paved, usdc, vault, router, game }` | `game` is zero until `set_game` |

Events (`economy.cairo:495-590`; keys after the selector, then data in order, `u256` as two felts, low then high):

| Event | Keys | Data |
|---|---|---|
| `Purchased` | `game_id`, `player_id` | `day`, `stake`, `price`, `referrer`, `referral`, `burned_quote`, `burned`, `margin`, `supply`, `factor`, `reference`, `vault_paved` (19 felts) |
| `Recorded` | `game_id` | `score`, `expired` |
| `DayClosed` | `day` | `mean`, `weight`, `prior`, `ema_after` |
| `Settled` | `game_id`, `player_id` | `day`, `score`, `threshold`, `reward` |
| `EconomyConfigured` | none | `burn_bps`, `sigma_bps`, `slope_bps`, `cap`, `target`, `referral_bps` |
| `PoolSet` | none | `pool_key` (`token0`, `token1`, `fee`, `tick_spacing`, `extension`), `sqrt_ratio_limit` |
| `GameSet` | none | `game` |
| `RouterSet` | none | `previous`, `router` |
| `OwnershipTransferStarted`, `OwnershipTransferred` | none | `previous_owner`, `new_owner` |
| `Upgraded` | none | `class_hash` |

`EconomyConfigured` and `PoolSet` are also written by the constructor (above). `Economy` holds no PAVED between
transactions; USDC that the router returns from `clear`, or that anyone sends to `Economy`, waits there and joins the
margin of the next purchase (`economy.cairo:12-13`, `purchase`).

### `PavedToken`

An OpenZeppelin ERC20 ("Paved Token", `PAVED`, 18 decimals) with a one-time minter. Constructor `(recipient, admin)`:
mints 1,000,000 PAVED to `recipient`; reverts `'PavedToken: zero recipient'` or, for a zero `admin`, `'PavedToken: not
admin'` (`token.cairo:102-111`).

| Entry point or view | Who | What | Reverts |
|---|---|---|---|
| `set_minter(minter: ContractAddress)` | the admin, once | sets the only minter and clears the admin. Emits `MinterSet` | `'PavedToken: not admin'` (any other caller, and every caller once the admin is cleared), `'PavedToken: zero minter'` |
| `mint(recipient: ContractAddress, amount: u256)` | the minter (`Economy`) | mints | `'PavedToken: not minter'` (also while the minter is zero) |
| `burn(amount: u256)` | anyone | burns `amount` of the caller's own balance | OpenZeppelin's balance error |
| `minter() -> ContractAddress` | anyone | zero until set | |
| `admin() -> ContractAddress` | anyone | zero once the minter is set | |
| `name`, `symbol`, `decimals`, `total_supply`, `balance_of`, `allowance`, `transfer`, `transfer_from`, `approve`, and the camel-case `totalSupply`, `balanceOf`, `transferFrom` | anyone | OpenZeppelin's ERC20 mixin | |

Events: `MinterSet { #[key] minter }`, and OpenZeppelin's `Transfer { #[key] from, #[key] to, value }` and `Approval {
#[key] owner, #[key] spender, value }`. There is no owner, no upgrade and no other setter (`token.cairo:3-7`).

### `Faucet`

A stand-in for USDC on devnet and Sepolia, never on mainnet: an OpenZeppelin ERC20 ("USD Coin (mock)", `USDC`, 6
decimals) with a bounded `mint`. The constructor takes no argument, reverts `'Faucet: not on mainnet'` on `SN_MAIN`,
and premints 10,000 USDC (`PREMINT`) to the account that sends the deploy transaction, outside the caps below and not
counted in `minted` (`faucet.cairo:100-111`).

| Entry point or view | Who | What | Reverts |
|---|---|---|---|
| `mint(recipient: ContractAddress, amount: u256)` | anyone | mints `amount` to `recipient`, at most 10,000 USDC (`10_000_000_000`) per call and 20,000 USDC (`20_000_000_000`) per recipient over all calls | `'Faucet: over the call cap'`, `'Faucet: over the address cap'` |
| `minted(account: ContractAddress) -> u256` | anyone | what `account` has received from `mint` so far (the premint excluded) | |
| the ERC20 mixin | anyone | as `PavedToken`'s, with 6 decimals | |

The only events are OpenZeppelin's `Transfer` and `Approval`; the faucet has none of its own
(`faucet.cairo:91-96`). The client matches the two cap strings (`packages/chain/src/writer.ts:55-56`; it calls `Faucet.mint` at `:188-193`).

## One constant sets the price of a stake unit

The price of one stake unit has one definition: `CHALLENGE_PRICE`, 2,000,000 (`constants.cairo:13`, a `u128`). Two readers
use it:

- `Mode::price` (`types/mode.cairo:30-35`) returns it as a `felt252`. It is what `Challenge.spawn` pulls from the player
  (`stake x unit`, `challenge.cairo` `purchase`), what `entry_price()` returns (`views.cairo:212-214`) and what
  `GameSpawned.price` carries.
- `economy::BASE_PRICE` (`economy.cairo:40`, a `u256`) is built from it, `u256 { low: constants::CHALLENGE_PRICE, high: 0 }`,
  and is what `Economy.purchase` checks: it reverts `'Economy: wrong price'` unless `price == stake x BASE_PRICE`.

`BASE_PRICE` is not a second literal, so `Challenge` and `Economy` cannot disagree: the single definition is enforced by the
compiler (there is no other definition of the price in the Cairo code; `scripts/deploy.sh`'s smoke still writes the literal `2000000` when it mints and approves for a stake-1 spawn, outside the contracts), and `test_economy_entry_price_is_the_stake_unit`
(`tests/e2e/economy.cairo:54-58`) pins that the two readers give the same amount. The value, the rules and the storage did not
change (it was two equal literals before; the old note is #414's audit). `CHALLENGE_PRICE` changed type, `felt252` to `u128`;
no ABI shows it.

## `Collection.set_minters` emits `MintersSet`

`set_minters(challenge, tutorial)` writes the two minter slots and emits `MintersSet { challenge, tutorial }` on every
successful call (`collection.cairo`; the call is one-shot, so once per deployment), in the style of `Setup.set_economy` and
`Setup.set_collection` (`EconomySet`, `CollectionSet`). A refused call (not the owner, a second call, a zero `challenge`, equal
minters) reverts and emits nothing.

| | |
|---|---|
| Event | `paved::systems::collection::Collection::MintersSet` |
| Selector (`keys[0]`) | `0x02632a922cf815e41989d3cf4de3982c06135cb9800aae1009c741731db43102` (`sn_keccak("MintersSet")`) |
| Keys | the selector only (no `#[key]` field) |
| Data | `[challenge, tutorial]`, two `ContractAddress`; `tutorial` is zero on a network with no Tutorial (D-21) |

`Collection`'s events are now `Transfer { #[key] from, #[key] to, #[key] token_id }` (at mint only), `MintersSet`, the two
ownership events and `Upgraded` (`Collection.json`). A consumer that halts on an unknown selector must know `MintersSet`.

## Gems v1, part 1: `Setup` and `Challenge`

Built in this branch from `docs/architecture/gems-v1.md` (P-61), part 1: the ledger, the gem claims, the free-game credits and
the free spawn. Packs (part 2) and skins (part 3) come in their own pull requests. Gems and credits are a balance per account in
`Setup`, with no transfer: no entry point moves them between accounts or acts for another address.

### `Setup` (`paved::systems::setup::ISetupGems`, impl `SetupGemsImpl`)

| Entry point | Who | What | Errors |
|---|---|---|---|
| `set_quest_gems(quest_id: u32, gems: u8)` | owner | sets the gems of a defined, live quest, 5 to 15 (0 removes them); copies its schedule and task; the quest joins its kind's list (at most 15) | `'Setup: invalid id'` (not 1 to 63), `'Setup: invalid gems'`, `'Quest: does not exist'`, `'Setup: retired'`, `'Setup: not one task'`, `'Setup: task not counted'` (not task 1 to 4), `'Setup: invalid schedule'` (neither daily nor weekly, or an end), `'Setup: list full'` |
| `set_achievement_gems(achievement_id: u32, gems: u8)` | owner | the same for an achievement, 10 to 90 (0 removes them) | `'Setup: invalid id'`, `'Setup: invalid gems'`, `'Achievement: does not exist'`, `'Setup: retired'`, `'Setup: not one task'`, `'Setup: task not counted'` (not task 1, 4, 5, 6, 7 or 10: On the Podium, task 8, has none), `'Setup: total too high'` (above 65,535), `'Setup: achievement windowed'` |
| `claim_quest(quest_id: u32, period: u64)` | the player, for itself | credits the quest's gems once for `period`, its day number (daily) or week number (weekly), when the period's sum of its task reaches its total | `'Setup: no gems'`, `'Setup: not live'`, `'Setup: not completed'`, `'Setup: claimed'` |
| `claim_achievement(achievement_id: u32)` | the player, for itself | credits the achievement's gems once, when its lifetime count reaches its total (First Stone: `claim_tutorial` done) | `'Setup: no gems'`, `'Setup: not completed'`, `'Setup: claimed'` |
| `claim_daily_credit(day: u64)` | the player, for itself | one free-game credit, once per day, when every daily quest with gems live that day is completed | `'Setup: credit claimed'`, `'Setup: not completed'`, `'Setup: no live quest'` |
| `claim_weekly_credit(week: u64)` | the player, for itself | the same for the weekly quests and the week | the same |
| `spend_credit(player_id: felt252, game_id: u32)` | an allowlisted reporter (`Challenge`) | one credit less, for the free game `game_id` | `'Quest: not reporter'`, `'Setup: no credit'` |

Views (anyone):

| View | Returns |
|---|---|
| `account(player_id) -> Account` | `gems: u64`, `credits: u16`, the lifetime counts `games`, `forests`, `wonders`, `big`, `high` (`u16`, saturating), `achievements_claimed: u64` (bit `i`: achievement `i` claimed) |
| `day_progress(player_id, day) -> Progress` | the sums of the paid game overs that ended in that day: `games`, `structures`, `forests` (`u16`), `points` (`u32`), saturating; `claimed: u64` (bit `i`: quest `i` claimed for the day), `credit: bool` |
| `week_progress(player_id, week) -> Progress` | the same for the week |
| `quest_gems(quest_id) -> QuestGems` | `gems`, `kind` (1 daily, 2 weekly), `task`, `total`, `start`, `interval`; all 0 for a quest with no gems |
| `achievement_gems(achievement_id) -> AchievementGems` | `gems`, `task`, `total` |

**The calendar.** A day is `t / 86,400` (Paved's day id). A week runs Monday to Sunday UTC: week `w` starts at
`345,600 + w x 604,800`, week 0 on Monday 1970-01-05. `t` is the block time of the game over: a game counts for the day and the
week it ends in. Past periods stay claimable with no deadline.

**`report`** (same ABI) now also writes the ledger: the quest entries to the day and the week, the achievement entries to the
account. A free game's report has no quest entries. **`retire_quest`** and **`retire_achievement`** (same ABI) also clear the
gems, emitting `QuestGemsSet` or `AchievementGemsSet` with `gems: 0`.

Events of `Setup` (flat variants: the selector is the name):

| Event | Keys | Data |
|---|---|---|
| `QuestGemsSet` | `quest_id: u32` | `gems: u8`, `kind: u8` (1 daily, 2 weekly) |
| `AchievementGemsSet` | `achievement_id: u32` | `gems: u8` |
| `GemsClaimed` | `player_id: felt252` | `kind: u8` (1 quest, 2 achievement), `id: u32`, `period: u64` (0 for an achievement), `gems: u8`, `balance: u64` |
| `CreditClaimed` | `player_id: felt252` | `kind: u8` (1 daily, 2 weekly), `period: u64`, `credits: u16` |
| `CreditSpent` | `player_id: felt252` | `game_id: u32`, `credits: u16` |

`balance` and `credits` are the player's after the event, so the indexer can check its sums against the chain.

### `Challenge.spawn_free() -> u32`

The caller's free game, on one of its credits: no USDC, no stake, no `Economy` call. It reverts `'Challenge: spawn paused'`
while `spawn` is paused, `'Challenge: collection not set'` without a collection, and `'Setup: no credit'` without a credit;
a reverted call leaves no game and no token. The game is minted to the caller as a paid one is.

**The free mark is `GameSpawned.price == 0`.** A paid game's price is never 0 (stake 1 to 10).

**A free game's end.** It ends like any game, on its last `build`, its last `discard`, or a `surrender` (the only move an
expired game takes, 24 h after its start), and each emits **`GameOver`** with the fields of a paid game's (`game_id`,
`player_id`, `day_id`, `mode`, `score`, `start_time`, `end_time`; `day_id` and `end_time` 0 when it ends after its day). Then
`Setup` gets its achievement entries only (`AchievementProgressed`, no `QuestProgressed`), and `Economy` is not called: a free
game has no `Purchased`, `Recorded` or `Settled`, and `Economy.settle` refuses it (`'Economy: unknown game'`). So a free game's
final score and end come from `GameOver`, and the daily leaderboard, which ranks it like any Challenge game (P-61), must rank
from `GameOver` (or join it) for free games. `Recorded.expired` has no free-game counterpart: an expired free game ends by a
surrender, whose `GameOver` has `day_id` 0, and pays nothing, as every free game (no PAVED, no burn). Tested in
`contracts/src/tests/e2e/gems.cairo` (`test_gems_free_game_over_*`, one per way it ends).
