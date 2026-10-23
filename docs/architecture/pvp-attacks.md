# PvP attacks: VRF draws, stars, crowns, replays (#643, design)

Track CORE's design for #643, part of the PvP plan #637. It builds on #638 (`DrawableComponent`, `vrf-draws.md`), #639
(`Matchmaker` and its pieces, `matchmaker.md`), #640 (`Village`, `village-territory.md`), #642 (`Rewards`,
`village-rewards.md`) and #644 (leagues, `leagues.md`).

The owner's decisions bind:

- **The deck** is the defender's placed tiles; **the territory** is the defender's (2026-10-20).
- **A true random draw for every tile** (VRF, #638), one transaction per tile (2026-10-20).
- **No characters and no abilities** (2026-10-20).
- **The shield as in #639**: 8 hours from the attack's start (2026-10-21).
- **More components with smaller scopes** (#639, point 5, 2026-10-21): composable pieces, each with its own storage and
  events, embedded by the systems that need them.

Everything else is a proposal. Section 9 lists the points the owner rules on. **Built on section 9's proposals while the
owner rules** (the PM's instruction of 2026-10-23); each is one switch point (section 10.1), and the ruling is applied
before the PR leaves draft.

## 1. Summary

- **A new system, `Arena`** (`contracts/src/systems/arena.cairo`). It embeds the engine for the finish's replay the way
  `Story` does (one game per finish in its own `PavedStorage`). `Story` (71.8 % of the CASM cap), `Village` (70.4 %) and
  `Challenge` (84.8 %) are not made bigger. `Arena` is an operator of `Matchmaker` (`set_operator`) and calls its
  `start_attack` and `settle`; it reads `Village` and `Story` through their existing views.
- **Three calls, plus a surrender.**
  - `start()`: `Matchmaker.start_attack` fixes the opponent drawn by `search`/`next` (#639) and shields it; the 0-star
    cost is **held** from the attacker's crowns at once (section 5); the defender's village is **snapshotted** (section 4);
    the first tile is drawn by the VRF.
  - `play(orientation, x, y)` or `play_discard()` (one entry point, `play(discard, orientation, x, y)`): records the
    placement of the tile in hand and draws the next one from the defender's tiles not yet drawn (a bitmap). It checks
    the cell and the fit against the moves already recorded (cheap reads), **not** the structure engine.
  - The **finish** runs in the transaction of the last move (nothing left to draw, so no VRF): it replays the moves once
    in a new game, scores, derives the stars, and calls `Matchmaker.settle(attacker, stars)`. `settle` releases the
    hold, moves the crowns, rolls the leagues, and reports the attack to `Setup.report_pvp`, which grants the village
    reward (#642: nothing to add for #643).
  - `surrender()`: ends the open attack at 0 stars, with no replay. Walking away without it leaves the hold in place and
    the attacker cannot start another attack (one at a time): quitting is a defeat, with no timeout to manage.
- **Replays come for free**: every move is in `Arena`'s storage and in an `AttackPlayed` event; the indexer stores them
  for the defender's log.
- **Stars**: at 70 / 85 / 110 % of the village's score at the start (proposal, open point 1).

## 2. The pieces (owner credo)

| Piece | File | Storage (flat, its own names) | Events | What it knows |
|---|---|---|---|---|
| `DrawableComponent` (exists, #638) | `components/drawable.cairo` | `vrf_provider`, `vrf_last_draw_tx` | `VrfProviderSet` | One VRF draw per transaction |
| `DeckableComponent` (new) | `components/deckable.cairo` | `deck_plans`, `deck_states` | none (the system's events carry the plan) | An attack's deck: the snapshot's plans, the bitmap of tiles drawn, the tile in hand; draws the next tile from a random |
| `RecordableComponent` (new) | `components/recordable.cairo` | `record_moves`, `record_cells` | `AttackPlayed` | An attack's moves in order, and each used cell's plan and orientation (the fit check); the replay source |
| `Arena` (the system) | `systems/arena.cairo` | `attacks`, `attack_counts`, `npc_levels`, `matchmaker`, `village`, `story` | `AttackOpened`, `AttackFinished`, `NpcLevelSet` | Who attacks whom, the snapshot's score and territory, the finish's replay, the callers |
| `CrownableComponent` (exists, #639; grows) | `components/crownable.cairo` | + `crown_holds` | + `CrownsHeld` | The hold of the 0-star cost (section 5) |
| `paved::matchmaker::stars` (new, pure) | `matchmaker/stars.cairo` | none | none | Stars from a score and a target, as `crowns.cairo` holds the crown curves |

- **No piece calls another.** `Arena` composes them, as `Matchmaker` composes its pieces: a move asks `RecordableComponent`
  whether the cell is free and fits, records it, then asks `DeckableComponent` for the next tile with the VRF's random.
  Each piece is tested alone (`component_state_for_testing`) and the composition through the system.
- **The engine is not a piece**: the finish's replay is the move loop of `Story::replay` (build or discard, place,
  assess, flush), written in `Arena` over the same `paved::structure` functions. Extracting it to a shared function
  would change `Story`'s class; proposed as a follow-up only if both copies drift.

## 3. Storage and records

New contract, new names only (`upgrades.md`, "Storage layout discipline"); `Arena` is upgradable (OpenZeppelin's
`upgrade`, the repository's `OwnableComponent`), and a pin test reads each variable at the raw address of its name.
`Matchmaker` gains one variable, `crown_holds` (appended, a new name).

| Variable | Key | Value |
|---|---|---|
| `attacks` (system) | attacker | the open or last attack: `id` [0, 32) · `status` [32, 40) (0 none, 1 open, 2 finished, 3 surrendered) · `npc` [40, 48) (0 a player) · `parcels` [48, 56) (the defender's parcels at the start) · `target` [64, 96) (the defender's score at the start) · `score` [96, 128) · `stars` [128, 136) |
| `attack_defenders` (system) | attacker | the defender (an address does not fit beside the fields) |
| `attack_counts` (system) | attacker | attacks started, so `id` names every attack of an attacker (`(attacker, id)`) |
| `npc_levels` (system) | NPC id (1 to 255) | the Story level an NPC village plays: `campaign` [0, 8) · `level` [8, 16) |
| `deck_plans` (deck) | `(attacker, id, word)` | the snapshot's plans, 5 bits each, 50 per felt (2 felts for 100 tiles, `MAX_CELLS_LIMIT`) |
| `deck_states` (deck) | `(attacker, id)` | `size` [0, 8) · `drawn` [8, 108) (bitmap) · `count` [108, 116) (tiles drawn) · `hand` [116, 124) (the tile in hand, its index) |
| `record_moves` (record) | `(attacker, id, index)` | move `index`: `discard` [0] · `orientation` [1, 4) · `x` [8, 40) · `y` [40, 72) · `plan` [72, 80) |
| `record_cells` (record) | `(attacker, id, x, y)` | the plan [0, 8) and orientation [8, 16) placed there, 0: free |
| `crown_holds` (crowns) | attacker | the 0-star cost held from its crowns during its open attack |

Keys carry `(attacker, id)`, so an attack's moves and cells are never overwritten by the next one: the replay of any
past attack can be read back from storage, and no cleanup write is spent.

## 4. The village during an attack (open point 7): a snapshot, proposed

The defender keeps playing while attacked: rewards place tiles (`Village.place`), `demolish` rebuilds the village,
`buy_parcel` grows it. A **lock** would refuse those calls until the attack ends; with no timeout an attacker who never
finishes would hold the defender's village frozen (a grief no shield prevents), and `Village` would grow (70.4 % of the
cap) by a lock check in three calls and a new caller. A **snapshot** costs a few writes at the start and leaves `Village`
untouched:

- **The territory needs no copy.** It only grows: a parcel, once bought, is never sold (`village-territory.md`). So the
  snapshot is the parcel count at the start: a cell is in the attacked territory iff it is in the 3 x 3 around `CENTER`
  or its parcel number (`Village.is_owned`; the parcel's number from a new view, or `cells` read once) is at most
  `parcels`. Proposed: a small view `Village.parcel_of(player_id, x, y) -> u8`, the only change to `Village` (a read).
- **The deck is copied once**: `Village.tiles(player_id)` at the start, the starter excluded, its plans packed in
  `deck_plans` (2 writes at most, 1 for up to 50 tiles).
- **The target is copied once**: `Village.village(player_id).score`, into `attacks.target`.

Proposed: **the snapshot**. The attack then plays exactly the village that was drawn, whatever the defender does.

## 5. The crowns: the hold at the start

The issue proposes escrowing the crowns of a defeat at the start, so quitting is a defeat. Built in `CrownableComponent`,
the piece that owns the counts:

- **At `start_attack`**: `hold(attacker, cost)` takes `min(cost, crowns)` from the attacker's count into `crown_holds`
  (the attacker's bucket follows). Emits `CrownsHeld`.
- **At `settle`**: `release(attacker)` gives the hold back first, then `settle` runs exactly as today: the season roll,
  the crowns of the stars or the 0-star cost, the buckets, the leagues, the Cobbles, `report_pvp`. So the outcome is the
  same as without the hold; the hold only removes the reason to walk away. A season that turns during an attack rolls the
  attacker on its real count, the hold included.
- **Why a hold, not a 0-star settlement at the start reversed by a win**: the defender may lose crowns meanwhile (it can
  attack, and lose, behind its shield), so a reversal could find too few crowns to take back.
- Walking away leaves the hold in place: the defender's 0-star gain waits for the attacker's `surrender` or next finish.
  No timeout (the issue's proposal); open point 4 asks whether the owner wants one.
- **`Matchmaker.start_attack` and `settle` keep their signatures**; the hold is internal, plus a view `held(attacker)`.

## 6. The flow, call by call

| Call | Who | Checks | Effects |
|---|---|---|---|
| `start()` | the attacker | no open attack (`Arena: attack open`); an opponent drawn and the start valid (`Matchmaker.start_attack`'s checks); a player's defender has a village with a tile (`Arena: empty village`); an NPC defender has a level (`Arena: no npc level`) | `start_attack` (the shield, the hold); the snapshot; the attack opened; the first tile drawn (VRF, `draw_random('ATTACK', attacker, id * 128 + 0)`); emits `AttackOpened` |
| `play(discard, orientation, x, y)` | the attacker | an open attack (`Arena: no attack`); a build: orientation 1 to 4, the cell in the snapshot's territory (a player's defender; an NPC's board is open as in Story), free, a side neighbour, every facing edge matching (`Tile: no neighbors`, `Tile: cannot place`), from `record_cells` and the starter | the move recorded (emits `AttackPlayed`); the next tile drawn (VRF) if any is left; otherwise the finish |
| finish (internal, the last `play`) | | | the replay; the score; the stars; `Matchmaker.settle`; emits `AttackFinished` |
| `surrender()` | the attacker | an open attack | `Matchmaker.settle(attacker, 0)`; emits `AttackFinished` (stars 0, `surrendered`) |

- **One VRF draw per transaction**: `start` draws tile 1; each `play` but the last draws the next. The salt is
  `(ATTACK, attacker, id * 128 + draw)`, fixed by the attack and the draw's index, so a reverted and resent move draws
  the same tile. The client puts `request_random(Arena, Salt(vrfSalt('ATTACK', attacker, id * 128 + n)))` first.
- **The draw**: the random modulo the tiles left, then the index of that rank among the bitmap's zero bits.
- **A move after the end** fails (`Arena: no attack`), a second `start` while one is open fails (`Arena: attack open`),
  and `Matchmaker.search`/`next` already refuse a started attack.
- **Discards**: allowed, with the engine's discard penalty, as in every mode (the measures of #637 counted the
  attacker's best placement; a tile that fits nowhere must be discardable).
- **The finish's replay** writes the starter (from the snapshot's village: the usual starter at `CENTER`; an NPC: its
  level's starter and placed tiles), then builds or discards each move in order. The fit was checked at each move, so the
  replay cannot fail on it; it re-checks anyway, since the replay is the engine's own build.
- **An NPC defender** (an address 1 to 255, #639): the owner maps it to a Story level (`set_npc_level`); the deck is the
  level's plans, the board is open (no territory), the target the level's `target`.

## 7. Stars

`stars_of(score, target)` in `paved::matchmaker::stars`: 3 at `score * 100 >= target * 110`, 2 at 85, 1 at 70, else 0.
A score of 0 earns no star, whatever the target (an attack that only discards wins nothing); a village whose tiles close
nothing has a target of 0, so any score above 0 takes 3 stars against it. Fuzzed: monotone in the score, bounded by 3,
no overflow at `u32` counts (the products are computed in `u64`).

## 8. Events, client, measures

- **Events** (`Arena`): `AttackOpened { #[key] attacker, #[key] defender, id, npc, offer, cost, target, tiles }`,
  `AttackPlayed { #[key] attacker, id, index, plan, discard, orientation, x, y }` (`RecordableComponent`),
  `AttackFinished { #[key] attacker, #[key] defender, id, score, stars, crowns_won, crowns_lost, surrendered }`,
  `NpcLevelSet`. `Matchmaker` adds `CrownsHeld`; its `AttackStarted` and `CrownsSettled` are unchanged.
- **The indexer**: `pvp_attacks` (one row per attack, keyed `(attacker, id)`, the defender indexed: the defence log),
  `pvp_attack_moves` (the replay), from the events above.
- **`@paved/chain`**: the views `attack(attacker)`, `attack_moves(attacker, id)`, `hand(attacker)`; the writes `start`,
  `play` (each behind `withVrfRequest`, `vrfSalt('ATTACK', attacker, id * 128 + n)`) and `surrender`.
- **Measures**: CASM of `Arena` (new) and `Matchmaker` (the hold) against P-44 (`class-headroom.md`); gas in
  `contracts/tests/gas.cairo` of `start`, a middle `play`, the last `play` with the finish (38 tiles), `surrender`.
  The finish should cost about `Story.submit_run` (160.6 M L2 gas for 38 tiles) plus `settle` (3.1 M).
- **Tests**: a full attack against a village and against an NPC; quitting (surrender; walking away keeps the hold and
  blocks the next start); a move after the end; a second attack while one is open; a resent draw draws the same tile; the
  snapshot holds when the defender places or demolishes during the attack; stars fuzzed; the hold fuzzed with `settle`
  (crowns conserved between players at every count); storage pinned by name.

## 9. Open points for the owner

1. **Star thresholds** (#637, open point 1): **70 / 85 / 110 %** of the village's score (measured: 1 star in 46 to 57 %
   of attacks, 2 in 25 to 31 %, 3 in 7 to 14 %, for every shape tested), or the first guess **80 / 90 / 100 %** (3 stars
   almost as often as 2). Proposed: 70 / 85 / 110, as three constants.
2. **The village during an attack** (#637, open point 7): **a snapshot at the start** (proposed, section 4: no grief by
   a lock, `Village` untouched but for one view), or a lock until the end.
3. **The crown offer's bounds** (#637, open point 8): settled by #639's ruling (the offer 1 to 59, the 0-star cost 0 to 39,
   reverse-engineered from Clash of Clans). Proposed: nothing more for #643; the hold uses the cost fixed at the draw.
4. **No timeout** (the issue's proposal): an attack left open keeps its hold and blocks its attacker until `surrender`.
   Proposed as is; the alternative is a `surrender` anyone may call once the defender's shield has expired (8 hours).
5. **NPC villages**: their deck and target are their Story level's (section 6). Proposed as is.

## 10. As built

### 10.1 The switch points of section 9

| Point | Built as proposed | Where an amendment goes |
|---|---|---|
| 1. Stars | 70 / 85 / 110 % | `ONE_STAR_PERCENT`, `TWO_STARS_PERCENT`, `THREE_STARS_PERCENT` in `contracts/src/matchmaker/stars.cairo` (and `STAR_PERCENTS` in `@paved/chain`'s `arena.ts`) |
| 2. The village during an attack | The snapshot | `Arena`'s `snapshot_village` (a lock would add a check to `Village.place`, `demolish` and `buy_parcel`) |
| 3. The offer's bounds | #639's (1 to 59, cost 0 to 39) | `paved::matchmaker::crowns` (unchanged here) |
| 4. No timeout | `ATTACK_TIMEOUT = 0` | `ATTACK_TIMEOUT` in `contracts/src/systems/arena.cairo`: a non-zero value opens `expire(attacker)` to anyone that many seconds after the start (built and tested at 0: it refuses) |
| 5. NPC villages | From their Story level | `NPC_ATTACKS` and `snapshot_npc` in `arena.cairo` |

### 10.2 Departures from sections 2 to 8

- **The fit check reads a board, not `record_cells`.** Each attack gets a board, a game id of `Arena`'s `PavedStorage`
  holding only the tiles' words and positions (no structure state): the starter (and a Story level's placed tiles) at
  the start, each built tile at its move. A move reads its 8 neighbours there and runs the engine's own
  `placement::assert_fits`, so the check is exactly the engine's and the replay cannot fail on a fit. The record piece
  keeps only the moves (`record_moves`, `record_sizes`).
- **The finish's replay** reads the starter and the placed tiles from the board, so an NPC's level corrected by the owner
  during an attack does not change it.
- **Storage** (`Arena`): `attacks` packs `id` [0, 32) · `status` [32, 40) · `npc` [40, 48) · `parcels` [48, 56) · `target`
  [56, 88) · `board` [88, 120) · `placed` [120, 128) in the low half and `started_at` [0, 64) · `score` [64, 96) · `stars`
  [96, 104) in the high half; `attack_defenders`; `npc_levels` (`campaign` [0, 8) · `level` [8, 16)); `matchmaker`,
  `village`, `story`. The deck: `deck_plans` (31 plans a page, a byte each), `deck_states` (`size`, `drawn`, `hand` in
  the low half, the bitmap in the high half). `Matchmaker`: `crown_holds`. Every name is pinned
  (`test_arena_storage_is_pinned_by_name`).
- **Events**: `AttackOpened` carries no cost (`Matchmaker`'s `AttackStarted` and `CrownsHeld` have it); `TileDrawn`
  (`DeckableComponent`) says which plan is in hand after each draw; `CrownsReleased` (the hold given back) beside
  `CrownsHeld`; `WiringSet` for the owner's wiring.
- **The views** are the pieces': `deck(attacker, id)` (the hand is `deck.hand`), `moves(attacker, id)`, and `Arena`'s
  `attack(attacker)` and `npc_level(npc_id)`; `Matchmaker`'s `held(village)`; `Village`'s `parcel_of(player_id, x, y)`.
- **The season roll counts the hold** (since review 1, 10.8): `Matchmaker.roll_village` gives a held village's hold back,
  rolls its whole count, then holds again; `settle` gives the hold back first and then rolls.
- **`start_attack` and `settle` keep their signatures**: `Arena` reads the defender and the offer from `start_attack`.

### 10.3 Gas (L2 gas of the call alone, test profile, snforge 0.64.0, VPS, 2026-10-23; ceilings at measured + 5 %)

| Test | Call | L2 gas |
|---|---|---:|
| `test_arena_gas_start_and_play` | `start` on a village of 38 stops: `start_attack`, the snapshot (38 tiles read, 2 deck pages written), the first draw; since review 1 the opponent's check first (`current_match`, the village's tiles) | 18,697,819 |
| `test_arena_gas_start_and_play` | a middle `play`: the territory's read, the fit on the board, the move recorded, the next draw | 4,454,802 (3,994,902 before review 1, the same code in a recompiled class) |
| `test_arena_gas_finish_38` | the last `play` of 38: its check, the replay of 38 moves, the stars, `settle` (the crowns, `report_pvp`, the reward's grant) | 330,527,982 |
| `test_arena_gas_surrender` | `surrender`: `settle` at 0 stars | 3,821,891 |
| z19 (`contracts/tests/gas.cairo`) | `Matchmaker.start_attack`, worst case, now with the hold | 4,628,847 (was 4,421,401 in #639, +4.7 %) |
| z20 | `Matchmaker.settle`, worst case, the hold given back first | 4,996,496 (ceiling 4,883,423 before, reset) |
| z32 | `Matchmaker.settle` across a season's end | 6,140,608 (ceiling 5,959,147 before, reset) |

The finish of 38 tiles is 29.8 % of the 1.11 x 10^9 a transaction may use, about twice `Story.submit_run`'s 160.6 M: its
village of crossroads closes a road at almost every move (every closed structure is assessed), where Story's measured
line closed few. It is the worst shape the territory allows, not a typical one; a village of 99 tiles (the
`MAX_CELLS_LIMIT` of 100 cells) would cost about 2.6 times that by its tile count (an estimate, not measured), under
the transaction's limit; the owner's cap is 38 cells today.

### 10.4 Size

`scripts/class-sizes.sh` (`class-headroom.md`, "After PVP-ATTACKS", after review 1): `Arena` 65,383 CASM felts, 79.8 % of
the Starknet cap and 8,345 under P-44's; `Matchmaker` 33,244 to 35,392 (+2,148); `Village` 57,691 to 58,019 (+328,
`parcel_of`). Every other class is unchanged.

### 10.5 Tests

`contracts/src/tests/arena.cairo` (coverage group `tests-arena`): the start (the snapshot, the shield, the hold, the first
draw equal to the VRF mock's random of the attack's salt, no draw, an empty village); the moves (a full attack settled
and its reward granted, discards, outside the territory, a misfit, a parcel bought before and after the start); quitting
(a surrender is a defeat; an attack left open keeps its hold and blocks a second start and any draw); a move after the
end and after a surrender; no timeout; the attacks' numbers; the NPC villages on their Story level; the owner's calls;
the storage pinned by name; the stars at their thresholds and fuzzed; the pieces alone: the hold (at most the count,
not twice, and fuzzed: holding then giving back changes no settlement and conserves the crowns), the deck (every tile
drawn once, fuzzed on a full deck of 99), the record's round trip; the gas. Ran in a scratch copy of the crate that keeps
every source but only the touched test modules (`arena`, `leagues`, `matchmaker`, `matchmaker_system`, `rewards`,
`setup`, `story`, `village`): 309 tests pass, peak RSS 5.97 GB under `prlimit --as=16106127360`; the 43 `test_gas_z*` of
`contracts/tests/gas.cairo` pass with z20 and z32 reset (peak RSS 4.16 GB). CI runs the whole suite.

### 10.6 Audit, correctness and security (crowns move, Cobbles through the reward)

- **Access.**
  - `start`, `play` and `surrender` act on the caller's own attack only (`get_caller_address`); `expire` is closed
    while `ATTACK_TIMEOUT` is 0.
  - `Arena` is an operator of `Matchmaker`; it starts only the caller's match, and settles only an attack it opened, at
    the stars of its own replay or 0. No caller chooses the stars, the score or the defender.
  - The owner sets the wiring, the VRF provider and the NPCs' levels, and upgrades; no owner call moves crowns or Cobbles.
- **Crowns.**
  - They move only in `Matchmaker`, as in #639: the hold takes at most the attacker's count at the start; `settle`
    gives it back first, then settles exactly as without a hold (fuzzed at every count, stars and terms), so crowns stay
    conserved between players and never negative; the hold's return is capped by what the count can still hold.
  - A hold cannot be taken twice (`Crowns: already held`), and an attacker cannot open a second attack, so one hold
    per village at most.
  - Walking away keeps the hold: the attacker loses the cost's crowns until it surrenders, and it cannot draw or start
    again, so quitting gains nothing over a defeat. The defender receives the cost when the attacker surrenders.
- **The draw.** Every tile is a VRF draw of the salt `(ATTACK, attacker, id * 128 + n)`: fixed by the attack and the draw,
  so a reverted and resent move draws the same tile, and no player choice enters it. The deck draws among the tiles not
  yet drawn (`draw_from_bitmap`), each once (fuzzed on a full deck). One draw per transaction (the component's rule).
- **The move.** Every build is checked before it is recorded: the orientation, the position's bounds, the snapshot's
  territory (the 9 cells of the start or a parcel numbered at most the snapshot's count), a free cell, a side neighbour
  and every facing edge (the engine's `assert_fits`). So the finish's replay builds only legal moves, and its score is
  the engine's.
- **The snapshot.** The deck, the target and the parcel count are copied at the start; the defender's placements,
  demolitions and purchases during the attack change none of them (`test_arena_snapshot_holds_when_the_village_grows`).
- **The reward.** `settle` reports the attack to `Setup.report_pvp`, which grants the village reward under the daily cap
  (#642): one per attack settled, a surrender included, as #642 counts every attack. **A point for the review**: a
  surrender comes right after the start, so an attacker can trade the 0-star cost for a reward in two transactions, up
  to the daily cap (10). It is #642's rule (every PvP attack grants, `GRANTS_PVP`), unchanged here; requiring at least
  one move, or one star, before `report_pvp` grants would be a change of #642's grant or of `Matchmaker.settle`.
- **Liveness.** No call of an attack loops over anything but its own deck (at most 99) and moves (at most 99); the
  finish of the largest territory fits a transaction (10.3).

### 10.7 Follow-ups this PR names

As #639 and #642 did (allowed by #637's constraints), the deployment and the indexer follow `Matchmaker`'s deployment:

- `scripts/deploy.sh` and the deployment files: `Arena` declared and wired (`Matchmaker.set_operator(Arena)`, the VRF
  provider, the NPC levels), after `Matchmaker`, `Village` and `Rewards`.
- `@paved/indexer`: the tables `pvp_attacks` (one row per attack, keyed `(attacker, id)`, the defender indexed: the
  defence log) and `pvp_attack_moves` (the replays), from `AttackOpened`, `AttackPlayed`, `TileDrawn` and
  `AttackFinished`, beside #639's `pvp_villages`, `pvp_matches`, `pvp_shields`. The indexer reads only the contracts of a
  deployment file, and neither `Matchmaker` nor `Arena` is in one yet.
- `@paved/chain` is in this PR: `packages/chain/src/arena.ts` (the writes `start`, `play` and `surrender`, each draw
  behind `withVrfRequest`; the views' decoders; `starsOf`).

### 10.8 Review 1

- **An opponent that cannot be attacked is skipped, not a trap** (critical). `start` reverted on an empty village (or a
  village never founded, or an NPC with no level), which left the match drawn: `search` refused it and only "Next"
  (1 Cobble) could draw again. Now `start` first checks the drawn opponent (`is_playable`); if it cannot be attacked,
  `Arena` calls the new operator call `Matchmaker.cancel_match(attacker)` (the match dropped, `MatchCancelled`), records
  the attack as `STATUS_SKIPPED` (`AttackSkipped`), consumes the VRF draw the client requested (Cartridge's appended
  `assert_consumed` needs it), and returns without a shield or a hold. The next `search` is free.
- **The season roll counts the hold** (major). The roll used to be skipped while a hold was up, so a held village
  kept its pre-reset count for the draws, the terms and incoming settlements. Now `roll_village` gives the hold back,
  rolls the whole count, takes the hold again from the rolled count and moves the bucket to the count less the hold;
  the `league` view computes the same. `settle` still gives the hold back before its rolls.
- Tests: `test_arena_start_on_an_empty_village_skips_it`, `test_arena_start_on_a_village_never_founded_skips_it`,
  `test_arena_npc_without_a_level_is_skipped`, `test_season_roll_counts_the_hold`, `test_cancel_match_frees_the_search`,
  `test_cancel_match_by_a_stranger_or_once_started_fails`: 313 tests of the touched modules pass (peak RSS 5.99 GB).
