# Off-chain game engine (E1)

The rules of the contracts after D-18 (scoring without characters) and D-19 (tile owners, majority
scoring), in TypeScript, with no chain: Training and the tutorial run on it (D-21, D-22, P-49). Pure: no I/O,
no clock, no random source; a game follows from its seed, its deck and its moves. It runs in a browser and in node.
Its only dependency is `@scure/starknet` (Poseidon).

## API

```ts
import { EngineGame, OrientationType } from "@paved/game-core";

const game = EngineGame.start({ deck: "simple", seed: 0x1234n }); // or deck: "tutorial"
game.hand;                         // { id, plan } of the tile in hand
game.legalPlacements();            // every { orientation, x, y } the contract accepts
game.refusal({ orientation: OrientationType.North, x: 1, y: 0 }); // null, or the revert message
const move = game.build({ orientation: OrientationType.North, x: 1, y: 0 });
move.scored;                       // [{ category, size, points, player }], in emission order
game.discard();                    // 50 points at most the score
game.score; game.over; game.tileCount; game.built; game.discarded; game.counts;
```

- `EngineGame.start({ deck, seed, player?, tileLimit? })`. The engine does not derive seeds: Training passes
  a random one, Challenge its own (D-23). `player` (default `1n`) owns the starter and every tile built
  without an owner. `tileLimit` defaults to the deck's count (38 Simple, 10 Tutorial).
- Coordinates are relative to the starter tile (the contracts' `CENTER`, exported as `CENTER`); the reseeds
  hash the absolute coordinates, as on chain.
- `build(placement?, owner?)`: a Tutorial game takes its scripted placement (`scriptedPlacement()`); a given
  placement must equal it. `owner` sets the tile's owner (D-19).
- `discard()`, `surrender()`. Illegal moves throw `EngineError` with the contract's revert message
  (`Tile: already exists`, `Tile: no neighbors`, `Tile: cannot place`, `Game: is over`, ...).
- `clone()` copies a game (undo, look-ahead). `force(plan)` and `write(tile)` replace the plan in hand and
  write a placed tile without a move, as the Cairo tests do with `Store::set_tile`: for tests and scripted
  boards only.
- `drawFromBitmap(seed, number, bitmap)` and `withdrawExtra(...)` export the draw alone.

Types: plans, orientations and categories are game-core's `PlanType`, `OrientationType` and `CategoryType`
(their codes are the contracts'). `Scored.player` is a `bigint` (a felt). Internally the engine works on the
contracts' numeric codes and on the generated tables (which hold the wonders' spotless half-edges, the record
indexes and the adjacency the structure state needs), not on game-core's `Layout`, `Area` and `Move` classes,
which stay as they are for the UI.

## Sources it mirrors

| Part | Engine | Cairo (`contracts/src/`) |
|---|---|---|
| The draw | `draw.ts` | `helpers/random_deck.cairo` (`draw_from_bitmap`), `types/deck.cairo` (`tiles`), `models/game.cairo` (`draw_plan`, `reseed`) |
| Decks | `decks.ts` | `elements/decks/{base,simple}.cairo` (through game-core's `elements/decks`); the tutorial deck's Cairo source left with D-21 (last at 38f1c95), and `decks.ts` keeps its values |
| Tables | `tables.ts` (generated), `geometry.ts` | `structure/tables.cairo`, `structure/oriented.cairo` |
| Board, structures, forest scan | `structures.ts` | `structure/placement.cairo`, `state.cairo`, `record.cairo`, `forest.cairo` |
| Game, legality, scoring | `game.ts` | `models/game.cairo`, `components/playable.cairo`, `components/tutoriable.cairo`, `structure/assessment.cairo`, `helpers/multiplier.cairo` |
| Rules in prose | | `docs/architecture/structure-state.md`, "As built: D-18" and "D-19" |

Where the engine departs from the Cairo structure, on purpose:

- Records live in a `Map`, with no pages or packing; `sid = tile_id * 16 + record_index` and the merge rule
  (largest root, lowest id on a tie) are kept, so roots are the contract's.
- Each root also keeps its set of distinct tiles, merged by a union: the D-19 majority reads it. On chain the
  design note recommends a walk at scoring; both give the same count, the set costs nothing off chain.
- The starter tile is owned by the game's player (on chain: a zero owner means the game's player).
- `counts` are plain counts: the contract saturates them at their bit width in `GameState` (127, 63, 15, 63).
- The tournament, its leaderboard and the quests are not part of the engine.

## Tables

`tables.ts` is generated from `contracts/src/structure/tables.cairo`, never edited by hand:

```sh
cd packages/game-core && bun run generate:tables
```

`__tests__/engine-tables.test.ts` fails while it is out of date.

## Parity fixture

`__tests__/fixtures/parity.json` has the format of CORE's fixture (`docs/architecture/parity-fixture.md`):
`version`, `rules`, `games`; each game `name`, `source` (`golden`, `tutorial`, `differential`), `seed` (hex
felt), `tile_limit`, `forced`, `moves` (`drawn`, `plan`, `orientation` 0 to 4 with 0 a discard at `x, y` 0,
absolute `x, y`, `scored` as `{ category, size, points }` codes, `score` after the move) and `final`
(`score`, `built`, `discarded`, `tile_count`, `over`). E1's file is transcribed from the Cairo tests by a script,
except `tutorial_full`: its Cairo sources (`golden/tutorial.cairo`, `elements/decks/tutorial.cairo`) left the contracts
with D-21, so the script reads it from `scripts/tutorial-golden.frozen.ts`, transcribed once at 38f1c95:

```sh
cd packages/game-core && bun run generate:parity
```

It writes `parity.json` and `parity-sources.json` (the Cairo file and line of each game, of each seed and of
each `scored` entry the script adds, and what is not covered). Since it is a hand transcription, a value the
Cairo source does not hold as a literal is left out, and the test does not check it:

- `scored` only on the moves whose events a Cairo comment or `docs/measures/golden-games.md` states by hand
  (`forest_ring`, `forest_last`, `forest_caps`, `forest_both`, `forest_open`); the goldens assert scores, not
  events. CORE's recorded file will hold every move's events.
- `drawn` is `null` on the differential boards (they assert no draw, and `spawn_game` does not set the block
  time, so their seed is not in the source); their `score` is absent, and `final` holds only what the test
  asserts (`score`, or `score_above` for `score > 0`, an extension).

`__tests__/parity-fixture.ts` loads a fixture and replays a game; E2 changes only its `PARITY_FIXTURE` path to
`../../contracts/fixtures/parity.json`.
