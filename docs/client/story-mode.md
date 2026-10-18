# Story mode: level plan (#546, PR 1)

Status: **proposal, for the owner's validation.** No screen is built yet. This page is the plan the
screens will be built from; the decks and scores below are computed, not estimated.

## How a level works

- A level is a fixed deck. It starts from the usual starter tile (a city to the north, a road from east
  to west), then the player draws the deck **in the order listed**, one tile at a time. There is no random
  draw: the same level is the same game every time, so its best score is a single number.
- The player places or discards each tile (a discard takes 50 points, at most the score). The level ends
  after the last tile. Tile names are the plan codes of the game (`RFFFRFCFR` and so on: the centre, then
  the eight spots around it clockwise from the north-west corner).
- **Stars** (owner decision, 2026-10-18): 1 = the level finished, 2 = at least 70 % of the best score
  (rounded up), 3 = the best score. This issue is client only: stars, no Cobbles (#548).
- The cell coordinates in the best lines are relative to the starter at (0, 0), north is +y. The
  orientation is the game's orientation name of the tile, the starter being `South`.

## The levels

| # | Title | Teaches | Deck, in draw order | Best (3 stars) | 2 stars |
|---|---|---|---|---|---|
| 1 | First stone | Placing a tile; edges must match; a road closes between two stops. | SFRFRFRFR SFRFRFRFR | **321** | 225 |
| 2 | Turn it around | The rotate and cancel bubble; a city closes when no edge is open. | CFFFCFFFC RFRFFFFFR FFFFFFCFF | **643** | 451 |
| 3 | Not this one | Discarding: free while your score is 0. | CCCCCCCCC FFCFFFCFF WFFFFFFFF | **419** | 294 |
| 4 | The price of a discard | The discard penalty: 50 points once you have a score. | FFCFFFCFF CCCCCCCCC RFRFRFCFF SFRFRFRFR | **788** | 552 |
| 5 | Under the trees | Forests: a forest scores for the roads and cities around it once it is enclosed (adjacency). | FFCFFFCFF CFFFCFFFC CFFFCFFFC | **740** | 518 |
| 6 | The long road | The size bonus: the longer the road, the more each tile is worth. | SFRFRFRFR RFFFRFFFR CCCCCFRFC WFFFFFFFR FFFFFFCFF | **1066** | 747 |
| 7 | Crossroads | Junctions and stops: a crossroads ends every road that reaches it. | SFRFRFCFR RFRFRFCFF WFFFFFFFR FFFFCCCFF SFRFRFRFR | **1285** | 900 |
| 8 | Hearth and field | A road, a city and the forest between them, closed by the same tile. | FFCFFFFFC RFRFFFCFR CCCCCFRFC CCCCCFRFC CCCCCCCCC | **1515** | 1061 |
| 9 | Patience | Discarding twice to keep the board open for a big finish. | RFFFRFFFR CCCCCFFFC WFFFFFFFF CCCCCFRFC CCCCCFRFC | **971** | 680 |
| 10 | The first village | Everything together: cities, roads, a junction and the size bonus. | FFFFCCCFF SFRFRFCFR FFCFFFFFC SFRFRFRFR FFCFFFFFC CFFFCFFFC | **1578** | 1105 |

Levels 1 to 4 have 3 to 5 tiles in play, as asked (the starter counts): the first levels are short and
explain the controls, the next ones add a rule at a time. The decks are in draw order, left to right.

### Level 1, First stone

> Tap a cell next to the board to place the tile in your hand. Roads must meet roads. A road scores once both of its ends are closed, and a crossroads closes every road that reaches it.

Best line (321 points; search: 14 positions):

1. `SFRFRFRFR` at (1, 0), North
2. `SFRFRFRFR` at (-1, 0), North: road of 3 = 321

### Level 2, Turn it around

> Tap a cell, then Rotate until the tile fits, or Cancel to pick another cell. Close the city at the top. One of your three tiles has nothing to do with it.

Best line (643 points; search: 253 positions):

1. `CFFFCFFFC` at (0, 1), East
2. `RFRFFFFFR` at (1, 0), North
3. `FFFFFFCFF` at (0, 2), North: city of 3 = 643

### Level 3, Not this one

> Some tiles only get in the way. Discard throws the tile away and draws the next. While you have no points it costs nothing.

Best line (419 points; search: 25 positions):

1. `CCCCCCCCC`: discard (free)
2. `FFCFFFCFF` at (0, 1), North: city of 2 = 419
3. `WFFFFFFFF` at (0, -1), North

### Level 4, The price of a discard

> Once you have points, a discard costs 50 of them. Sometimes it is still the right call: count what the next tile is worth.

Best line (788 points; search: 257 positions):

1. `FFCFFFCFF` at (0, 1), North: city of 2 = 419
2. `CCCCCCCCC`: discard (-50)
3. `RFRFRFCFF` at (0, 2), North: city of 2 = 419
4. `SFRFRFRFR` at (1, 0), North

### Level 5, Under the trees

> Forests fill the gaps between roads and cities. When a forest is fully surrounded it scores for the roads and cities around it.

Best line (740 points; search: 79 positions):

1. `FFCFFFCFF` at (0, 1), North: city of 2 = 419
2. `CFFFCFFFC` at (1, 1), East
3. `CFFFCFFFC` at (-1, 1), East: forest of 3 = 321

### Level 6, The long road

> A road of four tiles is worth more than two roads of two. Each tile in a structure raises its value by 2.35 %, so build long before you close.

Best line (1066 points; search: 12426 positions):

1. `SFRFRFRFR` at (1, 0), North
2. `RFFFRFFFR` at (-1, 0), North
3. `CCCCCFRFC` at (2, 0), East: road of 2 = 209
4. `WFFFFFFFR` at (-2, 0), South: road of 4 = 438
5. `FFFFFFCFF` at (0, 1), North: city of 2 = 419

### Level 7, Crossroads

> A junction splits a road in pieces, and each piece scores on its own. Plan so that one tile closes two roads at once.

Best line (1285 points; search: 25573 positions):

1. `SFRFRFCFR` at (1, 0), North
2. `RFRFRFCFF` at (1, 1), East
3. `WFFFFFFFR` at (-1, 0), South: road of 3 = 321
4. `FFFFCCCFF` at (0, 1), North: city of 3 = 643
5. `SFRFRFRFR` at (2, 1), North: road of 3 = 321

### Level 8, Hearth and field

> One tile can close a road and the forest next to it together. Look for the tile that finishes two structures.

Best line (1515 points; search: 28842 positions):

1. `FFCFFFFFC` at (0, 1), South: city of 2 = 419
2. `RFRFFFCFR` at (1, 0), North
3. `CCCCCFRFC` at (-1, 0), West
4. `CCCCCFRFC` at (1, 1), North: road of 4 = 438, forest of 4 = 658
5. `CCCCCCCCC` at (1, -1), North

### Level 9, Patience

> The best board is not always the fullest one. Throw away what does not belong, then finish with two tiles that close three structures.

Best line (971 points; search: 7145 positions):

1. `RFFFRFFFR`: discard (free)
2. `CCCCCFFFC` at (0, -1), South
3. `WFFFFFFFF`: discard (free)
4. `CCCCCFRFC` at (1, 0), East
5. `CCCCCFRFC` at (-1, 0), West: forest of 3 = 321, road of 3 = 321, forest of 4 = 329

### Level 10, The first village

> Six tiles, three cities and a road. Build the village the way you would in a real game, then compare your score with the best there is.

Best line (1578 points; search: 66446 positions):

1. `FFFFCCCFF` at (0, -1), North
2. `SFRFRFCFR` at (1, 0), South
3. `FFCFFFFFC` at (0, 1), South: city of 2 = 419
4. `SFRFRFRFR` at (-1, 0), North: road of 3 = 321
5. `FFCFFFFFC` at (1, 1), West: city of 2 = 419, city of 2 = 419
6. `CFFFCFFFC` at (0, -2), East

## How the best scores are found

`packages/game-core/src/engine/solver.ts` plays the engine itself (`EngineGame`, deck `story`): at each tile it
tries every legal cell and rotation, and a discard, depth first, and keeps the best final score. Nothing is
estimated: a score is what `build` and `discard` return, so it is the score a player gets.

Pruning, all exact (it never changes the optimum):

- A tile that looks the same in two rotations (a straight road, the full city, a wonder) is tried once per cell.
- On the last tile a discard is tried only when nothing fits: a build never takes points.

The search visits about 6 positions per extra tile, so it stays practical up to six drawn tiles (the finale: 66 446
positions, about a second). A deck of eight or more would need a bound on the score still to come, see
"Decisions to confirm". The test `__tests__/story-solver.test.ts` solves every level, checks the stored best
score, replays the best line on the engine, and checks that this page states each level's deck, best score and
2-star threshold. The run time of each level is printed by that test and is in the pull request.

## Decisions to confirm

1. **The level list** (10 levels, one rule each, finale last). Reorder, drop or reword freely: only the
   decks and numbers have to be recomputed, and the test will say which.
2. **In levels 1, 2 and 5 no outcome falls between 70 % and 100 %** (checked over every playable game:
   level 1 ends on 0, 209 or 321; level 2 on 0, 419 or 643; level 5 on 0, 319, 369, 419 or 740), so 2 stars and
   3 stars coincide there. That is acceptable for the first levels; if not, a decoy tile can allow a
   middle score. Levels 3 and 4 do have a 2-star outcome (369, and 738).
3. **No wonder level yet.** A wonder scores 900 once its eight neighbours are placed, so a level needs at
   least eight drawn tiles, beyond what the solver searches in seconds. Proposal: a level 11 once the
   solver has an upper bound (for instance, the best score each remaining tile could still add), or a wonder
   level whose neighbours are mostly given by the starter. Wonder tiles appear as decoys in levels 3, 6, 7 and 9.
4. **Starter**: every level uses the usual starter, so the board looks the same in every level and the engine
   needs nothing special. A level with another starter is possible if wanted.
5. **Showing the whole deck** (#540's deck sheet): the deck is fixed and known, so the sheet can list all of
   it. Proposal: show the next tile only in levels 1 to 5, and the whole deck from level 6, where planning
   ahead is what separates 2 from 3 stars.
6. **Intro texts** are short drafts for the coach marks of the screens PR; they are not final copy.

## Next

PR 2 and after wait for this plan's validation: the fixed-deck session in game-core, the level map,
intro, board with coach marks, end screen, device progress, First Stone at level 1, and the entry points.
