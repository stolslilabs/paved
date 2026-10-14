# G7: the gas profile of a move, and a plan of cuts

Part 1 of the G7 gas iteration (`docs/briefs/g7-profile-and-plan.md`): where the L2 gas of `build`, `discard`,
`surrender` and `spawn` goes on current main, and the cuts proposed for the PM to rule. **No contract code changes
here.** The profile is measured with ignored tests in a new file, `contracts/tests/profile_g7.cairo`. They change no
ceiling and no golden.

- Date: 2026-10-14. Base: main `f8ed19f5`. VPS (Linux), scarb 2.20.1, snforge 0.64.0, through the shims,
  `RAYON_NUM_THREADS=1`, 15 GiB cap.
- Every figure is the **test profile**: `snforge test`, the dev profile, `inlining-strategy = "avoid"`. The committed
  ceilings use this profile. The class that is declared is built with release, which costs less. The release side
  could not be measured on the VPS: see "What was not measured".
- Every figure is measured unless it is called an estimate.

## Summary

| Scenario | L2 gas | Top costs (share of the call) |
|---|---:|---|
| a0, open simple move | 5,169,607 | structure placement 25.6 %, neighbourhood read 19.5 %, assessment with nothing to score 10.8 %, flush 9.3 %, game record 9.4 % |
| a, closes a 2-tile city | 4,967,939 | neighbourhood 20.3 %, placement 18.3 %, flush 13.1 %, assessment 12.0 % (+ scoring 2.6 %) |
| c, closes a 6-tile city | 5,376,938 | neighbourhood 18.8 %, **draw 16.0 %** (this deck), placement 14.5 %, flush 12.3 % |
| d, closes a 12-tile city tree | 5,328,267 | neighbourhood 21.1 %, placement 20.1 %, flush 12.9 %, assessment 8.9 % |
| e, closes a forest of 4 | 8,679,414 | **forest scan 27.8 %**, placement 19.7 %, neighbourhood 12.9 %, assessment 7.9 % |
| f, worst forest scan (16 nodes) | 18,167,380 | **forest scan 62.6 %**, placement 10.8 %, neighbourhood 6.7 % |
| l, game over on a build | 7,173,835 | **`Economy.record` 17.3 %**, placement 18.4 %, neighbourhood 14.1 %, `Setup.report` 8.5 % |
| g, closing move (surrender) | 3,174,468 | **`Economy.record` 39.1 %**, `Setup.report` 19.2 %, game record 15.1 % |
| m, spawn (stake 1) | 17,644,657 | **`Economy.purchase` 47.7 %**, deck walk 19.2 %, starter placement 13.9 %, USDC `transferFrom` 5.7 % |

By resource, a move is about 40 % storage syscalls and 60 % compute in this profile. Storage is 37.5 % of a0, 38.3 %
of c and 25.3 % of f. Events are about 1 %.

The cuts recommended for the first implementation PR (section 5) are three low-risk ones: skip the assessment
when nothing closes, place the starter tile from constants, and give the forest walker the tiles the move has
already read. None of them changes a rule, a golden, the parity fixture, the storage layout or an ABI. Estimated
gains: a0 and l -0.56M (-10.8 %, -7.8 %), e and f -0.30M, spawn -2.06M (-11.7 %).

## 1. Method

### 1.1 The commands

The gas tests (`contracts/tests/gas.cairo`) were run once for the figures, the gas report and the resources:

```
RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v \
  snforge test test_gas_ --max-threads 2 --gas-report --detailed-resources
```

17 passed. Peak RSS 7,314,724 kB, 2 min 39 s. Every figure equals the latest one of `docs/measures/baseline.md`
to the unit: a0 5,169,607, a 4,967,939, c 5,376,938, d 5,328,267, e 8,679,414, f 18,167,380, g 3,174,468,
i 2,716,928, k 3,608,648, l 7,173,835, s 3,395,653, m 17,644,657, n 18,497,677, t to w as V1b.

Then the probes:

```
RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v \
  snforge test profile_g7 --ignored --detailed-resources --max-threads 2   # 29 passed, peak 4,612,324 kB
RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v \
  snforge test profile_g7_replay --ignored --max-threads 1                 # 12 passed, peak 4,502,060 kB
```

The second run uses one thread so that the `PROFILE` lines of each test are not interleaved with another test's. The
syscall counts come from the first run; snforge prints them per test, so they do not interleave.

### 1.2 What the probes do

`contracts/tests/profile_g7.cairo` holds four kinds of probes.

