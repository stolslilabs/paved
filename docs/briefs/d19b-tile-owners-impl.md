# D-19b brief: tile owners and majority scoring, the implementation

Track CORE of Paved. This changes the structure-state algorithm. A review and a correctness-lens audit follow (P-47 ruling 7).
Commit this brief as `docs/briefs/d19b-tile-owners-impl.md`, as the first commit of your PR.

## The specification (merged in #330, 7d04872)

- D-19 and P-47 in `docs/programme/DECISIONS.md`.
- `docs/architecture/structure-state.md`, section "D-19: tile owners and majority scoring (planned)": the tiles of
  each category, the owner map, the two counting designs, the tie, the tests.
- `docs/architecture/public-interface.md`, section "Planned change D-19".
Implement what they say, with the choices below. Where the code shows the note is wrong, follow the code's truth,
fix the note in the same PR, and say so in the PR body under "Spec corrections".

## CORE's choices (2026-10-13, from the note)

1. **The design is the walk at scoring, skipped when the game has one player.** Counts per root are not built.
   - On the move that closes a structure, the winner is computed by a walk:
     - road and city: the structure's nodes;
     - forest: its own nodes, inside the existing scan;
     - wonder: the 8 positions around it, plus the wonder tile.
   - The walk counts distinct tiles per owner (ruling 1), in memory, with no storage write.
   - The road and city walk shares one walker with the forest scan. Do not duplicate it.
2. **The skip.** In a game with one player, the winner is the game's player, and the walk does not run. Today that is
   every Daily and Tutorial game.
   - Write the condition so that a future multiplayer mode turns it off in one place.
   - The scores, events and goldens stay identical (ruling 4).
3. **The owner.**
   - A new map `tile_owners: Map<(u32, u32), felt252>` in `PavedStorage`, keyed `(game_id, tile_id)`, the player id
     as value. A zero owner means the game's player.
   - It is written only when the placer differs from the game's player, which never happens in Daily or Tutorial. So
     no Daily or Tutorial move gains a storage write.
   - Add the map to the layout pins of `docs/architecture/upgrades.md`.
4. **A tie.**
   - No points are added.
   - `Scored` is still emitted, with `player_id` 0 and `points` 0.
   - The closure counters (`count_structure`, `count_forest`, `count_wonder`) still count the closure.
   - It cannot happen in single player. It is built and tested now so that the multiplayer mode inherits it.
5. **No ABI change.**
   - `TileView` gets no `owner` field now: the multiplayer mode adds it.
   - `Built` and `Scored` keep their layouts.
   - `scripts/abis.sh` must show no diff. If the code forces a change, stop and report it.
6. **`Lobby`'s class must not change.** Prove it: give its class hash on main and on the branch. If it changes, say
   why, and whether Sepolia's D-19 upgrade then needs a `set_lobby_class`.
7. **Left to the multiplayer mode, not built:** the starter tile owned by nobody, per-player scores, seats, turns,
   and `TileView.owner`. List them in the PR body.

## Tests (the note's "Tests without a multiplayer mode")

- **A test harness on the structure state.** Boards written with `Store::set_tile`, owners written into
  `tile_owners`, and the winner function called on a closed root. Cases:
  - a clear majority;
  - a tie of two owners, and a tie of three;
  - ruling 1: the 7-node, 6-tile city ring and the stop's 5-node, 4-tile road loop, owned so that counting nodes and
    counting tiles give different winners;
  - ruling 2: a forest whose adjacent roads and cities belong to another owner;
  - ruling 3: a wonder whose own tile decides (4 against 4 among the neighbours), and a three-way tie (3, 3, 3);
  - a zero owner read as the game's player.
- **The tie's effects**, through the scoring path with the skip forced off (a test-only switch, or a test class):
  - no points;
  - `Scored` with 0 and 0;
  - the counters still count it.
- **The oracle.** `tests/oracle.cairo` gains a count of distinct tiles per owner from its own walks.
  - `oracle::check` compares that count with the walker after every checked build.
  - Owners are spread over two or three players by tile id.
  - The expected winner must come from the oracle's walks, not from the new code.
- **The goldens stay identical.** No expected value changes in:
  - `src/tests/golden/daily.cairo`, `forest.cairo`, `full_deck.cairo` and `tutorial.cairo`;
  - `harness.cairo`;
  - `docs/measures/golden-games.md`.
  A golden that changes is a failure: stop and report.
- **The upgrade.** Deploy main's `Daily` (the D-18 class), play a game with open structures, upgrade it to the
  branch's class, and finish it. It scores as it would have without the upgrade, and its old tiles read owner 0.
  `tests/e2e/upgrade_d18.cairo` is the model.

## Measures

- `scripts/class-sizes.sh` before and after. **`Daily` must stay at or under 72,947 CASM felts (P-44).** Give the
  figure and the headroom (53,418 after D-18).
- **Gas: the scenarios of `docs/measures/baseline.md`, before and after, in a new "After D-19" table.** With the skip,
  a single-player move should cost what it cost after D-18, plus the branch.
- **Once, with the skip forced off:**
  - the walk's cost on the closing moves of the full-deck board, with the largest road, city, forest and wonder
    closure;
  - say which move is the most expensive, against the D-18 figure.
  This figure is for the multiplayer mode; it changes no ceiling.
- The ceilings in `contracts/tests/gas.cairo` move only if a single-player figure moves past one. Say why, with the
  margin used before.

## Runs (VPS, D-251)

- scarb 2.20.1 and snforge 0.64.0 from `~/.asdf/installs/`.
- snforge: `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter> --max-threads 2`.
- scarb build: `prlimit --as=12884901888`.
- Only after `free -g` shows 8 GB or more available. One build at a time. Record the peaks.
- **Scoped runs first:**
  - the structure-state, forest, assessment, golden, oracle, differential, e2e, upgrade and gas tests;
  - the new harness;
  - `class-sizes.sh`.
  The whole suite runs once, at the end.
- A capped run with no progress for 15 minutes is stopped and reported.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `contracts/src/**`, `contracts/tests/**`.
- `contracts/abis/**`: through `scripts/abis.sh`, and only if a change is forced (choice 5: report it first).
- Docs:
  - `docs/architecture/structure-state.md`: the D-19 section becomes "As built: D-19";
  - `docs/architecture/upgrades.md`: the layout pin of `tile_owners`;
  - `docs/architecture/public-interface.md`: only to confirm or correct the D-19 section;
  - `docs/architecture/class-headroom.md`, `docs/measures/baseline.md`, `docs/measures/golden-games.md` (figures only;
    no golden value changes).
- `docs/briefs/d19b-tile-owners-impl.md`.
- Not `packages/**`, not `scripts/**`, not `contracts/deployments/**`.

## PR

- Title: `feat: D-19, tile owners and majority scoring (walk at scoring, single-player skip)`.
- Body:
  - the summary;
  - the walker and how it is shared with the forest scan;
  - the skip and where its condition lives;
  - the owner map and its layout pin;
  - the tie;
  - the tests, by ruling;
  - goldens unchanged (the diff of the golden files: none);
  - the ABI: no diff;
  - `Lobby`'s class hash before and after;
  - the sizes, with `Daily`'s headroom;
  - gas before and after, and the walk's cost with the skip off;
  - "Spec corrections";
  - "Left to the multiplayer mode";
  - one line on why an audit is asked: a change of the structure-state algorithm, the result every score depends on.
- Report: the PR's number and head, everything in the body, and the peaks. Do not merge.
