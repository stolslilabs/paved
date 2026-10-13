# Parity fixture (planned)

D-22 and P-49 ruling 3 (`docs/programme/DECISIONS.md`, 2026-10-13): the client reproduces the game engine off chain
(the free Training mode, CLIENT's), and must give the same scores as the contracts after D-18 and D-19. CORE
publishes the golden games and the differential games as one fixture file that both sides replay: the contract in
`snforge`, the client in its CI. CORE keeps it current when a rule changes. This note is the design only; part B of
D-21 builds it. Inventory of the tutorial's removal: `leaderboard.md`, "D-21".

## Path

`contracts/fixtures/parity.json`, in the repository, next to the package that writes it. `snforge`'s file reads are
relative to the package root (`contracts/`), and the client's tests read it by a relative path from
`packages/game-core` (`../../contracts/fixtures/parity.json`), as `packages/chain/src/abis.ts:2` already reads
`contracts/abis/*.json`.

## Format

JSON, one game per entry. Every number that a `u32` or a `u8` holds is a JSON number; a `felt252` (the seed) is a
`0x` hex string. Codes are those of the contracts: `plan` the `Plan` code (`types/plan.cairo`, 1 = `CCCCCCCCC`, ...),
`orientation` 0 none, 1 north, 2 east, 3 south, 4 west (`public-interface.md`, "Conventions"), `category` the u8 of
`Category` (`types/category.cairo:65-70`: 1 forest, 2 road, 3 city, 5 wonder).

```json
{
  "version": 1,
  "rules": "D-19",
  "games": [
    {
      "name": "daily_road6",
      "source": "golden",
      "seed": "0x...",
      "tile_limit": 72,
      "forced": true,
      "moves": [
        {
          "drawn": 41, "plan": 41, "orientation": 2, "x": 2147483648, "y": 2147483647,
          "scored": [],
          "score": 0
        },
        {
          "drawn": 12, "plan": 12, "orientation": 4, "x": 2147483652, "y": 2147483647,
          "scored": [{ "category": 2, "size": 6, "points": 689 }],
          "score": 689
        }
      ],
      "final": { "score": 689, "built": 5, "discarded": 0, "tile_count": 6, "over": false }
    }
  ]
}
```

(The figures of the example are illustrative, not the case's.)

- `seed`: the game's initial seed, as `Game::start` stores it (`models/game.cairo:155-175`), whatever source gave it
  (the day seed before D-23, the token seed after). The client draws from it with the same `draw_from_bitmap` and
  reseeds with Poseidon(seed, x, y) after every placement (`GameImpl::reseed`, `models/game.cairo:183-189`), so the
  `drawn` plans check the client's draw too.
- `forced`: `true` when moves replace the drawn plan (`plan` differs from `drawn`, the golden cases of forced plans
  and the differential boards). The client plays `plan`; it still checks `drawn`.
- A move with `orientation` 0 is a discard (`x`, `y` 0); its `score` is after the discard penalty.
- `scored`: the `Scored` events of the move, in emission order, each `{ category, size, points }` (the event's data,
  `events.cairo:64-72`, without `player_id`: single player). A forest that closes with 0 points still appears.
- `score`: the game score after the move; `final`: the counters at the end.

## Sources

- **The 20 golden tests** of `docs/measures/golden-games.md` (`contracts/src/tests/golden/`): they replay 11 games
  (the `*_structures_agree` tests replay the same games with the oracle's check): `daily_city5`, `daily_road6`,
  `daily_mixed`, `daily_deck` (discards), `forest_ring`, `forest_caps`, `forest_both`, `forest_open`, `forest_last`,
  `daily_full_deck` (38 tiles, real deck), and `tutorial_full`. The 10 non-tutorial games are replayed by the
  contract and kept current; `tutorial_full` is exported once, before D-21 removes its deck, with `"source":
  "tutorial"`, and is not replayed by the contract afterwards (its deck lives in the client from then on).
  **As built (D-21):** the tutorial game is no longer in CORE's fixture; CLIENT keeps it frozen, `tutorial_full`
  (2,794) and its scripted placements, as a game-core fixture taken from 38f1c95.
- **The differential games** (`contracts/src/tests/differential.cairo`): the gas scenarios a0, a, b (one board), c,
  d, e, f, `two_areas_of_one_tile_join_one_structure` and `wonder_ring`, each a Daily board with the plan written over
  the tile in hand (`forced: true`). Their tutorial board goes with D-21.

## How a Cairo test keeps it current

A test `tests::parity` reads the file (`snforge_std`'s `fs` module, `read_txt`; part B checks the reader against
snforge 0.64, and falls back to a flat felt list if the JSON reader's key order gets in the way), and for each
replayed game spawns a Challenge game with a test `SeedSource` that gives the entry's `seed` (`spawn_with`,
`components/hostable.cairo:52`), plays every move through the real entry points, and asserts, per move, the drawn
plan, the `Scored` events (`spy_events`) and the score, then the final counters. A rule change makes it fail at the
first move that diverges; the PR that changes the rule regenerates the file (a record mode, as `RECORD` in
`tests/golden/harness.cairo`, prints it) and says so. The goldens stay the source of truth: the fixture is their
data in a form a second engine can read, and a test checks that the two agree, so neither drifts.

## What the client's CI does with it

`@paved/game-core` (or the package that holds the off-chain engine) has a test that loads the file and, for every
game, runs the off-chain engine from `seed`, plays the moves, and asserts the same per-move `drawn`, `scored` and
`score`, and the final counters. It runs in the client's CI on a change to the engine or to the fixture (path filter
`contracts/fixtures/parity.json`), so a rule change on chain that the client has not followed fails the client's CI,
not a player's game.

## Scope

Single-player games only: every tile is the player's (D-19, P-47 (4)), so the owner of a tile is not in the file. When
the multiplayer mode is planned and needs owners (D-19's seat), the format gains a seat per move and a per-player
score; `version` goes to 2.
