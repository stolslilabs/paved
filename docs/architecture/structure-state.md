# Structure state (phase P5)

Design of the persistent structure state that replaces the recursive walks of
`helpers/generic.cairo`, `conflict.cairo`, `wonder.cairo`, `forest.cairo` (and `simple.cairo`, which
the forest walk calls), with the `Game` split and the packing that go with it. The PRs that build it
are in [`docs/briefs/p5-plan.md`](../briefs/p5-plan.md). Status: roads, cities, wonders and the conflict check built in P5-4, forests in P5-5 (section "As
built" at the end says where the code differs from this design).

**D-18 (2026-10-13) reverses the character rules described below** (placement, `chars`, Woodsman and
Herdsman): see "As built: D-18" at the end, which describes the code since D-18b. The sections before it
describe the design and the code up to P5-8, characters included.

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

**A road closed away from its forest** (P5-8, ruling P-16: "a road or city that closes away from a
forest re-assesses the adjacent forest(s)"). The premise is that a forest can be closed while an
adjacent road is still open, and then waits for that road. Measured in P5-8, **no board that a
placement accepts does this**: a forest's own half-edges close only when every tile around it is
placed, and a road next to a forest runs through tiles whose forest corners join that forest (an
edge of a road has a forest corner on each side, and the corner has a move back), so every open end
of such a road is also an open half-edge of the forest. A model of the 19 layouts (rotation, edge
matching, moves, adjacency; checked against the ring and caps goldens) was played at random for about
530,000 closed-forest states with the quirky plans weighted up (`RFRFCCCFR`, `RFRFFFCFR`,
`CCCCCFRFC`, `RFFFRFCFR`, stops): none had an open adjacent road. Consequences:

- no golden can show the rule (the closing move would be the move that closes the forest, which
  assesses it as a start spot), and `forest::scan`'s "open road" exit is never taken at runtime;
- an open city never keeps a forest open (P-15), so the city half of P-16 can never trigger; only
  the road half was ever in question;
- the runtime has no re-assess step: it would only cost gas. The step was written and measured
  in a commit of the P5-8 branch (`f9fa9758`, reverted in the next one) for the day a tile makes the
  situation reachable (a road that leaves the tiles of its forest, a river, a tile whose forest area
  lacks a move);
- the oracle checks the invariant on every checked game: after each build, no Woodsman or Herdsman
  stands on a forest that the walk finds finished (`oracle::check`, "Check: forest left unscored").
  A new tile that breaks the property fails there first.

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
- **"Vector capacity exceeded" in the table symmetry tests (t-0110).** The message is cairo-vm's
  `MemoryError::VecCapacityExceeded`: a memory segment of the test VM could not grow (`Vec::try_reserve`
  failed), i.e. the process ran out of address space or RAM. It is not a defect of the tables and is
  not reachable on chain; the tests are deterministic and pass whenever the memory is there. The
  exhaustive symmetry tests cost about 1B L2 gas each and are the heaviest of the crate, so under a
  full parallel run (8 VMs at once) they are the first to hit a cap. Measured on the VPS with
  `prlimit --as` and default threads (24 tests, before): abort at 8 and 9 GiB, one test failing with
  the message at 10 GiB, all green at 11 GiB. Each side is now cut in two halves by the plan of the
  first tile (40 tests, same pairs, accepted placements add up to the former counts): all green from
  9 GiB. Mitigation, if it comes back: run with `--max-threads 4`, or keep the cap above 12 GiB.

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

## As built (P5-6 and after)

Code: PR P5-6 (#224, the gas pass), PR P-17 (#225, the draw) and PR P5-8 (#226). Where it differs from
the sections above, and why:

- **Positions carry a wonder flag.** `tile_positions` stores the tile id in 8 bits and
  `POSITION_WONDER` (`0x100`, bit 8) when the tile is a wonder plan (`plan >= FIRST_WONDER_PLAN`, 18,
  the last two plan codes), written by `Store::set_placed_tile`. `Store::wonder_at` reads the diagonal
  neighbours: a position without the flag answers "taken" and nothing else, and its tile is not read.
  A diagonal tile that is not a wonder is therefore never read by a move (it matters to a move only if
  it can score a wonder). The tile id is `value % POSITION_WONDER` everywhere else.
- **The `Characters` word is read once and written once per move.** `Structures` (the move-local
  cache, `structure/state.cairo`) reads the word at the first character it needs
  (`characters_state` 1) and keeps it; a placed or recovered character changes the cached word
  (`characters_state` 2); `flush` writes the slot once, if it changed.
- **The built tile is in the same cache.** `Structures::set_built` declares the tile and its refs;
  `flush` writes it once, with its position, after the assessment (a character recovered on it
  changes its `occupied_spot`). A move therefore writes each tile slot, record page slot and the
  `Characters` slot at most once, and reads each at most once.
- **`placement::assert_fits` checks the fit on the oriented tables.** The category of an edge is
  `edge_category(plan, orientation, direction)`, read from the oriented rows of `oriented.cairo`;
  `build` of `playable` and `tutoriable` calls `assert_fits(tile, @around)`, which needs at least one
  side neighbour (`TILE_NO_NEIGHBORS`), a placed tile when a neighbour is there (`TILE_NOT_PLACED`)
  and the same category on every facing edge (`TILE_CANNOT_PLACE`). It replaces `Tile::can_place`
  on the layouts.
- **The player is explicit at spawn.** `GameImpl::new(id, time, mode, player_id)` takes the player,
  which `spawn` reads from the registry (`player.id`); the game no longer calls
  `get_caller_address`. The builder is not stored apart: `spawn` leaves the first tile in the game's
  hand (`GameState`), and `builder_of` composes the builder.
- **`tile_limit <= 255`.** The tile count is packed in 8 bits in `GameState`, so `GameImpl::new`
  refuses a deck of more than 255 tiles (`Game: invalid tile limit`). `tile_limit` itself stays 16
  bits in `GameConfig`.
- **Bits of the deck bitmap** are set with `bit(index)` (`2^index`) and `|`, not with
  `Bitmap::set_bit_at`, whose loop of 256-bit products cost about 0.25M L2 gas.
- **The draw is `draw_from_bitmap`** (P-17, `helpers/random_deck.cairo`). `Game::draw_plan` calls
  `draw_from_bitmap(seed, number, bitmap)`, which returns the card and the number of cards left, and
  gives **the same tiles for the same seed** as `Deck::from_bitmap(seed, number, bitmap)` then
  `draw()` did: same hash (`seed`, 0, remaining), same slot, with the swaps of the withdrawn cards
  followed through `slot_card` and a `popcount` of the bitmap instead of rebuilding the deck. The
  goldens, the full-deck one included, are unchanged. A change of the seed-to-tiles mapping is out
  of reach of this optimisation (D-3).
- **`Mode::draw` is gone** (with its private `_draw` and the imports of the original deck): it had no
  caller since `draw_plan` is on `Game`.
- **P-16 is closed**: see "A road closed away from its forest" above; the oracle invariant replaces
  the re-assess step.
- **The re-rooting block is covered (mutation run, 2026-10-10).** With `if reparented {` in
  `placement::place` changed to `if reparented && false {`,
  `test_differential_two_areas_of_one_tile_join_one_structure` fails
  (`assertion ref_of(refs, first) == root failed. ref_of(refs, first): 97 root: 32`,
  `Tests: 0 passed, 1 failed`); restored, it passes (`Tests: 1 passed, 0 failed`).

## As built: D-18 (scoring without characters)

D-18 and P-45 in `docs/programme/DECISIONS.md`; built in D-18b. Characters left the game: a structure scores once,
on the move that closes it, with the formula of one character of power 1 and weight 1.

**When each category scores, and the formula.** `bonus(size) = num / den` from `compute_multiplier(size)`
(`helpers/multiplier.cairo`); the base points are 100 (road), 200 (city), 300 (forest), 900 (wonder)
(`constants.cairo`).

| Category | Closed when | Points | Code |
|---|---|---|---|
| Road, city | the root has `open == 0` | `size x base x bonus(size)` | `structure/assessment.cairo`, `score_generic` |
| Wonder | the root has `open == 0`: its 8 neighbours are placed | `900`, `Scored` with `size` 0 | `score_wonder` |
| Forest | its own half-edges land (`open == 0`) **and** every adjacent road is closed | `(distinct closed road roots + distinct closed city roots) x 300 x bonus(size)` | `structure/forest.cairo`, `assess_forest` and `scan` |

- `Game::assess` (`models/game.cairo`) visits, as before, each start spot of the built tile in `starts()` order and
  then the wonder of each neighbour (N, E, S, W, NW, NE, SE, SW). For each it reads the root; a root with
  `open == 0` that the move has not assessed yet is assessed and joins the move's set of assessed roots (`done`, a
  short array: at most the start spots and the 8 wonders). **Once per move**: a root that two start spots of the tile
  reach (a road or a city that loops through the tile, two forest areas of the tile joined around it) scores once.
  The tests: `e2e/forest.cairo`, "Once per move", one board per category (a road through two arms of a stop, a city
  ring through the two caps of a tile, a forest joined around a road that ends in a wonder, with three wonders that
  close around the built tile).
- **Only the closing move scores.** A root with `open == 0` that the move reaches holds a node of the built tile or
  is a wonder next to it. A structure that was closed before the move has no half-edge towards the position, so the
  tile cannot join it: the move that reaches a closed root is the move that closed it. Nothing else marks a
  structure as scored (before D-18 its `chars` were cleared), and nothing needs to.
- **The forest** is assessed only when its own half-edges are all closed; the scan then runs on every forest
  closure (not only with a forest character). An adjacent road whose root is open ends the scan and the forest does
  not score (P-16: no accepted board reaches it, see "A road closed away from its forest"); it is still marked
  assessed for the move, so a second start spot of the same forest does not scan it again. A city counts only when
  its root is closed, and each root once (P-15). **A forest that closes with 0 points emits its `Scored`** (category
  FOREST, points 0) and counts once in `count_forest`: the quests' unit is the forest closure (ruling 3 of the
  D-18b brief; `test_forest_closing_with_zero_points_emits_and_counts_once`). One `Scored` and one `count_forest` per
  forest (before: one per Woodsman and Herdsman).
- **Open at game end**: nothing scores, as before (`assess_over` only sets `over`).
- Scoring writes no record: the points come from the root (`size`) and, for a forest, the scan.

**What left the code.** `placement::occupy` and `placement::is_idle`, `Game::occupy_structure` and
`assert_structure_idle` (`Game: structure not idle`), the `Characters` word of `Structures` (`character`,
`put_character`, the cache state), `assessment::recover` and `recover_all`, the forest's `solve`, `Builder::place`
and `Builder::recover` (`Builder: already placed`, `Builder: character not placed`), `models/character.cairo`
(`Char`), `types/role.cairo` (`Role`), the `Store` accessors of the `Characters` word (`character`, `character_at`,
`set_character`, `characters_word`, ...), `Tile::occupe` and `leave`, the record helpers `chars_of`, `with_chars`
and `without_chars`. `Spot` stays: the layouts and the oracle use it. `placement::role_bit` is `placement::bit` (a
bit of a 16-bit set of directions or areas).

**Storage (D-17: no field renamed or retyped).** The layout is unchanged; the fields of the characters are dead:

| Field | Where | Since D-18b |
|---|---|---|
| `chars` | bits 32..48 of a record (`record.cairo`, the `Record` struct keeps the field) | never read; a root rebuilt by a union (`root_of`) is written with 0 there, other records keep their bits |
| `Characters` | `PavedStorage.characters`, one slot per game | declared, never read nor written |
| roles placed | bits 72..88 of the high half of `GameState` | never read; written 0, since `set_game_state` rebuilds the word (the first move after the upgrade clears them) |
| occupied spot | bits 80..88 of a tile's slot | never read; written 0 with a new tile (a placed tile is never written again) |

`Game.characters`, `Builder.characters` and `Tile.occupied_spot` left the structs; the packing leaves their bits as
the table says.

**No downgrade.** Going back to a pre-D-18 class after a D-18 move is unsupported for open games: the roles bits of
`GameState` and the `chars` of unioned roots are written 0, while the `Characters` word and the tiles' occupied
spots keep their old values, so the old code would read characters that its structures no longer hold.

**Games open across the upgrade (Sepolia).** They are **scored under the new rules from the upgrade on**; what they
scored before stays. A structure closed before the upgrade is never touched again (no tile joins a closed
structure), so it never scores again, whether it scored with a character (its `chars` cleared) or closed without one
(unscored under the old rules, and it stays so). A structure open at the upgrade scores by the D-18 formula on the
move that closes it, once, whatever `chars` its root still holds; no spot can be blocked, since `build` no longer
takes a character nor checks idleness. Tested in `src/tests/e2e/upgrade_d18.cairo` through two real upgrades (the
test-only class `DailyBeforeD18`, `src/tests/legacy.cairo`, holds the build paths of 07aab8a, `Daily`'s and the
Tutorial's): a Daily game with characters on an open road, city, forest and wonder, and a city scored with its Lord,
then upgraded and finished (game over), and a Tutorial game with the Adventurer and the Paladin of its script.
After the upgrade every build scores exactly the oracle's points, and the board's finished structures gain exactly
what the score gains.

**Cost (measured, `docs/measures/baseline.md`, "After D-18").** The forest scan now runs on every forest closure: a
4-tile forest that closes with no character cost 6,103,341 L2 gas before D-18 (no scan) and 8,535,523 since (e0,
+2.43M); with a Woodsman before (e) it cost 9,357,939. f, the 16-node scan, is 18,022,090 (19,097,399 before). Every
other move is cheaper (the character path left). `Daily` is 53,418 CASM felts (72,947 before; the P-44 cap is
72,947): `class-headroom.md`, "After D-18".

**Goldens and oracle.** `src/tests/oracle.cairo` was rewritten to the rules without characters: `GenericCount`,
`WonderCount` and `ForestCount` return counts, `Conflict` is gone, and `score` gives the D-18 points of a structure,
of a move (`move_points`) and of a board (`board_points`) from the walks alone. The check "forest left unscored" (a
forest character on a finished forest) became "closed structure left unscored", every category:
`check::assert_move_scored` (the move scored exactly the walks' points) after every checked build, and
`check::assert_board_scored` (the board's finished structures, each once, are the score plus the discard
penalties) at the end of the checked goldens. The goldens' expected scores were derived from `score`, not from the
structure state: `docs/measures/golden-games.md`, "Regenerated in D-18b".

## D-19: tile owners and majority scoring (planned)

D-19 and P-47 in `docs/programme/DECISIONS.md` (2026-10-13), in preparation for a multiplayer mode: a tile's owner
is the player who places it, and a closed structure's points go to the owner with the most tiles in it; on a tie,
nobody scores. Not built yet: this section is the design note for the implementation (D-19b), read from the code on
main after D-18c. It holds no figure; the implementation measures gas per move against the D-18 figures
(`docs/measures/baseline.md`, "After D-18") and `Daily`'s CASM under the P-44 cap (72,947 felts).

### What a structure's tiles are

**Road and city.** The structure state does not know a structure's tiles, only its nodes. A root holds `size`
(nodes, an area of a tile each), `open` and the dead `chars` (`structure/record.cairo:11-19`); a union sums the sizes
of the roots it joins (`structure/state.cairo:137-171`, `size += size_of(record)` at `:163`). A tile keeps, per area,
the `sid` the area got at placement (its refs, `record.cairo:21-23`), so from a tile one can find the root of each of
its areas; from a root one cannot list its tiles, and no record names the tiles below it. So **today the state
cannot tell two areas of one tile from two tiles** (ruling 1): `size` counts both. The case arises in the deck:

- a tile with two city areas whose cities join: `FFCFFFCFF` (two opposite caps, areas B and C,
  `elements/layouts/ffcfffcff.cairo:30-31`) placed inside a ring of city tiles. The ring of
  `test_once_per_move_city_reached_from_two_start_spots` (`tests/e2e/forest.cairo:438-459`) is a city of 7 nodes on
  6 tiles; it scores `size` 7 today, and its majority count is 6 tiles;
- a road through two arms of one tile: the stop `SFRFRFFFR` of `test_once_per_move_road_reached_from_two_start_spots`
  (`tests/e2e/forest.cairo:415-422`) closes a loop through its north and east arms, a road of 5 nodes on 4 tiles; and
  the re-rooting board of `test_differential_two_areas_of_one_tile_join_one_structure`
  (`tests/differential.cairo:143-184`), where two pairs of areas of a crossing `SFRFRFRFR` each end in one structure;
- the two areas need not join on the move that places the tile: a tile's two caps can sit in two open cities that
  a later tile joins. The join then happens far from the tile, in a union of two roots.

`size` stays what the formula uses (D-18: `size x base x bonus(size)`, nodes); the majority count is a separate count
of distinct tiles.

**Forest.** Its own tiles only (ruling 2): the distinct tiles of the forest's nodes, not those of the adjacent roads
and cities that give it its points. A tile can hold two forest areas of one forest (a road tile's two sides joined
around the road's end, the forest board of "Once per move"), so ruling 1 applies here too. The scan already walks
exactly these nodes (`structure/forest.cairo:71-160`).

**Wonder.** The wonder tile and its 8 neighbours (ruling 3). The neighbours are **not** part of the wonder's
structure: the wonder area's moves have no spot (`tables`: one spotless half-edge per direction), a placement only
closes one of its half-edges (`structure/placement.cairo:181-192`) and never joins a neighbour's area to it. So this
count is positional: the 8 positions around the wonder. They are all placed when it scores: a wonder scores when its
root has `open == 0` (D-18, P-45 ruling 4), i.e. when its 8 half-edges have closed, and a half-edge closes only when a
tile is placed at that position (`set_placed_tile` writes the position, `store.cairo:394-406`). The count is over 9
placed tiles.

### The owner field

`Tile` (`models/index.cairo:44-51`) has no owner, and the D-17 rules (P-42, `upgrades.md`, "Storage layout
discipline") allow new fields only. `Tile` is stored as one `felt252` per `(game_id, tile_id)` in
`PavedStorage.tiles` (`store.cairo:91`): plan, orientation, x, y in the low 80 bits, the dead occupied spot at 80..88,
bits 88..96 reserved for the tile id that `tile_slot_at` adds in memory (`store.cairo:265-276`), and the refs (108
bits) in the high half (`store.cairo:414-421`). About 47 bits are free (32 in the low half, 15 in the high half under
the felt's bound): enough for a seat index, **not for a player id** (a `felt252`, ruling 5).

So the owner is **a new map** of `PavedStorage`, `tile_owners: Map<(u32, u32), felt252>`, keyed `(game_id, tile_id)`,
the player id as value. Appending a member to the `paved` storage node moves no other variable: a member's address
is derived from its name (as `characters` stays declared after D-18 for that reason, `store.cairo:95-97`). A tile
written before the upgrade has no entry and reads **0**.

**A zero owner means the game's player** (`GameConfig.player_id`). That keeps ruling 4 for the games open across
the upgrade (their old tiles read 0, i.e. the player) and for the starter tile, which `spawn` places for nobody
(`components/hostable.cairo:69-73`). It also lets a single-player build skip the write: the owner is written only
when it differs from the game's player, which never happens in Daily or Tutorial (a build is accepted only from the
game's player: `builder_of`, `models/game.cairo:106-111`, asserted at `components/playable.cairo:201-203`). D-19
therefore adds no storage write to a Daily or Tutorial move.

`Lobby` shares `PavedStorage` (`systems/lobby.cairo:88`, `:385`) and runs `spawn`, `discard` and `surrender`; it
places the starter tile and draws tiles (`hostable.cairo:69-81`), and it never scores. With a zero owner meaning the
game's player, `Lobby`'s code does not touch the new map, and its class need not change for D-19; the
implementation confirms it by its class hash. Whoever adds the map adds it to the layout pins of `upgrades.md`.

### The two counting designs (ruling 6)

**Counts per root, kept through unions.** A root would keep its owners' tile counts (a small map owner -> count, or
a bounded list of pairs), merged by a union as `size` is. Ruling 1 breaks it: a union can join two roots that both
counted one tile (the two caps above, joined later), and the counts alone cannot see it. Keeping it exact needs each
root's **set of tiles**: tile ids stay below 256 (`record.cairo:8`), so a 256-bit bitmap, two slots per root, ORed by
a union; the counts then come from a per-player bitmap of the game's tiles (one per player), `popcount(root & mine)`
per player at scoring, with no walk. Cost: two more slots for each structure a tile founds (1 to 4 per move, new
slots, about 0.45M L2 gas each in receipts by Grim World's fit, an estimate) and the bitmap rewrites of every union,
on **every** move, single player included. It is exactly what the record pages were designed to avoid.

**A walk at scoring.** On the move that closes a structure, walk its nodes and count distinct tiles per owner:

- road and city: a walk from the closing area along the moves of its category, one tile read per node (slots cached
  by position), a `Felt252Dict` of visited nodes and one of counted tiles, one owner read per distinct tile. It is
  the forest scan's traversal (`forest.cairo:132-160`) without the adjacency part, so the two share one walker;
- forest: the scan already visits every node; it adds the tile set and the owner reads;
- wonder: the 8 positions around it (8 position reads; the tile ids are in the position value, `store.cairo:250-253`,
  so no tile slot is read), and 9 owner reads.

Bound: the structure's tiles, at most the deck (38 in Daily), as the forest scan's (no move is unbounded). It costs
nothing on a move that closes nothing and writes nothing.

**The single-player case.** In a game with one player every owner is that player, so the winner is the player and
the count can be skipped: the result is identical by construction, which ruling 4 asks for. Either design can skip
the count; only the walk also skips all its storage (the per-root sets cannot be skipped and rebuilt later, since the
unions happen move by move). With the skip, a Daily or Tutorial move costs what it costs after D-18, plus a branch,
and `Daily`'s CASM grows only by the walker code and the owner map (53,418 felts after D-18, cap 72,947). It leaves
untested on chain the walk, the owner reads and the tie: no deployed mode runs them until the multiplayer mode does,
so their tests carry the whole proof (below). The skip condition is the game's mode (Daily and Tutorial have one
player); the multiplayer mode defines its own.

**Recommendation: the walk at scoring, skipped when the game has one player.** It keeps ruling 1 exactly with
in-memory sets, adds no storage to any move, shares the forest scan's walker, and costs only on closing moves of a
multiplayer game, bounded by the deck. Counts per root pay on every move, single player included, for a value read
once per structure. CORE decides from this note; the implementation may change the choice with a measurement (the
walk's cost on a closing move of the full-deck board, measured once without the skip).

### The tie and the result

Today every score goes to the game: `GameState.score` is one `u32` per game (`store.cairo:176`), `add_score` adds to
it (`models/game.cairo:209-211`), and `Scored` (`events.cairo:65-72`: keys `game_id`; data `player_id, category,
size, points`) is emitted with `player_id = game.player_id` (`assessment.cairo:31`, `:52`, `forest.cairo:59`).

D-19 computes the **winner** of each closed structure: the owner with the most distinct tiles, or none on a tie.
In single player the winner is always the game's player (no tie: one owner holds every tile), so the score, the
event and the goldens are unchanged. Proposed for a tie (unreachable in single player, so a recommendation for the
multiplayer mode to confirm): no points are added; `Scored` is still emitted, with `player_id` 0 and `points` 0, so
an indexer sees the closure; the closure counters of the quests (`count_structure`, `count_forest`, `count_wonder`)
count it, as a forest closing with 0 points does (D-18b ruling 3).

D-19 does **not** build a per-player score: a multiplayer score needs a new field (a map `(game_id, player_id) ->
score`, or seats), and `GameOver` and the leaderboard read the game's one score. D-19 only computes the winner and
leaves the per-player score to the multiplayer mode. What that mode needs and D-19 does not build: the players of a
game (seats or a list in `GameConfig`), whose turn it is and who may build (today `builder_of` accepts only
`GameConfig.player_id`), a hand per player (`GameState.held_tile` is one), per-player scores and `GameOver`, the
tournament ranking of such games, the quest counters per player, and a **starter tile owned by nobody**: with a zero
owner meaning the game's player, the starter tile counts for the spawning player, which a multiplayer game must not
do (a sentinel owner, or the starter excluded from the count).

### Tests without a multiplayer mode

No entry point lets two players build in one game, so the majority is tested below the entry points, as the oracle
and the differential tests do:

- **A test harness on the structure state**: boards written with `Store::set_tile` (as `e2e/forest.cairo`'s
  "Once per move" boards) plus owners written in `tile_owners`, then the winner function called on a closed root
  (or a test-only class whose `build` takes the owner). Cases: a clear majority; a tie of two and of three owners
  (no points, the event above); ruling 1 with the 7-node, 6-tile city ring and the stop's 5-node, 4-tile road loop, owned so that
  counting nodes and counting tiles give different winners; ruling 2 with a forest whose adjacent roads and cities
  belong to another owner; ruling 3 with a wonder whose own tile decides (4 against 4 among its neighbours) and a
  three-way tie (3, 3, 3); a zero owner read as the game's player.
- **The oracle**: `tests/oracle.cairo` gains a count of distinct tiles per owner from its walks (`GenericCount`,
  `ForestCount`, the 8 positions of `WonderCount`), and `oracle::check` compares it with the walker after every
  checked build, owners spread over two or three players by tile id.
- **The goldens stay identical** (ruling 4), every expected value unchanged: `contracts/src/tests/golden/daily.cairo`,
  `forest.cairo`, `full_deck.cairo`, `tutorial.cairo` (through `harness.cairo`), the 20 `test_golden_*` cases of
  `docs/measures/golden-games.md`, the checked replays `*_structures_agree` included.
- **The upgrade**: a game open across the upgrade (as `tests/e2e/upgrade_d18.cairo` does for D-18) scores the same
  after it, its old tiles reading owner 0.
