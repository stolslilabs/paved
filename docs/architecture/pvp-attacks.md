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

Everything else is a proposal. Section 9 lists the points the owner rules on; the code follows the ruling.

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

`stars(score, target)` in `paved::matchmaker::stars`: 3 at `score * 100 >= target * 110`, 2 at 85, 1 at 70, else 0.
A target of 0 cannot happen for a player (a village with a tile is required, and the starter alone scores nothing, so
the target is the village's score): proposed, a target of 0 gives 3 stars for any score above 0, 1 star at 0. Fuzzed:
monotone in the score, bounded by 3, no overflow at `u32` counts (the product is computed in `u64`).

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
