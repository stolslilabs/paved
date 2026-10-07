# Structure state (phase P5)

Design of the persistent structure state that replaces the recursive walks of
`helpers/generic.cairo`, `conflict.cairo`, `wonder.cairo`, `forest.cairo` (and `simple.cairo`, which
the forest walk calls), with the `Game` split and the packing that go with it. The PRs that build it
are in [`docs/briefs/p5-plan.md`](../briefs/p5-plan.md). Status: roads, cities, wonders and the conflict check built in P5-4, forests in P5-5 (section "As
built" at the end says where the code differs from this design).

Every gas figure in this document is an **estimate** unless it is quoted from
`docs/measures/baseline.md` (P4 figures, scarb 2.20.1 / snforge 0.64.0). No measurement was run for
this design.

## What must not change

- **Scores.** The eight golden games of `docs/measures/golden-games.md` keep every expected value and
  are never edited. The only rule change of P5 is P-15 (below), shown by a new golden case.
- **Published views and events** (`docs/architecture/public-interface.md`, events of
  `native-storage.md`): same names, arguments, fields and meanings. `Scored` events keep their order
  inside a build.
- **Revert messages** that tests assert (`Builder: Does not exist`, `Game: structure not idle`, ...).
- **View invariants** found by the review of the views:
  - the player of every game is answerable (`GameView.player_id`, `View: not the game player`);
  - `tile_count >= 2` after spawn (the starter tile and the first drawn tile);
  - after a surrender, `builder.tile_id` stays on the tile in hand (`status` 3 in `tiles`); after a
    last-tile end it is 0;
  - `built` and `discarded` keep counting (`placed_count = built + 1`, `discarded_count = discarded`).

## The rules as the walks compute them today

A **node** is one area of one placed tile: `(tile_id, area)`, the `visited` key of the walks
(`tile.get_key(area)`). A tile has at most 9 areas (one per spot at most). The layout of a plan gives,
for each area, its category and its **moves**: `(direction, spot)` pairs, each one a half-edge that
leaves the area towards the neighbouring position in `direction` and lands on `spot` of the tile there.
A wonder's moves have `spot = None`: they only ask for the tile to exist.

| Walk | Computes | Equivalent on a connected component |
|---|---|---|
| `GenericCount` (road, city) | `count` = nodes reached, or 0 if any reached node has a move to an empty position; the characters met | size; closed iff no half-edge points to an empty position; the characters on it |
| `Conflict` | a character is reached | the component holds a character |
| `WonderCount` | the 8 positions around the wonder are taken, and the wonder spot holds the character | the wonder's 8 half-edges all land on tiles; its character |
| `ForestCount` | forest size; closed iff its own half-edges all land **and** every road adjacent to it is closed; distinct closed adjacent roads (Woodsman); closed adjacent cities (Herdsman, with the bug below) | the same, from the components of the adjacent roads and cities |

`Game::assess` runs, after each build, `assess_at` for each start spot of the new tile in the order of
`starts()`, then for the wonder of each of the 8 neighbours (N, E, S, W, NW, NE, SE, SW). A structure
is scored when it is closed and holds characters; scoring recovers them, so a second start spot on the
same structure finds nothing. The single player always wins a structure that holds at least one of its
characters (`GenericCount::solve`: one player, so the weight only grows).

**Assumption to prove first (PR P5-1):** the move relation is symmetric between areas: if area `a` of
tile `T` has a move into area `b` of a neighbour `U` that a legal placement accepts, then `b` has a move
back into `a`. The walks are directed; a union is not. If an exhaustive test over the 19 plans, 4
orientations and 4 sides finds an asymmetric pair, the union must follow the walk's direction for that
pair and this document is revised before P5-4.

## Data model

### Structure records

Each connected component of nodes is a **structure**, held by a union-find over records.

- A record is created for a node only when the node founds a structure: none of its half-edges with a
  spot lands on a placed tile. A node that joins an existing structure at placement gets no record.
- A structure id `sid` is the id of the founding node: `tile_id * 16 + area` (12 bits; tile ids stay
  below 128 because the deck is drawn from a `u128` bitmap and Daily has 38 tiles).
- Union by size: the root of the larger structure stays root; the other root gets `parent`.
  Depth is at most `log2(nodes)` (at most 9 for 342 nodes, 38 tiles x 9 areas). The new tile's node
  refs always point at the final root (path compression where it is free).

Record, 48 bits:

| Field | Bits | Meaning |
|---|---|---|
| `parent` | 12 | `sid` of the parent; 0 for a root |
| `size` | 10 | nodes in the structure (the `count` of the walks; a root only) |
| `open` | 10 | half-edges of its nodes that point to an empty position (a root only) |
| `chars` | 16 | role bitmap of the characters on it (bit `i` = role code `i`; roles 1..7 today, room to 15) |

The category is not stored: a structure never merges across categories, so it is the category of the
founding node, read from the plan tables.

### Where records live: record pages

Records are packed in **pages**, one page per tile, keyed `(game_id, tile_id)`: the records of the
structures founded on that tile, at the index given by the plan table (`record_index[area]`, the rank
of the area among the areas that have moves). 5 records per felt (240 bits); a tile with more than 5
such areas (`sfrfrfrfr` has 8) uses a second slot.

Why pages and not one slot per record: a new slot costs about 0.45M L2 gas in a receipt against about
0.03M for a rewritten slot (Grim World `cost-budget.md`, fitted on Sepolia receipts). A tile founds 1
to 4 structures on average (estimate), so one slot per record would add 1 to 4 new slots per build;
a page adds one (two for the 8-area tiles), and every later update of these records is a rewrite.

### Game, builder, tiles and characters

| Storage | Key | Slots | Packing (low bits first) | Written |
|---|---|---|---|---|
| `GameConfig` | `game_id` | 2 | `player_id`; `mode u8, start_time u64, tile_limit u16` | once, at spawn |
| `GameState` | `game_id` | 2 | `seed`; `tiles u128, tile_count u8, score u32, discarded u8, built u8, over 1, held_tile u8, characters u16` | every action |
| `GameEnd` | `game_id` | 1 | `end_time u64, tournament_id u64` | once, at game over in time |
| `Characters` | `game_id` | 1 | per role `1..=7` (16 bits each, role `r` at bits `16 r`): `tile_id u8, spot u4, weight u2, power u2` | on place and recover |
| `Tile` | `(game_id, tile_id)` | 1 | `plan u8, orientation u8, x u32, y u32, occupied_spot u8, refs 9 x u12` | at draw, then at build |
| `TilePosition` | `(game_id, x, y)` | 1 | `tile_id u32` | at build |
| `Structures` | `(game_id, tile_id, page)` | 1 or 2 per tile | 5 records of 48 bits | at build, then on unions and scoring |
| `Tournament` | unchanged | 5 | unchanged | |

What changes against `native-storage.md`:

- **The player is in `GameConfig`.** `Builder (game_id, player_id)` and `Tile.player_id` go: the game
  answers for its player in one read, every drawn tile saves its player slot (one new slot per draw,
  about 0.45M in receipts), and `Store::builder(game, p)` returns the builder rebuilt from `GameState`
  when `p` is the game's player and the zero builder otherwise, so `Builder: Does not exist` reverts
  exactly as today.
- **No call to `Account` on a move.** `spawn` checks the registration (`Player: Does not exist`) and
  records the caller in `GameConfig`; `build`, `discard` and `surrender` check `caller ==
  config.player_id` instead of reading the player from `Account` and the builder map. A player cannot
  be unregistered (`Account` has no such entry point), so the accepted callers are the same.
- **`Builder.characters` widens to `u16`** (roles 1..7 use bits 1 to 7 of the `u8` today: it is full).
  New roles fit without a layout change.
- **`Char` and `CharPosition` go** (3 slots per placement, 2 of them new every time) for one
  `Characters` slot per game, rewritten. `CharPosition` only served the walks (which character stands
  on a tile spot); the structure's `chars` and the role's `(tile_id, spot)` replace it. `weight` and
  `power` are kept per character (2 bits each: today's values are 0 to 2), as `Role::weight/power`
  give them at placement.
- **`Tile.refs`**: for each area 1..9 of the tile, the `sid` of the structure the node belonged to
  when the tile was placed (its own `sid` when it founded one; 0 for an area without moves). `find`
  from there gives the current root.
- **`Game` split.** The frozen fields are read once and never written after spawn; the hot slot is the
  only game slot a move rewrites besides the seed. `tile_count` narrows to `u8` in storage (decks are
  at most 128 tiles); the views keep `u32`.

### Plan tables

The layouts (`elements/layouts/*`) answer with arrays built by `match` at every call. P5 adds packed
constant tables, one per plan, generated from the layouts and checked against them by a test:

- per area: category, `record_index`, moves `(direction, spot)`, half-edges per direction (8
  counts), adjacent road areas, adjacent city areas;
- per plan: the start spots in `starts()` order, the wonder spot.

Lookups are by orientation-rotated index arithmetic, no arrays on the hot path. A new tile kind or a
new area kind (rivers) is a new row of these tables and, for a new category, a new arm of the
assessment (below): no change to the union-find, the pages or the half-edge counting.

## Update algorithm per move

Notation: `T` the new tile at `P`, `N_d` the tile at `P + d` for the 8 directions (read as today by
`Store::neighborhood`: 8 position reads, a tile read for each taken position). Records and pages are
read once into a move-local cache (`Felt252Dict`) and each dirty page is written once at the end of
the move.

1. **Close the half-edges into `P`.** For each neighbour `N_d` and each area `b` of `N_d` with `k > 0`
   half-edges pointing back to `P` (table: half-edges of `b` in direction `-d`, rotated):
   `open(find(N_d.refs[b])) -= k`. Diagonals only matter for wonders, whose `A` area has a move in
   each of the 8 directions.
2. **Place the nodes of `T`.** For each area `a` of `T` with moves, in area order:
   - `roots` = `find(N_d.refs[b])` for each move `(d, spot)` of `a` that lands on a placed tile, with
     `b = N_d.area(spot)` (deduplicated);
   - `o` = number of moves of `a` whose position is empty;
   - no root: found a record `sid(T, a)` with `size 1, open o, chars 0`;
   - otherwise: `R` = the root of largest size (lowest `sid` on a tie, deterministic); every other
     root gets `parent = R`; `R.size = 1 + sum of sizes`, `R.open = o + sum of opens`,
     `R.chars = OR of chars`;
   - `T.refs[a] = R` (or the new `sid`).
   Two areas of `T` that reach the same structure (a road that loops through `T`) are merged by the
   second one, and the size counts both nodes, as the walk does.
3. **Character.** If a role is placed on `spot` of `T`: `S = find(T.refs[area(spot)])`; revert with
   `Game: structure not idle` if `S.chars != 0` (replaces `Conflict`); otherwise
   `S.chars |= bit(role)` and the role's entry of `Characters` is written. Same check, same place in
   `build` as today.
4. **Assess**, in today's order:
   - for each start spot of `T` in `starts()` order: `S = find(T.refs[area])`, by the category of the
     area:
     - **road, city**: if `S.open == 0` and `S.chars != 0`: points `= size x base x max power x
       bonus(size)` as `GenericCount::solve`, one `Scored`, recover every character of `S.chars`
       (tile `occupied_spot` cleared, role bit cleared in `GameState.characters` and in `S.chars`);
     - **wonder**: `S.open == 0` and the character stands on the wonder spot: `base x power`, `Scored`
       with size 0, recover;
     - **forest**: see "Forests" below;
     - **stop, none**: nothing.
   - then the wonder of each of the 8 neighbours, N, E, S, W, NW, NE, SE, SW, as the road/city/wonder
     arm above.
5. **Write**: `Tile` of `T` (its refs included, a rewrite of the slot written at draw), its
   `TilePosition` (new), each dirty page (the new tile's page new, the others rewritten),
   `Characters` if it changed, `GameState`.

Spawn places the starter tile with step 2 only (no neighbour): one page, every area founds a record.
`discard` and `surrender` touch no structure.

### Forests

A forest root `F` is a structure like the others (size, own open half-edges, chars). What it cannot
keep incrementally is the set of **distinct** roads and cities adjacent to it: roads merge after the
forest saw them, so counts would double. The set is computed only when it matters:

- Gate (O(1)): `F.open == 0` and `F.chars` holds a Woodsman or a Herdsman. Otherwise nothing, as
  today (`ForestCount::solve` needs characters).
- **Scan** (only past the gate): walk the forest's nodes (from `T`, moves within the forest, a tile
  read per node; every position is taken since `F.open == 0`), and for each adjacent road or city area
  of each forest node (plan tables) collect `find(refs)` in a `Felt252Dict`:
  - any adjacent road root with `open != 0`: the forest is open, nothing scores (2024 rule);
  - Woodsman points `= distinct closed road roots x base x bonus(size) / woodsmen`;
  - Herdsman points `= distinct closed city roots x base x bonus(size) / herdsmen` (**P-15**, below);
  - one `Scored` per character (Woodsman first, then Herdsman), even with 0 points, as today.

The scan is the one place where a move's cost grows with a structure: it is bounded by the forest's
tiles (at most the deck, 38 in Daily), and it runs only on the move that closes a forest holding a
forest character. Every other move, the forests cost the same O(1) as any structure.

**P-15 (ruling of the PM, a rule correction).** The 2024 walk could count an open city touched twice by
a forest: the first `SimpleCount` from the forest stops at the city's open edge and leaves part of the
city marked visited; a second contact from another forest node walks only the unvisited rest, which can
look closed. P5 counts a city only when its root is closed (`open == 0`), and each city root once. This
changes no existing golden (their Herdsman cities are closed); a new golden case shows it
(`daily_forest_herdsman_open_city`, PR P5-5). The rest of the 2024 rules stand.

**A road closed away from its forest** never re-assesses the forest (today's walk and this design
alike): the forest's own edges are all placed, so no later tile touches it, and a Woodsman or Herdsman
on it never comes back. P-15 says the rest of the 2024 rules stand, so P5 keeps this behaviour. A fix
fits the design without new storage: when a road root closes during a move, scan its nodes' adjacent
forest areas and assess each forest root once. It is a rule change that needs a ruling of the PM
(proposed as P-16, PR P5-8, not briefed until ruled).

## Cost model per move

### What the P4 figures say

| Scenario | P4 L2 gas | Read from the deltas |
|---|---|---|
| a0, open simple move | 9,634,832 | floor plus short walks; P3 had 8,664,572 without forest walks, so forest walks cost about 0.97M here |
| a, closes a 2-tile city | 10,878,072 | a0 + 1.24M of walks |
| b, a with a Lord placed | 12,252,204 | + 1.37M: the character slots and the conflict walk |
| c, closes a 6-tile city with a character | 17,085,237 | 4 more city tiles cost about 4.8M beyond a and b: about 1.2M per tile walked (conflict, city and forest walks) |
| d, closes a 12-tile city tree with a character | 32,287,556 | 6 more tiles than c cost 15.2M: about 2.5M per tile |

So a tile visited by the walks costs about 1.2M to 2.5M per move, and the floor of a build without any
walk is about 6.5M to 7.5M (estimate: P3's a0 minus its short road walk).

### Estimate after P5

Execution (snforge delta, the figure of `contracts/tests/gas.cairo`), estimates:

| Part | Estimate | Why |
|---|---|---|
| Floor today | 6.5M to 7.5M | above |
| No `Account` call per move | -0.3M to -0.8M | one `CallContract` and the player read |
| No `Builder` map, one game slot fewer, no tile player slot | -0.2M to -0.4M | 3 to 4 slot reads and writes fewer |
| Structure update (steps 1, 2, 5) | +0.8M to 1.5M | 2 to 6 page reads and writes, finds of depth 1 to 2, table lookups; independent of structure sizes |
| Scoring a road, city or wonder | +0.4M to 0.8M | recover characters (`Characters` rewrite, tile rewrite), one event |

| Scenario | P4 measured | P5 estimate | Note |
|---|---|---|---|
| a0 | 9.63M | 6.8M to 8.3M | |
| a | 10.88M | 6.8M to 8.3M | the close is a counter reaching 0 |
| b | 12.25M | 7.2M to 8.8M | packed character, O(1) conflict |
| c | 17.09M | 7.6M to 9.3M | no longer depends on the city size |
| d | 32.29M | 7.6M to 9.6M | idem; finds may be one or two reads deeper |
| e, closes a 4-tile forest with a Woodsman (new scenario) | about 13M to 15M (estimate from the ring golden) | 9M to 12M | the forest scan, bounded by the forest |

The target "a simple move at most 10M" holds on these estimates for a0, a and b with margin, and for c
and d too; the forest scoring move is the exception, bounded by the forest size. **No move is
unbounded**: the scan is at most the deck's tiles. The figures are confirmed or corrected by the
measure of each PR (P5-2, P5-4, P5-5, P5-6), which lowers the ceilings to measured + 5 %.

Storage in receipts (not in the snforge delta; Grim World's fitted 0.45M per new slot, 0.03M per
rewritten slot):

| | New slots today (P4) | New slots after P5 |
|---|---|---|
| A build, no character | 3 (position, drawn tile 2) | 3 (position, drawn tile, page; 4 for an 8-area tile) |
| A build with a character | 6 (+ `Char` the first time, `CharPosition` 2) | 3 (the `Characters` slot is rewritten) |
| Spawn | Game 3, builder, tiles 4 | config 2, state 2, starter tile, drawn tile, starter page |

## Views and events, served unchanged

| View field | Source after P5 |
|---|---|
| `GameView.player_id`, `assert_game_player` | `GameConfig.player_id` (today: the player of the last drawn tile) |
| `mode`, `start_time`, `deck_size` | `GameConfig` |
| `seed`, `score`, `over`, `tile_count`, `placed_count = built + 1`, `discarded_count = discarded` | `GameState` |
| `tile_id`, `plan` (tile to place now) | `GameState.held_tile` while not over, 0 when over; its `Tile.plan` |
| `remaining_count` | `tile_limit - tile_count` while not over, as today |
| `end_time`, `tournament_id` | `GameEnd` (0 when absent) |
| `tiles` page, `status` | `Tile` (placed when `orientation != 0`); held = `GameState.held_tile`; discarded otherwise, as today |
| `BuilderView` | `GameState.held_tile` (kept after a surrender, 0 after a last-tile end, as today) and `characters` |
| `CharacterView` | `Characters` slot and the tile's `x, y` |
| `TournamentView`, `entry_price` | unchanged |

`held_tile` follows today's `Builder.tile_id` exactly: `surrender` does not clear it, the last build
or discard leaves it at 0 because no tile is drawn. `tile_count >= 2` after spawn holds because spawn
draws the first tile as today. Events: `Built`, `Discarded`, `GameSpawned`, `GameOver` carry the same
fields from the same values; `Scored` is emitted by the same arms in the same order (start spots, then
neighbour wonders; Woodsman before Herdsman) with the same `size` (the root's `size`, the walk's
`count`) and `points`.

## Tests

- **Oracle.** The walks move to `src/tests/oracle.cairo` (test-only), unchanged, over the same
  storage facade. A differential check runs after every move of the goldens, the gas scenarios and the
  e2e boards: for every node of the new tile, `size` and `open == 0` of its root equal the walk's
  `count` and closedness, and `chars != 0` equals `Conflict`. This is what the correctness audit reads
  first.
- **Unit tests** of the new module: page packing round trips, union by size, `find` depth, half-edge
  counts of every plan and orientation against the layouts, table equality with `elements/layouts`.
- **Goldens**: unchanged; one new case for P-15. The harness adapts to the storage facade only.
- **e2e**: they read through `Store` (`builder`, `character`, `tile`), which keeps its interface as a
  facade; tests that read `character_position` move to the facade of `Characters`.
- **Gas**: every gameplay test keeps a budget; ceilings drop to measured + 5 % in each PR that lowers
  them; scenario e (forest scoring) is added.

## Line coverage

`cairo-coverage` peaked at 7.9 GB on the whole suite and aborted under the 8 GiB cap on the VPS
(`baseline.md`). P5 measures it in **split runs merged into one lcov**: `snforge test --coverage
<filter>` per group (`paved::types::` and `paved::elements::`, `paved::helpers::` and
`paved::models::`, `paved::tests::e2e::`, `paved::tests::golden::`, the new structure module), each
capped and measured first; the per-run `coverage.lcov` files are merged by summing the hits per
`SF`/`DA` line (`lcov -a` when installed, else a short awk in `scripts/measure.sh`). If one group
still exceeds the cap it is split by test name; the Mac is used instead when it is offered again.

Gaps expected (to be confirmed by the first merged measure, not measured yet): the `Into`
conversions of every enum code in `types/`, the adjacency functions of plans no test places, the
error paths of `ownable`, `payable` and `tournament` claims, view edge cases (paging past the end,
`MAX_TOURNAMENT_ID`), `helpers/bitmap` and `random_deck` branches. Target: at least 90 % of
`contracts/src` lines, `tests/` and `mocks/` excluded.

## Extensions

A river (or any new kind of area) is: a category code, rows in the plan tables (moves, half-edges,
adjacency), and an arm in step 4 for its closing and scoring rule. Union, pages, refs and half-edge
counting do not change. Room left: `chars` and `GameState.characters` have 16 role bits (7 used), the
`Tile` slot keeps about 50 free bits, a record page holds 5 records per slot.

## As built (P5-4)

Code: `contracts/src/structure/` (`record.cairo` records, pages and refs; `state.cairo` the move-local
cache and the union-find; `placement.cairo` steps 1 to 3 and the neighbourhood; `assessment.cairo`
the road, city and wonder arms of step 4; `oriented.cairo` the hot-path tables), called from
`models/game.cairo` and the `build` of `components/{playable,tutoriable}.cairo`. Where it differs
from the design above, and why:

- **Structure id** `sid = tile_id * 16 + record_index` (the rank of the founding area among the
  areas of its plan that have moves), not `+ area`: the id then says where the record lives (page of
  `tile_id`, slot `record_index / 4`) without reading the tile's plan.
- **Pages hold 4 records per slot**, two in each 128-bit half, not 5 per felt: no record straddles
  the halves, and the slot count per plan is the same (only the three `sfrfrf*` plans have more
  than 4 areas with moves, and they have more than 5 too).
- **Refs are not a field of the `Tile` struct**: they live in the high bits of the tile's slot and
  are read with `Store::tile_with_refs`. `Store::set_tile` keeps them, and places on the structure
  state a placed tile written with none: the starter tile at spawn (`hostable.cairo` is unchanged)
  and the boards that tests write without a build (the wonder ring of `e2e/events.cairo`, which
  stays unchanged).
- **Step 1 runs inside step 2**: each move of the new tile into a neighbour closes one half-edge of
  the neighbour's landing area; the wonders around close one half-edge each. The tables test proves
  both: on every pair of tiles a placement accepts, the half-edges of an area towards the other tile
  are exactly as many as the moves of the other tile that land on it, and a wonder area has one
  spotless half-edge per direction (`test_tables_spotless_moves_are_the_wonders`). The same test
  checks that the two ends of every move have the same category and that no move with a spot
  leaves on a diagonal.
- **The idle check is read before the unions**: `Game: structure not idle` reverts when a structure
  that the area of the spot reaches through its own moves holds a character, as these structures
  were before the tile. That is what `Conflict` answered (it walked from the new tile while its
  position was still empty, so it never came back through it). Reading the root after step 2 would
  also see a structure that another area of the new tile joins in: a stricter rule, not today's.
- **Hot-path tables**: the lookups of `tables.cairo` rotate with index arithmetic and read fields
  with a computed shift, which measured 30k to 190k L2 gas per lookup (snforge 0.64, dev profile,
  `inlining-strategy = "avoid"`). `oriented.cairo` gives the same rows with the rotation of each
  orientation applied (generated from `tables.cairo`, compared with it answer by answer by
  `test_oriented_rows_equal_the_tables`), read with constant shifts.
- **Path compression** of the new tile's refs runs only when a union made a root a child; otherwise
  every ref is already a root.
- **Forests**: `ForestCount` still scores them, but runs only when the forest's root is closed and
  holds a character (`open == 0`, `chars != 0`): any other forest walk found no character to solve
  or a count of 0, so skipping it changes nothing. This is the gate of "Forests" above; the scan
  that replaces the walk is P5-5. The characters it recovers leave the forest root's `chars`.
- **After the assessment**, the builder is read back from storage only when something scored.

The differential check (`contracts/src/tests/oracle.cairo`, `check`) compares, after every build of
the goldens (checked replays `*_structures_agree`), of the gas scenarios, of the Tutorial and of the
e2e boards (`tests/differential.cairo`, `e2e/forest.cairo`, `e2e/views.cairo`), every node of the built
tile and the wonder of every neighbour with the oracle's walks: closed against `GenericCount`, size
against its count when closed, `chars != 0` against `Conflict` and the roles against those
`GenericCount` collects.

## As built (P5-5)

Code: `contracts/src/structure/forest.cairo` (`assess_forest`, called from `Game::assess`, and `scan`).
`helpers/forest.cairo` and `helpers/simple.cairo` are gone from the runtime; the walks live on in
`tests/oracle.cairo` only. Where it differs from "Forests" above, and why:

- **The scan walks the forest from the built tile's start area**, one tile read per node
  (`Store::tile_at`: the position, then the tile with its refs), moves within the forest through the
  oriented rows, a `Felt252Dict` of visited nodes. For each node it reads the adjacency bitmaps of the
  plan row (`tables::row_adjacent_roads`, `row_adjacent_cities`: the adjacency is by area, the same in
  every orientation) and takes the root of each adjacent area from the tile's refs.
- **An adjacent road whose root is open ends the scan at once**, as the walk stopped at an open
  road: the forest does not score and the characters stay.
- **The Woodsman and the Herdsman are one character each** (one tile of each role at most), so the
  division by the number of characters of a role is by 1 and left out. The `Scored` events keep their
  order: the Woodsman first, then the Herdsman, each with the forest's size, even with 0 points.
- **P-15** is a count of closed city roots: a city whose root has `open != 0` is not counted, each
  root once. The new golden `test_golden_daily_forest_herdsman_open_city` builds a forest of 2 tiles
  between two city corridors that a corner and a T-junction join into one open city (its east edge looks
  at an empty position). By hand: the city is open, so 0 x 300 x bonus(2) = **0**; the 2024 walk, run on
  the commit before the fix (`dc804707`), gave **314** (1 x 300 x 10475 / 10000, the open city counted
  once). The Herdsman is back either way.
- **The oracle follows P-15**: its forest walk explores a whole city before judging it
  (`SimpleCount::explore`), and the differential check (`oracle::check`) compares, for every closed
  forest node of a built tile, the scan with the oracle's forest walk (closed or not, size, distinct
  roads, distinct cities).
- **Two guards from the audit of #222**: `placement::place_alone` refuses a tile that holds a character
  (a tile written alone never goes through `occupy`, so its structure would not know the character;
  a plan without areas has no structure and is left alone), and `Store::set_tile` refuses to change the
  plan, the orientation or the position of a tile whose refs are stored (the records were built from
  them).