- **`replay_*`.** The scenario of `gas.cairo` (same day seed, same forced plans) up to its last move. The last move
  is then replayed in `Challenge`'s storage (`interact_with_state`), piece by piece. The replay is the code of
  `PlayableComponent::build`, copied in order. It also copies `discard`, `surrender`, `Game::assess_with` (solo),
  `assess_forest` and `HostableComponent::spawn_with`. The game-over tests then call `Setup.wiring`, `Setup.report`
  and `Economy.record` from the test, with `Challenge` as their caller, one by one. `Setup.report` is also called
  with its quests alone, its achievements alone and nothing. The spawn test calls USDC's `transferFrom`,
  `Economy.purchase` and `Collection.mint` the same way.
- **`prep_*` and `real_*`.** The scenario without its last move, then with it through the dispatcher. The difference
  of their `--detailed-resources` lines gives the syscalls of the last move alone.
- **`units`.** Ten operations in a loop, less ten turns of the same empty loop: a storage read, a write, a tile
  decode, each event, a Poseidon, a dictionary access, an empty neighbourhood.
- **`method`.** The measurement below, which decides how every piece is measured.

The tests are named `test_profile_g7_*`. `scripts/measure.sh`'s coverage group `profile-g7` holds them, as
`check-groups` (which CI runs) requires of every test. Being ignored, they run nothing there.

### 1.3 Why each piece runs in a loop

Sierra charges the gas of straight-line code ahead of time, at the last loop turn or function entry the solver picks,
and refunds the unused part at branch merges. So the available gas read in the middle of a function is not a running
counter. `test_profile_g7_method` shows it:

| Around | L2 gas |
|---|---:|
| a call to a function (not inlined) that reads one slot | 14,070 |
| `live_game` (4 slot reads), straight-line | 53,680 |
| a loop of n turns, empty: n = 0, 1, 2, 3, 11 | 680, 10,100, 19,520, 28,940, 104,300 |
| a loop of n turns, one read each: n = 0, 1, 2, 3, 11 | 1,280, 87,480, 173,680, 259,880, 949,480 |

A loop whose number of turns is known only at run time is charged turn by turn, linearly: 86,200 per turn with a
read, 9,420 per empty turn, so one read costs 76,780. A loop that the compiler sees run once (`loop { break; }`) read
0, because it was charged ahead of time. So each piece of a replay runs in `while i < once`, where `once` is 1 but
read at run time. Each piece's figure then includes one empty turn, 10,100 (`once_overhead`, printed by each test),
which the tables below subtract.

The pieces add up to:

- 96.5 % to 99.6 % of a `build` that does not end the game (a0, a, c, d, e, f);
- 94.3 % of l, a `build` that ends the game;
- 94.6 % of a plain discard;
- 89.1 % to 90.8 % of the game overs by `discard` and `surrender` (s, g, k);
- 97.3 % of the spawn.

See the "outside the replay" rows. l and the game overs are lower because their three calls to `Setup` and `Economy`
are made from the test; their overhead from the contract is not in the pieces. The rest is the entry point's dispatch, `Challenge.build`'s position check (9,600, "After
the position check" in `baseline.md`), `finish`'s calls made from the contract instead of the test, and the replay's
own error.

### 1.4 Unit costs (`test_profile_g7_units`)

| Operation | L2 gas |
|---|---:|
| Storage read of a slot (`structures`, its key of three hashed in) | 76,840 |
| The same on an empty slot | 76,840 |
| Storage write of a slot | 118,210 |
| A tile slot read and decoded (`tile_with_refs`) | 102,695 |
| An empty position read (`tile_at`) | 101,630 |
| A taken position and its tile read (`tile_at`) | 188,615 |
| `live_game` (`GameConfig` and `GameState`: 4 slots) | 235,127 |
| `set_game_state` (2 slots) | 241,470 |
| Event `Scored` or `Built` | 32,800 |
| Event `GameOver` | 37,000 |
| Poseidon of 3 inputs | 10,324 |
| `Felt252Dict` insert and get | 8,319 |
| `get_block_timestamp` | 18,140 |
| `NeighborhoodTrait::read` on 8 empty positions | 908,152 |
| `StructuresTrait::new` and one record read (its dictionaries squashed) | 211,044 |
| One empty loop turn | 9,388 |

A read's 76,840 and a write's 118,210 are not all syscall. Each also holds the hash of its key, the
three-part key of `structure_slot` (`(game, tile, slot)`) or of a position. Only the bare syscall costs the same in
both profiles; the hash and the code around it are compute and shrink in release. The split was not measured.

### 1.5 What was not measured

- **The release profile.** `snforge test test_gas_ --release` and `snforge test profile_g7 --ignored --release` were
  both stopped while building. The `snforge` shim runs every build in a systemd scope with `MemoryMax=8G`. The
  release test build of the scarb child passed 8,010,936 kB RSS, and both runs ended with status 143. The user
  journal says why: `run-…scope: A process of this unit has been killed by the OOM killer` (17:14:30 and 17:17:30). The only
  release figure on record is the class-headroom note's, on main of P7: a simple move costs 2,586,870 in release
  against 5,082,345 in the test profile (`class-headroom.md`, "(c4)"). That is the ratio, not today's figure.
  Escalated (see the report): measure release on the Mac or in CI.
- **A function-level profile.** `cairo-profiler` is not installed on the VPS (`snforge test --build-profile` needs
  it), and installing software is not a thread's act. The pieces below come from the replay instead. Placement,
  assessment and the scan are split no further than their callers.
- **The real router.** `Economy.purchase` runs against `MockRouter` in the tests, not Ekubo. Its swap figures are the
  mock's.

## 2. The profile

### 2.1 A build, piece by piece (test profile, L2 gas)

Each figure is the piece's loop less its empty turn (1.3). l's three calls are measured from the test, so their
overhead is that of a call from the test.

| Piece | a0 | a | c | d | e | f | l |
|---|---:|---:|---:|---:|---:|---:|---:|
| Game record: read (`GameConfig`, `GameState`: 4 slots) | 237,537 | 237,537 | 237,537 | 237,537 | 237,537 | 237,537 | 237,537 |
| Checks (exists, started, not over, expiry, caller) | 68,900 | 68,900 | 68,900 | 68,900 | 68,900 | 68,900 | 68,900 |
| Tile in hand: read | 116,205 | 116,205 | 116,205 | 116,205 | 116,205 | 116,205 | 116,205 |
| Position taken? (1 read) | 95,420 | 95,420 | 95,420 | 95,420 | 95,420 | 95,420 | 95,420 |
| Neighbourhood: 8 positions, the side tiles, diagonal wonders | 1,010,217 | 1,010,217 | 1,012,307 | 1,121,702 | 1,121,702 | 1,219,757 | 1,012,307 |
| Fit check | 242,422 | 242,422 | 242,422 | 361,324 | 361,214 | 361,324 | 242,422 |
| Event `Built` | 34,000 | 34,000 | 34,000 | 34,000 | 34,000 | 34,000 | 34,000 |
| Structure placement (union-find, page reads) | 1,321,103 | 908,705 | 779,157 | 1,071,882 | 1,711,492 | 1,962,791 | 1,321,103 |
| Assessment: starts, finds, neighbours' wonders | 558,864 | 594,314 | 476,616 | 476,616 | 683,954 | 791,723 | 558,864 |
| Scoring a road or city (multiplier, `Scored`) | 0 | 129,839 | 159,169 | 180,299 | 150,969 | 180,299 | 0 |
| Forest scan (walk, finds, tile reads) | 0 | 0 | 0 | 0 | 2,409,392 | 11,367,652 | 0 |
| Forest scoring (multiplier, `Scored`) | 0 | 0 | 0 | 0 | 138,506 | 180,766 | 0 |
| Wonder scoring | 0 | 0 | 0 | 0 | 0 | 71,553 | 0 |
| Draw: reseed (Poseidon) | 28,144 | 28,144 | 28,144 | 28,144 | 28,144 | 28,144 | 14,610 |
| Draw: `draw_plan` | 344,719 | 244,578 | 861,513 | 244,578 | 344,719 | 344,719 | 9,800 |
| Drawn tile: write | 189,150 | 189,150 | 189,150 | 189,150 | 189,150 | 189,150 | 10,330 |
| Flush: built tile, its position, record pages | 479,176 | 652,508 | 660,608 | 686,720 | 625,970 | 581,420 | 479,176 |
| Game over: `GameEnd` write | 7,900 | 7,900 | 7,900 | 7,900 | 7,900 | 7,900 | 150,290 |
| Game record: write (`GameState`: 2 slots) | 248,080 | 248,080 | 248,080 | 248,080 | 248,080 | 248,080 | 247,980 |
| Game over: `GameOver` event and tally | 6,400 | 6,400 | 6,400 | 6,400 | 6,400 | 6,400 | 143,222 |
| Game over: `Setup.wiring`, `Setup.report`, `Economy.record` (calls) | 0 | 0 | 0 | 0 | 0 | 0 | 2,020,864 |
| **Sum of the pieces** | **4,988,237** | **4,814,319** | **5,223,528** | **5,174,857** | **8,579,654** | **18,093,740** | **6,763,030** |
| Outside the replay (dispatch, position check, `finish`, the replay's error) | 181,370 | 153,620 | 153,410 | 153,410 | 99,760 | 73,640 | 410,805 |
| **The real call (`gas.cairo`)** | **5,169,607** | **4,967,939** | **5,376,938** | **5,328,267** | **8,679,414** | **18,167,380** | **7,173,835** |
| Pieces / real | 96.5 % | 96.9 % | 97.1 % | 97.1 % | 98.9 % | 99.6 % | 94.3 % |

The figures of 6,400 to 7,900 on a move that does not end the game are the branch that a game over takes, empty
here.

### 2.2 By resource: storage, events, compute

Syscalls of the last move: `real_*` less `prep_*`, `--detailed-resources`. The cost is the count times the unit
cost of 1.4. `GetExecutionInfo` is priced at 18,140 (1.4, `get_block_timestamp`). "Compute and call" is the rest:
the call itself, the dispatch, and every non-syscall step. The four cost rows add up to the real call.

| | a0 | a | c | d | e | f |
|---|---:|---:|---:|---:|---:|---:|
| Storage reads | 16 | 16 | 16 | 18 | 24 | 49 |
| Storage writes | 6 | 7 | 7 | 7 | 7 | 7 |
| Events | 1 | 2 | 2 | 2 | 3 | 4 |
| `GetExecutionInfo` | 2 | 2 | 2 | 2 | 2 | 2 |
| Storage cost | 1,938,700 (37.5 %) | 2,056,910 (41.4 %) | 2,056,910 (38.3 %) | 2,210,590 (41.5 %) | 2,671,630 (30.8 %) | 4,592,630 (25.3 %) |
| Events | 32,800 (0.6 %) | 65,600 (1.3 %) | 65,600 (1.2 %) | 65,600 (1.2 %) | 98,400 (1.1 %) | 131,200 (0.7 %) |
| `GetExecutionInfo` (2 x 18,140) | 36,280 (0.7 %) | 36,280 (0.7 %) | 36,280 (0.7 %) | 36,280 (0.7 %) | 36,280 (0.4 %) | 36,280 (0.2 %) |
| Compute and call | 3,161,827 (61.2 %) | 2,809,149 (56.5 %) | 3,218,148 (59.9 %) | 3,015,797 (56.6 %) | 5,873,104 (67.7 %) | 13,407,270 (73.8 %) |
| L1 data gas (real less prep) | 192 | 96 (prep of a0) | 288 | 192 | 192 | 192 |

The 16 reads of a0 are these:

- the game record: 4 slots;
- the tile in hand: 1;
- its position: 1;
- the 8 neighbouring positions: 8;
- the tile of its one side neighbour (the starter): 1;
- the starter's record page: 1.

The 6 writes are:

- the drawn tile: 1;
- `flush`: 3 (the built tile's position, the built tile, the starter's page);
- `GameState`: 2.

f's 49 reads are 33 more than a0's: the scan reads the position and the slot of each tile it reaches, and the pages
of the roots it finds.

### 2.3 The brief's categories, as a share of the move

| Category | a0 | c | e | f | l |
|---|---:|---:|---:|---:|---:|
| Storage reads and writes (2.2) | 37.5 % | 38.3 % | 30.8 % | 25.3 % | not split (see 2.4) |
| Structure state of roads, cities, wonders: placement, assessment, their scoring | 36.4 % | 26.3 % | 29.3 % | 16.5 % | 26.2 % |
| Neighbourhood and position check (the reads that feed it) | 21.4 % | 20.6 % | 14.0 % | 7.2 % | 15.4 % |
| Forest scan and its scoring | 0 | 0 | 29.4 % | 63.6 % | 0 |
| D-19 seat | 0 counted: a Challenge game is solo and skips the count | | | | |
| Draw (reseed and `draw_plan`) | 7.2 % | 16.5 % | 4.3 % | 2.1 % | 0.3 % |
| `Setup.report` (quests and achievements) | | | | | 8.5 % |
| `Economy.record` | | | | | 17.3 % |
| Events | 0.6 % | 1.2 % | 1.1 % | 0.7 % | 0.5 % (`Built`) + 2.0 % (`GameOver`) |
| Game record, read and write | 9.4 % | 9.0 % | 5.6 % | 2.7 % | 6.8 % |
| Flush | 9.3 % | 12.3 % | 7.2 % | 3.2 % | 6.7 % |
| Tile in hand read and drawn tile write | 5.9 % | 5.7 % | 3.5 % | 1.7 % | 1.8 % |
| Fit check | 4.7 % | 4.5 % | 4.2 % | 2.0 % | 3.4 % |

The storage row overlaps the others: it is the share of the syscalls inside them. The other rows are pieces of 2.1
and do not overlap each other.

- **The D-19 seat.** The single-player skip (`Mode::solo`) leaves no count to measure on these scenarios. What the
  seat still costs is its field in every tile decoded and packed: D-19b measured +62,996 to +87,769 per build
  (1.4 % to 1.6 %), +199,863 on e and +547,526 on f (`baseline.md`, "After D-19"). It is under 3 % everywhere.
  No cut is proposed: the field is the multiplayer mode's.
- **Above 3 % and not in the brief's list:** the neighbourhood read (19.5 % of a0), the fit check (4.7 %), the flush
  (9.3 %), the game record (9.4 %), the tile in hand and the drawn tile (5.9 %). They have rows of their own above.

### 2.4 Discard, surrender, the game overs

| Piece | discard (not over) | s, game over on a discard | g, surrender in its day | k, surrender, full report |
|---|---:|---:|---:|---:|
| Game record: read | 237,537 | 237,537 | 237,537 | 237,537 |
| Checks | 68,900 | 68,900 | 40,010 | 40,010 |
| Tile in hand: read | 116,205 | 116,205 | | |
| Discard and event `Discarded` | 62,140 | 62,140 | | |
| Draw: reseed and `draw_plan` | 531,175 | 24,410 | | |
| Drawn tile: write | 189,150 | 10,330 | | |
| `GameEnd` write | 7,900 | 150,290 | 146,290 | 146,290 |
| `GameState` write | 248,080 | 247,980 | 241,910 | 241,910 |
| `GameOver` event and tally | 6,400 | 143,222 | 140,822 | 140,822 |
| `Setup.wiring` (call) | | 171,160 | 171,160 | 171,160 |
| `Setup.report` (call) | | 610,074 | 610,074 | 1,024,904 |
| `Economy.record` (call) | | 1,239,630 | 1,239,630 | 1,239,630 |
| **Sum** | **1,467,487** | **3,081,878** | **2,827,433** | **3,242,263** |
| **Real (`gas.cairo` or `real_discard`)** | **1,551,771** | **3,395,653** | **3,174,468** | **3,608,648** |

`Setup.report` in parts (calls from the test, `Challenge` the caller):

| Report | Entries (quests + achievements) | L2 gas |
|---|---|---:|
| none (the call and the reporter check) | 0 + 0 | 270,320 |
| g, l, s: quests only | 3 + 0 | 527,228 |
| g, l, s: achievements only | 0 + 1 | 353,166 |
| g, l, s: both | 3 + 1 | 610,074 |
| k: quests only | 4 + 0 | 610,674 |
| k: achievements only | 0 + 5 | 684,550 |
| k: both | 4 + 5 | 1,024,904 |

So the call and its check cost 0.27M, and each entry about 83,000 to 86,000 (the quests run in event mode).

`Economy.record` is 1,239,630 for every game over. It makes 6 reads (the game's address, `players`, `outcomes`,
`terms`, `means`, `days`; each a packed felt), 2 writes (`outcomes`, `days`) and one event. That is 0.70M of syscalls
and 0.54M of the call and the unpacking. None of the reads is redundant. `PURCHASED` is status 0, the default of a
game `Economy` never saw, so the `players` read is what refuses an unknown game (section 3).

### 2.5 The spawn (m, stake 1, no referrer)

| Piece | L2 gas |
|---|---:|
| `Setup.wiring` (call) | 171,160 |
| `uuid` (game count read and write) | 150,340 |
| `GameImpl::new` and the token seed | 46,684 |
| `Game::start`: the deck walk (G1) | 3,392,535 |
| The starter tile: `set_tile` (its slot read, `place_alone`: 8 empty positions, placement, flush) | 2,460,670 |
| The first draw | 241,278 |
| The drawn tile: write | 182,650 |
| `set_game` (`GameConfig` and `GameState`: 4 slots) | 437,880 |
| Event `GameSpawned` | 45,530 |
| USDC `transferFrom` (call) | 1,005,890 |
| `Economy.purchase` (call) | 8,418,570 |
| `Collection.mint` (call) | 607,350 |
| **Sum** | **17,160,537** |
| **Real (m)** | **17,644,657** |

The rest (484,120) holds the pause check (40,480, G4) and the dispatch. Inside `Economy.purchase`, the gas report of
test m (inclusive figures of the inner calls) gives:

- the router's `swap` 1,321,780, `clear_minimum` 1,206,580, `clear` 395,250, `pool_key` 96,650;
- PAVED `burn` 608,470 and two `transfer`s of 637,000;
- the USDC `transfer` 636,900, and `balance_of` calls of 105,500 each.

That is about 5.8M of the 8.7M per purchase. The rest, about 3.0M, is `Economy`'s own reads, writes and price
arithmetic.

## 3. What earlier passes did or rejected (not re-proposed)

- **P5-4 to P5-6:** the structure state, one read and one write per slot per move, the forest scan reading each tile
  once, positions with a wonder flag, the fit check on oriented tables, no 256-bit power loops (`structure-state.md`,
  "As built (P5-6 and after)").
- **P-17 and G5:** the draw. No deck rebuild, a table of bits, the popcount by one product. The card is unchanged by
  construction. The draw's remaining cost depends on the deck (c's 0.86M against a0's 0.34M). A change of the
  seed-to-tiles mapping is out of reach (D-3).
- **G1:** the deck walk, by selection sampling. 3.39M is left, all per-index work of the test profile.
- **D-19b:** the seat in the tile's slot, not a separate map (cheaper when the count runs).
- **class-headroom (c4):** `avoid` inlining in release was rejected, because the test profile already costs twice
  the release gas.
- **Rejected again here:**
  - a 128-bit seed to save a slot changes the seed-to-tiles mapping (D-3);
  - fewer quest entries changes what the quests count (a rule);
  - a lazy deck walk changes every deck, so every golden;
  - a persistent adjacency set per forest root cannot be merged in O(1), which is why P5-5 chose the scan;
  - dropping `Economy.record`'s `players` read: `PURCHASED` is status 0, the default of an unknown game, so that read
    is what refuses one (`UNKNOWN_GAME`).

## 4. The cuts, ordered by gain over risk

The gains are **estimates**, in the test profile, each with how it was estimated. A cut that removes a storage
access keeps the bare syscall's share of its gain in release and loses part of the key hash's. A cut of compute
gains less in release. Neither ratio is measured here (1.5).

| # | Cut | Estimated gain | Risk | Rule | Goldens | Parity fixture | Storage layout | ABI | Structure code (audit) |
|---|---|---|---|---|---|---|---|---|---|
| C1 | Skip the assessment when the move closes nothing | a0 and l -0.56M (-10.8 %, -7.8 %); 0 on a move that closes | low | no | no | no | no | no | yes, small |
| C2 | Place the starter tile from constants at spawn | m, n -2.06M (-11.7 %) | low | no | no | no | no (same content) | no | yes, small (constants proved by a test) |
| C3 | Give the forest walker the side tiles the move has read | e, f -0.30M (-3.4 %, -1.6 %) | low | no | no | no | no | no | yes, small |
| C4 | Hold the drawn tile's plan in `GameState` | every build -0.31M (a0 -5.9 %); discard -0.12M; spawn -0.18M | low to medium | no | no | no | yes | no (views compose) | no |
| C5 | Fit check on one edge word per oriented plan | a guess: at most -0.12M (one side neighbour) to -0.24M (two) | low | no | no | no | no | no | yes, small |
| C6 | Positions packed by blocks of 5 x 5 | builds about -0.45M (-8.7 % of a0); f about -1.45M (-8.0 %) | medium to high | no | no | no | yes | no | yes, large |
| C7 | A function-level profile of placement, assessment and scan, then their cuts | unknown: these are 2.4M of a0 and 13.9M of f | | | | | | | yes |
| C8 | One call fewer at game over (the economy's address kept by `Challenge`) | every game over about -0.09M | low | no | no | no | yes (one slot) | no | no; changes P-53's wiring |
| C9 | Gate the release profile too (ceilings measured with `--release`) | none to the code; the figures players pay become the gated ones | none to the code | no | no | no | no | no | no |

C1 to C3 change nothing outside the code they touch. C4 and C6 change the storage layout. D-27 makes that cheaper
now: Sepolia restarts from zero with one fresh deployment at the end, and nothing is on mainnet. If C4 or C6 ships
before that deployment, no game in flight needs a migration. After it, each would need a dual read for the games
started before its upgrade (D-17's path).

### C1. Skip the assessment when nothing closes

- **What it changes.** `placement::place` already computes the record of every root the move reaches: each area's
  root after its merge or founding, and each neighbour wonder's root after `close_one`. It would also return whether
  any of them has `open == 0`. `Game::assess` then runs only when one did.
- **Why it is the same.** The assessment scores only roots with `open == 0`, and only roots reached from the tile's
  refs and the neighbours' wonders. A root reaches `open == 0` only through this move's `close_one`, `merge` or
  `founded(0)` (a closed structure takes no later tile).
- **Gain (measured basis).** The assessment's fixed part, measured on a0, which scores nothing: 558,864 (476,616 to
  791,723 on the other moves). An open move saves it all, less the flag's test (a few thousand, estimate). A closing
  move saves nothing. l's move is a0's, so l saves it too. The share of moves that close nothing in a real game was
  not measured (the full-deck golden can give it).
- **Risk.** Low: one flag, the same condition. The differential, golden and walk tests cover the equality.

### C2. Place the starter tile from constants

- **What it changes.** Every spawn writes the same starter (`RFFFRFCFR`, South, at `CENTER`, tile 1) on an empty
  board. `set_tile` reads its slot, reads 8 empty positions (0.91M, 1.4), places it and flushes. Its refs and its
  page words are constants of the plan tables: the spawn would write the position, the tile slot and the page
  directly.
- **Gain.** The piece is 2,460,670 (2.5). Three writes and their packing are about 0.40M (3 x 118,210 and the
  constant words; estimate). The gain is about -2.06M per spawn.
- **Risk.** Low. A test asserts that the constants equal what `place_alone` writes. The goldens prove the rest,
  since every game starts from it.

### C3. The forest walker starts with the move's side tiles

- **What it changes.** `Walker::new` seeds its `slots` with the built tile only. The move has already read its four
  side tiles (the neighbourhood). A side tile that is a node of the forest is read again by the walk: its position and
  its slot.
- **Gain.** On e and f, two side tiles are nodes of the forest (e: the first and the third curve; f: the starter and
  the straight under the last tile). An estimate from the unit costs (1.4), per side tile:
  - saved: its position read (76,840) and its slot read (76,840), 153,680 in all;
  - still paid: the decode. `Walker::expand` calls `tile_of_slot` on every expansion, cached or not: the decode is
    102,695 (read and decoded) less 76,840 (the read), 25,855;
  - added: one dictionary insert, to seed the slot (about 4,160, half of the measured insert and get, 8,319).

  Per tile that is 153,680 - 4,160 = 149,520. For two tiles, 2 x 149,520 = **-299,040 on e and on f**. This holds if
  the neighbourhood keeps the raw slot words it read. Packing them again (`StoreImpl::tile_slot`) would cost more.
  The two reads saved are syscalls, but each read's 76,840 also holds its key's hash (1.4), so the release gain is
  somewhat smaller.
- **Risk.** Low. The slots are the same words. The scan already relies on its cache.

### C4. The drawn tile's plan in `GameState`

- **What it changes.** The draw writes the drawn tile's slot (plan and id, 189,150). The next `build` or `discard`
  reads it back (116,205), and the build writes it again once it is placed. `GameState` has 17 bits free above the
  counters (bits 111 to 127 of its high half): the plan (8 bits) would live there, beside `held_tile`.
  - A build would then neither read nor pre-write the slot.
  - A discard keeps writing the discarded tile's slot, so that the `tiles` view still lists it.
  - The views (`game`, `tiles`, `builder`) read the held tile's plan from `GameState`.
- **Gain.** -305,355 per build; -116,205 per discard; -182,650 per spawn. Mostly syscalls, so most of it holds in
  release (1.4).
- **Risk.** Low to medium. Every test that forces a plan by writing the held tile's slot (`gas.cairo`, the e2e and
  golden harnesses) must write it into `GameState` instead. That churn is the main risk.
- **Changes.** The storage layout (the slot of a held tile is no longer written), not the ABI (the views return the
  same).

### C5. The fit check on one word per oriented plan

- **What it changes.** `assert_fits` reads two edge categories per side neighbour from the oriented rows. One 8-bit
  word per (plan, orientation), 2 bits per edge, would make each side a shift and a mask.
- **Gain.** A guess, with an upper bound. The fit check costs 242,422 with one side neighbour (a0, a, c, l) and
  361,324 with two (d, e, f). Each extra side therefore costs 361,324 - 242,422 = 118,902, for its two
  `edge_category` lookups (the tile's and the neighbour's) and the comparison. The fixed part is 242,422 - 118,902 =
  123,520 (the loop over four directions and the asserts).
  - If the word made a side free, the gain would be at most 118,902 per side neighbour: -0.12M with one, -0.24M with
    two.
  - It does not make a side free: the word is still one lookup per tile, by (plan, orientation). The gain is what a
    shift and a mask save over `edge_category`'s row lookup and extraction, which was not measured.

  So the earlier "-0.15M" is withdrawn as unsupported. It is compute, so the gain is smaller in release.
- **Risk.** Low. `test_placement_edge_categories_equal_the_layouts` already proves the categories against the
  layouts.

### C6. Positions packed by blocks of the board

- **What it changes.** `tile_positions` (one slot per `(game, x, y)`) becomes one slot per block of 5 x 5 positions:
  25 cells of 9 bits (the tile id and the wonder flag), 225 bits. The 3 x 3 window of a move touches 1, 2 or 4
  blocks, 1.96 on average for a uniform position ((1 + 2/5)^2). The walk's blocks are kept in its cache.
- **Gain (estimate).** A build reads 9 positions, 691,560 (9 x 76,840). It would read about 1.96 blocks (150,600)
  and decode 9 cells (about 0.09M in this profile, estimate): about -0.45M per build. f's scan reads about 17 more
  positions inside one to four blocks: about -1.0M more, -1.45M in all. The position write becomes the write of a
  block already read: still one write.
- **Risk.** Medium to high. Every reader of positions changes: `tile_at`, `wonder_at`, `tile_slot_at`,
  `tile_position`, the walker, the neighbourhood, spawn, the views. The audit is of the whole neighbour lookup.
- **Changes.** The storage layout; not the ABI (the indexer reads events).

### C7. A function-level profile first, for the compute

Placement (0.78M to 1.96M), the assessment's fixed part (0.48M to 0.79M) and the scan's compute (f: 11.37M, of which
about 2.5M is its 33 reads) are the largest compute pieces. The replay cannot split them further, and `cairo-profiler`
is not installed (1.5). Candidates, not estimated:

- `Structures` keeps two dictionaries (`records` and `loaded`), whose squash costs at the end of the move: 211,044
  for one record with a new `Structures`, 1.4;
- the scan per node: two lookups in the plan tables, the decode of every slot it meets, four dictionaries.

Once a profile exists, a later plan can estimate them.

### C8. One call fewer at game over

`finish` calls `Setup.wiring` (171,160) only for the economy's address, which `Setup` sets once for good
(`set_economy` refuses a second). `Challenge` could keep it after its first read: one read (76,840) instead of the
call, about -0.09M per game over. It duplicates P-53 ruling 2 (the wiring read from `Setup` in one call), so it is
the PM's.

### C9. Gate the release figures too

The ceilings of `gas.cairo` bound the test profile, about twice the release cost of a simple move at P7
(class-headroom). A player pays the release figure. A CI job running `snforge test test_gas_ --release` with release
ceilings would gate what is paid. It needs more than the VPS shim's 8 GB scope (1.5), so it belongs in CI or on the
Mac. No contract change.

## 5. For the PM to rule

1. **The first implementation PR: C1, C2 and C3.** They are low risk, change no rule, golden, parity fixture,
   storage layout or ABI, and each has its equality test. All three touch the structure code: a small correctness
   audit of the three. Expected, test profile:

   | Scenario | Now | After C1 to C3 (estimate) | Change |
   |---|---:|---:|---:|
   | a0 | 5,169,607 | about 4,610,000 | -0.56M (-10.8 %) |
   | a, c, d | 4,967,939 to 5,376,938 | unchanged | 0 |
   | e | 8,679,414 | about 8,380,000 | -0.30M (-3.4 %) |
   | f | 18,167,380 | about 17,870,000 | -0.30M (-1.6 %) |
   | l | 7,173,835 | about 6,620,000 | -0.56M (-7.8 %) |
   | g, i, k, s | 2,716,928 to 3,608,648 | unchanged | 0 |
   | m, n | 17,644,657, 18,497,677 | about 15,580,000, 16,440,000 | -2.06M (-11.7 %, -11.1 %) |

2. **The second PR: C4** (the held tile in `GameState`). Mostly syscalls, so most of its gain holds in release. It changes the
   layout: rule that it ships before the fresh Sepolia deployment (D-27), so that no migration is written.
3. **C6** (positions by blocks), the largest storage cut, after C4, with an audit plan of its own. Rule whether it is
   wanted before the fresh Sepolia deployment.
4. **C8** changes P-53's wiring (the economy address kept by `Challenge`): yours to rule.
5. **C9 and the release measure**: rule whether the gas figures and targets refer to release, measured in CI or on
   the Mac. That decides the order of the later cuts, since a storage cut keeps most of its gain in release (its bare
   syscalls) and a compute cut keeps less.
6. **None of the cuts above changes a rule.** The ones that would (a 128-bit seed, fewer quest entries, a lazy deck
   walk) are rejected in section 3.

Ruled: P-59.
