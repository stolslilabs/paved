# Story mode: campaigns (#546)

Status: **proposal, for the owner's validation**, built client side in PR 2 (the screens, the levels, the stars and the
progress on the device). The decks and scores below are computed by the engine, not estimated; the decisions at the end
are still open. The Cairo side (the levels on chain, the end-of-run submission) is a separate pull request (see "Two pull
requests").

## How a level works

- A level is a fixed deck. It starts from the usual starter tile (a city to the north, a road from east to west), then the
  player draws the deck **in the order listed**, one tile at a time (engine deck `story`: no withdrawal, no reseed). The
  same level is the same game every time, so its best score is a single number, and it is always reachable.
- The player places or discards each tile (a discard takes 50 points, at most the score). The level ends after the last
  tile. Tile names are the plan codes of the game (`RFFFRFCFR` and so on: the centre, then the eight spots around it
  clockwise from the north-west corner).
- Cell coordinates in the lines are relative to the starter at (0, 0), north is +y. A stored line is one string: a build is
  the orientation's initial and the cell (`N1,0`), a discard is `D` (`packages/game-core/src/story/line.ts`).
- The plan lives in `packages/game-core/src/story/plan.ts`; a test (`__tests__/story-solver.test.ts`) checks that this page
  states every level's deck, target and 2-star score, replays every stored line to its target, and re-solves every exact
  level.

## Stars and unlocks (owner, 2026-10-18 and 2026-10-19)

- **3 stars** = the target, the maximum score of the level: the exact optimum where the exhaustive solver finishes, the
  **best known** score elsewhere (see "How the targets are set"). **2 stars** = at least 70 % of the target, rounded up.
  **1 star** = the level finished. A score above a best-known target earns 3 stars, and the end screen says the player beat
  the best known score.
- **Levels unlock in order**: a level is locked until the one before it is finished (1 star).
- **A campaign unlocks on stars**: the stars held over every level of the campaigns before it must reach 2 x their number
  of levels (2 stars per level on average). The second campaign opens at 22 stars over the Tutorial's 11 levels.
- Stars never go down: a replay keeps the best score, its stars and its run.

## The campaigns

About 50 levels in all (owner, amendment 2): each campaign has its own number of levels, from its definition; nothing in
game-core or the screens assumes a count. Proposed split, 50 levels:

| # | Campaign | Levels | Tiles per level (the starter included) | Targets | State |
|---|---|---|---|---|---|
| 1 | Tutorial | 11 | 3 to 7: one rule per level | exact optimum | built (PR 2) |
| 2 | Open Country | 11 | 10, 13, 16, 19, 22, 25, 28, 31, 34, 36, 38 | best known | built (PR 2) |
| 3 | (name to find) | 16 | 38 every level | best known | later |
| 4 | (name to find) | 12 | 72 every level: the whole deck, nothing withdrawn | best known | later |

Why this split:

- **Tutorial, 11**: kept as the owner asked; one level per rule or control.
- **Open Country, 11**: a ramp from 10 to 38 tiles. Eleven steps of about three tiles keep each level a little longer than the
  last without repeating a size; more levels would only add near-duplicates of the same size, fewer would make the jumps
  large (a 10-tile level to a 20-tile one).
- **Campaign 3, 16**: full games of 38 tiles, the length of a Challenge. This is the body of the mode, the levels a player
  replays for 3 stars; it gets the most levels.
- **Campaign 4, 12**: the whole 72-tile deck, about twice a full game per level, for the players who finished the rest.
  Fewer levels, each one long.

With #548's rewards (5, 10 and 15 Cobbles for the first, second and third star, 30 per level at most), 50 levels pay
1,500 Cobbles in all. The unlock rule follows the counts: campaign 2 opens at 22 stars (2 x 11), campaign 3 at 44
(2 x 22), campaign 4 at 76 (2 x 38).

One progression: the Tutorial teaches the rules on 3 to 7 tiles; Open Country takes the Challenge's own deck from 10 tiles
to a full game of 38, about three more tiles a level (two at the end, so that the last level is exactly the simple deck's
played count); campaign 3 is eleven full games; campaign 4 plays the whole 72-tile deck.

## Campaign 1: Tutorial

The levels of PR 1 (#555), unchanged: their decks, intros and optima stand, so nothing is recomputed. Each level teaches one
rule or one control; the coach mark of the screens points at the control the level introduces (see "The screens").

| Level | Title | Teaches | Deck, in draw order | Tiles | 3 stars | 2 stars | Search (method, positions, time) |
|---|---|---|---|---|---|---|---|
| 1-1 | First stone | Placing a tile; edges must match; a road closes between two stops. | SFRFRFRFR SFRFRFRFR | 3 | **321** exact | 225 | exhaustive, 14, 0.0 s |
| 1-2 | Turn it around | The rotate and cancel bubble; a city closes when no edge is open. | CFFFCFFFC RFRFFFFFR FFFFFFCFF | 4 | **643** exact | 451 | exhaustive, 253, 0.0 s |
| 1-3 | Not this one | Discarding: free while your score is 0. | CCCCCCCCC FFCFFFCFF WFFFFFFFF | 4 | **419** exact | 294 | exhaustive, 25, 0.0 s |
| 1-4 | The price of a discard | The discard penalty: 50 points once you have a score. | FFCFFFCFF CCCCCCCCC RFRFRFCFF SFRFRFRFR | 5 | **788** exact | 552 | exhaustive, 257, 0.0 s |
| 1-5 | Under the trees | Forests: a forest scores for the roads and cities around it once it is enclosed (adjacency). | FFCFFFCFF CFFFCFFFC CFFFCFFFC | 4 | **740** exact | 518 | exhaustive, 79, 0.0 s |
| 1-6 | The long road | The size bonus: the longer the road, the more each tile is worth. | SFRFRFRFR RFFFRFFFR CCCCCFRFC WFFFFFFFR FFFFFFCFF | 6 | **1066** exact | 747 | exhaustive, 12,426, 0.2 s |
| 1-7 | Crossroads | Junctions and stops: a crossroads ends every road that reaches it. | SFRFRFCFR RFRFRFCFF WFFFFFFFR FFFFCCCFF SFRFRFRFR | 6 | **1285** exact | 900 | exhaustive, 25,573, 0.7 s |
| 1-8 | Hearth and field | A road, a city and the forest between them, closed by the same tile. | FFCFFFFFC RFRFFFCFR CCCCCFRFC CCCCCFRFC CCCCCCCCC | 6 | **1515** exact | 1061 | exhaustive, 28,842, 0.8 s |
| 1-9 | Patience | Discarding twice to keep the board open for a big finish. | RFFFRFFFR CCCCCFFFC WFFFFFFFF CCCCCFRFC CCCCCFRFC | 6 | **971** exact | 680 | exhaustive, 7,145, 0.1 s |
| 1-10 | The monastery | Wonders: a wonder scores 900 once all eight tiles around it are placed. | FFCFFFCFF RFRFFFFFR CCCCCFRFC | 4 | **900** exact | 630 | exhaustive, 1,574, 0.0 s |
| 1-11 | The first village | Everything together: cities, roads, a junction and the size bonus. | FFFFCCCFF SFRFRFCFR FFCFFFFFC SFRFRFRFR FFCFFFFFC CFFFCFFFC | 7 | **1578** exact | 1105 | exhaustive, 66,446, 1.4 s |

### 1-1, First stone

> Tap a cell next to the board to place the tile in your hand. Roads must meet roads. A road scores once both of its ends are closed, and a crossroads closes every road that reaches it.

Best line, exact (321 points; search: 14 positions):

1. `SFRFRFRFR` at (1, 0), North
2. `SFRFRFRFR` at (-1, 0), North: road of 3 = 321

### 1-2, Turn it around

> Tap a cell, then Rotate until the tile fits, or Cancel to pick another cell. Close the city at the top. One of your three tiles has nothing to do with it.

Best line, exact (643 points; search: 253 positions):

1. `CFFFCFFFC` at (0, 1), East
2. `RFRFFFFFR` at (1, 0), North
3. `FFFFFFCFF` at (0, 2), North: city of 3 = 643

### 1-3, Not this one

> Some tiles only get in the way. Discard throws the tile away and draws the next. While you have no points it costs nothing.

Best line, exact (419 points; search: 25 positions):

1. `CCCCCCCCC`: discard (free)
2. `FFCFFFCFF` at (0, 1), North: city of 2 = 419
3. `WFFFFFFFF` at (0, -1), North

### 1-4, The price of a discard

> Once you have points, a discard costs 50 of them. Sometimes it is still the right call: count what the next tile is worth.

Best line, exact (788 points; search: 257 positions):

1. `FFCFFFCFF` at (0, 1), North: city of 2 = 419
2. `CCCCCCCCC`: discard (-50)
3. `RFRFRFCFF` at (0, 2), North: city of 2 = 419
4. `SFRFRFRFR` at (1, 0), North

### 1-5, Under the trees

> Forests fill the gaps between roads and cities. When a forest is fully surrounded it scores for the roads and cities around it.

Best line, exact (740 points; search: 79 positions):

1. `FFCFFFCFF` at (0, 1), North: city of 2 = 419
2. `CFFFCFFFC` at (1, 1), East
3. `CFFFCFFFC` at (-1, 1), East: forest of 3 = 321

### 1-6, The long road

> A road of four tiles is worth more than two roads of two. Each tile in a structure raises its value by 2.35 %, so build long before you close.

Best line, exact (1066 points; search: 12426 positions):

1. `SFRFRFRFR` at (1, 0), North
2. `RFFFRFFFR` at (-1, 0), North
3. `CCCCCFRFC` at (2, 0), East: road of 2 = 209
4. `WFFFFFFFR` at (-2, 0), South: road of 4 = 438
5. `FFFFFFCFF` at (0, 1), North: city of 2 = 419

### 1-7, Crossroads

> A junction splits a road in pieces, and each piece scores on its own. Plan so that one tile closes two roads at once.

Best line, exact (1285 points; search: 25573 positions):

1. `SFRFRFCFR` at (1, 0), North
2. `RFRFRFCFF` at (1, 1), East
3. `WFFFFFFFR` at (-1, 0), South: road of 3 = 321
4. `FFFFCCCFF` at (0, 1), North: city of 3 = 643
5. `SFRFRFRFR` at (2, 1), North: road of 3 = 321

### 1-8, Hearth and field

> One tile can close a road and the forest next to it together. Look for the tile that finishes two structures.

Best line, exact (1515 points; search: 28842 positions):

1. `FFCFFFFFC` at (0, 1), South: city of 2 = 419
2. `RFRFFFCFR` at (1, 0), North
3. `CCCCCFRFC` at (-1, 0), West
4. `CCCCCFRFC` at (1, 1), North: road of 4 = 438, forest of 4 = 658
5. `CCCCCCCCC` at (1, -1), North

### 1-9, Patience

> The best board is not always the fullest one. Throw away what does not belong, then finish with two tiles that close three structures.

Best line, exact (971 points; search: 7145 positions):

1. `RFFFRFFFR`: discard (free)
2. `CCCCCFFFC` at (0, -1), South
3. `WFFFFFFFF`: discard (free)
4. `CCCCCFRFC` at (1, 0), East
5. `CCCCCFRFC` at (-1, 0), West: forest of 3 = 321, road of 3 = 321, forest of 4 = 329

### 1-10, The monastery

> The monastery stands south of the starter, with most of its neighbours already built. Fill the three empty cells below it, rotating each tile so its edges match, and the wonder scores.

Already on the board when the level starts: `WFFFFFFFF` at (0, -1), North; `RFRFFFFFR` at (-1, 0), East; `RFRFRFCFF` at (1, 0), West; `FFFFCCCFF` at (-1, -1), East; `FFFFCCCFF` at (1, -1), North.

Best line, exact (900 points; search: 1574 positions):

1. `FFCFFFCFF` at (-1, -2), North
2. `RFRFFFFFR` at (0, -2), South
3. `CCCCCFRFC` at (1, -2), East: wonder of 0 = 900

### 1-11, The first village

> Six tiles, three cities and a road. Build the village the way you would in a real game, then compare your score with the best there is.

Best line, exact (1578 points; search: 66446 positions):

1. `FFFFCCCFF` at (0, -1), North
2. `SFRFRFCFR` at (1, 0), South
3. `FFCFFFFFC` at (0, 1), South: city of 2 = 419
4. `SFRFRFRFR` at (-1, 0), North: road of 3 = 321
5. `FFCFFFFFC` at (1, 1), West: city of 2 = 419, city of 2 = 419
6. `CFFFCFFFC` at (0, -2), East

## Campaign 2: Open Country

The Challenge's own deck, frozen: each level takes the first tiles the simple deck deals for its seed (see "How a long
level's deck is chosen"), so the player meets the real mix of tiles, a few more each level, up to a full game of 38. The
deck sheet lists the level's whole deck, so planning ahead is what separates 2 from 3 stars. The titles and intros name
what the level's deck stresses (roads, wonders, cities, junctions).

| Level | Title | Adds | Tiles | Seed | 3 stars | 2 stars | Search (method, positions, time) |
|---|---|---|---|---|---|---|---|
| 2-1 | Open country | Ten tiles, the whole deck on the sheet: planning a few tiles ahead. | 10 | 1 | **2805** best known | 1964 | beam, 168 settings; best: width 256, 4/parent, decay 0.5, forest 50; 1,521,716 positions, 60.4 s |
| 2-2 | Road builders | A deck rich in roads: long roads, and the junctions that end them. | 13 | 2 | **3126** best known | 2189 | beam, 142 settings; best: width 16, 2/parent, decay 0.4, forest 50; 2,622,941 positions, 119.2 s |
| 2-3 | Three monasteries | Wonders in a longer deck: leaving room around a monastery. | 16 | 3 | **3739** best known | 2618 | beam, 140 settings; best: width 64, 4/parent, decay 0.6, forest 50; 2,038,515 positions, 119.6 s |
| 2-4 | Walls and fields | Cities and the forests between them, closed in the right order. | 19 | 4 | **4567** best known | 3197 | beam, 109 settings; best: width 32, 2/parent, decay 0.4, forest 50; 2,162,162 positions, 119.5 s |
| 2-5 | Market day | A mixed deck: keeping a few structures open, not too many. | 22 | 5 | **7118** best known | 4983 | beam, 104 settings; best: width 256, 2/parent, decay 0.4, forest 50; 1,864,784 positions, 117.2 s |
| 2-6 | The cloister road | Wonders and cities together on a bigger board. | 25 | 6 | **6967** best known | 4877 | beam, 94 settings; best: width 128, all/parent, decay 0.6, forest 50; 1,764,347 positions, 119.5 s |
| 2-7 | Crossings | Junctions everywhere: splitting roads on purpose. | 28 | 7 | **7268** best known | 5088 | beam, 81 settings; best: width 128, 2/parent, decay 0.6, forest 50; 1,716,911 positions, 120.1 s |
| 2-8 | City walls | A city-heavy deck: big cities and their size bonus. | 31 | 8 | **7594** best known | 5316 | beam, 65 settings; best: width 64, 2/parent, decay 0.5, forest 150; 1,557,435 positions, 118.4 s |
| 2-9 | Pilgrims | Three wonders in a long deck: when to start them, when to give up on one. | 34 | 9 | **10557** best known | 7390 | beam, 48 settings; best: width 32, all/parent, decay 0.4, forest 50; 935,429 positions, 118.0 s |
| 2-10 | The long season | Four wonders and a long deck: the board as a whole. | 36 | 10 | **9573** best known | 6702 | beam, 54 settings; best: width 16, 2/parent, decay 0.4, forest 50; 1,210,356 positions, 118.2 s |
| 2-11 | A full road | The Challenge's whole game: 38 tiles, the simple deck's played count. | 38 | 11 | **14106** best known | 9875 | beam, 54 settings; best: width 16, 2/parent, decay 0.6, forest 50; 1,182,950 positions, 118.8 s |

### 2-1, Open country

> Ten tiles this time, and the deck sheet lists every one of them in order. Look ahead before you place: the city you open now may close three tiles later.

Deck (9 drawn after the starter, seed 1):

```
FFFFCCCFF FFCFFFFFC FFCFFFFFC FFFFCCCFF CCCCCFRFC RFRFCCCFR RFRFRFCFF SFRFRFCFR FFFFFFCFF
```

Best known line (2805 points):

```
N0,1 E0,2 S0,3 S1,1 W1,2 E1,3 W2,2 S2,3 E3,2
```

### 2-2, Road builders

> Most of these tiles carry a road. Let a road run before you close it, and use the junctions to finish two roads with one tile.

Deck (12 drawn after the starter, seed 2):

```
RFFFRFFFR RFRFRFCFF RFFFRFCFR RFRFCCCFR RFRFCCCFR CCCCCFFFC RFRFRFCFF SFRFRFFFR RFFFRFFFR RFRFFFFFR RFRFFFCFR RFRFFFFFR
```

Best known line (3126 points):

```
N0,-1 N0,1 E-1,1 W-2,1 N-2,2 S0,-2 E-1,2 S0,2 N1,2 E-1,0 N1,0 W1,1
```

### 2-3, Three monasteries

> Three monasteries come early. Each scores 900 once its eight neighbours are placed, so give them space at the edge of what you build.

Deck (15 drawn after the starter, seed 3):

```
WFFFFFFFF SFRFRFFFR RFFFRFFFR WFFFFFFFF RFRFCCCFR RFRFRFCFF RFRFCCCFR FFFFCCCFF RFRFRFCFF FFFFFFCFF FFCFFFCFF CCCCCFFFC RFFFRFFFR RFFFRFCFR WFFFFFFFF
```

Best known line (3739 points):

```
N0,-1 N-1,0 N0,-2 N-1,-1 N1,0 E-1,-2 W-2,-2 E-2,-1 S1,-2 W-3,-1 N1,-1 E0,1 N-2,0 E2,0 N0,-3
```

### 2-4, Walls and fields

> A forest scores for the closed roads and cities around it, but only if they are closed before it is. Finish the walls first, then the fields.

Deck (18 drawn after the starter, seed 4):

```
CFFFCFFFC FFCFFFFFC RFFFRFFFR RFFFRFCFR RFRFFFFFR SFRFRFFFR RFRFFFFFR CCCCCFRFC RFFFRFCFR RFRFFFCFR FFCFFFCFF RFRFFFFFR FFFFFFCFF FFFFFFCFF CCCCCFFFC CCCCCFFFC RFRFFFFFR RFFFRFFFR
```

Best known line (4567 points):

```
E0,1 S0,2 E1,1 E1,2 E2,1 W1,0 N1,-1 N1,3 N0,-1 E-1,-1 N0,-2 S-1,0 W-2,-1 S0,-3 W-1,2 N0,3 S2,2 N3,1
```

### 2-5, Market day

> Everything at once. Keep two or three things open at a time: more, and the last tiles will not be enough to finish them.

Deck (21 drawn after the starter, seed 5):

```
WFFFFFFFR WFFFFFFFF RFRFCCCFR RFRFFFFFR CCCCCFFFC CFFFCFFFC RFRFRFCFF CFFFCFFFC RFRFCCCFR SFRFRFCFR RFRFRFCFF RFRFFFCFR SFRFRFCFR FFFFFFCFF RFFFRFFFR SFRFRFFFR CFFFCFFFC FFFFCCCFF RFFFRFFFR WFFFFFFFF RFRFFFFFR
```

Best known line (7118 points):

```
N1,0 N1,1 S-1,0 E-1,-1 E2,0 E0,1 N0,2 E2,1 E2,2 S2,-1 W1,2 E3,0 W2,-2 E3,-2 N1,-1 S0,-1 E-1,1 E-2,1 N1,-2 N-1,-2 E0,-2
```

### 2-6, The cloister road

> Monasteries and cities share this deck. A wonder wants to be surrounded, a city wants to be closed: one tile can help both.

Deck (24 drawn after the starter, seed 6):

```
CCCCCFFFC WFFFFFFFF RFFFRFCFR RFRFFFFFR WFFFFFFFF RFRFFFFFR RFRFCCCFR RFRFFFFFR RFRFCCCFR RFFFRFFFR CFFFCFFFC CCCCCCCCC RFFFRFFFR SFRFRFCFR FFFFFFCFF RFRFRFCFF FFFFFFCFF FFFFCCCFF FFCFFFCFF FFCFFFFFC CCCCCFFFC WFFFFFFFR FFFFCCCFF CCCCCFRFC
```

Best known line (6967 points):

```
W0,1 N1,1 N0,2 N1,2 N2,1 E2,2 N-1,1 W2,0 S-1,0 N1,0 E3,0 N3,-1 N3,2 W-2,0 N3,1 W2,-1 E4,-1 S3,-2 E2,-2 S1,-2 W0,-2 S1,-1 E0,-1 S-1,-1
```

### 2-7, Crossings

> This deck is full of junctions. A crossroads ends every road that reaches it, so a short road between two of them scores quickly.

Deck (27 drawn after the starter, seed 7):

```
RFRFRFCFF RFFFRFCFR SFRFRFCFR FFFFFFCFF RFFFRFFFR FFFFCCCFF CFFFCFFFC RFRFFFCFR FFFFCCCFF RFRFFFFFR CCCCCFFFC RFFFRFFFR FFCFFFCFF RFRFFFFFR CCCCCFFFC RFRFFFFFR RFFFRFCFR RFRFFFFFR SFRFRFFFR RFFFRFFFR WFFFFFFFF FFCFFFCFF RFFFRFFFR CCCCCCCCC CCCCCFRFC RFFFRFFFR RFRFFFCFR
```

Best known line (7268 points):

```
E0,-1 N0,1 N1,1 E0,2 E1,2 N-1,-1 E-1,-2 S-1,-3 W-1,2 W2,1 W-2,-2 E1,3 N-1,3 W1,4 W-2,2 N2,0 S1,0 E-1,0 S-1,1 N0,4 N0,3 E-3,-2 E3,1 N-3,2 W-1,4 N1,-1 W-4,-2
```

### 2-8, City walls

> Cities, and more cities. Each tile adds 2.35 % to a structure's value: a city of eight is worth far more than two cities of four.

Deck (30 drawn after the starter, seed 8):

```
RFRFFFCFR SFRFRFCFR RFFFRFFFR CFFFCFFFC FFCFFFCFF FFFFFFCFF RFRFFFFFR RFFFRFCFR RFRFFFCFR RFFFRFFFR RFRFCCCFR CFFFCFFFC RFRFRFCFF RFRFCCCFR RFFFRFFFR CCCCCFFFC SFRFRFFFR FFCFFFFFC RFRFFFFFR RFRFCCCFR RFRFFFFFR RFRFFFFFR FFFFFFCFF RFRFFFFFR RFRFFFFFR CCCCCFRFC RFFFRFFFR CCCCCFFFC FFFFCCCFF RFRFFFFFR
```

Best known line (7594 points):

```
N0,1 S1,0 N0,-1 E1,1 N2,1 N2,2 W0,-2 S2,0 N1,2 N2,-1 W3,0 E3,1 N3,2 S4,0 N2,-2 S2,-3 N1,-1 S4,1 N3,-1 S5,1 S-1,0 E-1,-1 N5,2 N-2,0 W-2,-1 N3,-3 N2,3 N5,3 S2,-4 S0,2
```

### 2-9, Pilgrims

> Three monasteries again, in a much longer deck. Not every one has to score: a discard costs 50, a wonder left open costs 900.

Deck (33 drawn after the starter, seed 9):

```
RFRFCCCFR FFCFFFCFF RFRFFFCFR CCCCCFFFC RFRFCCCFR CCCCCFFFC FFCFFFCFF RFRFRFCFF CFFFCFFFC WFFFFFFFF CFFFCFFFC SFRFRFCFR RFRFCCCFR SFRFRFFFR RFFFRFFFR RFFFRFFFR RFRFFFFFR RFRFFFFFR RFFFRFFFR RFRFFFFFR RFFFRFFFR SFRFRFFFR FFFFFFCFF SFRFRFFFR FFFFCCCFF FFFFFFCFF WFFFFFFFR SFRFRFFFR RFFFRFCFR WFFFFFFFF RFFFRFFFR FFFFCCCFF FFFFCCCFF
```

Best known line (10557 points):

```
N0,1 E1,1 E2,1 N1,2 N3,1 S0,-1 N3,0 E4,1 E3,-1 N2,0 E3,-2 S3,-3 W4,-3 E4,-4 E3,-4 E3,-5 W2,-1 W1,0 E3,-6 E3,-7 N4,-7 N5,-7 E5,-3 E5,-6 N4,-2 E5,-2 E4,-5 S5,-4 W5,-5 N4,-6 N2,-3 N1,3 W4,-1
```

### 2-10, The long season

> Thirty-six tiles and four monasteries. Build the board as a whole: where will the last ten tiles go?

Deck (35 drawn after the starter, seed 10):

```
FFFFCCCFF FFFFFFCFF RFRFFFFFR CCCCCFRFC RFFFRFFFR FFFFCCCFF WFFFFFFFF WFFFFFFFF RFRFFFFFR RFRFCCCFR FFFFCCCFF RFRFFFCFR RFFFRFCFR FFCFFFCFF WFFFFFFFR RFFFRFCFR CFFFCFFFC RFRFFFFFR RFFFRFFFR FFCFFFCFF WFFFFFFFF CFFFCFFFC RFFFRFFFR RFRFFFFFR CCCCCFRFC RFRFFFFFR CCCCCCCCC CCCCCFFFC RFRFCCCFR FFFFFFCFF RFRFFFCFR FFFFFFCFF RFRFCCCFR RFRFFFCFR RFRFFFFFR
```

Best known line (9573 points):

```
N0,1 E1,1 S0,-1 W-1,0 E2,1 S0,2 N1,2 N1,3 S2,3 W-1,2 E0,3 E1,4 W2,2 E0,4 N2,4 E3,2 N-1,4 S1,5 N2,5 E-2,4 N3,4 N-1,5 N3,5 W3,3 E4,5 E4,3 N-2,0 S-1,3 W-3,4 W-2,3 S4,4 N-3,5 N4,6 N5,3 W5,4
```

### 2-11, A full road

> This is a full game: 38 tiles, like a Challenge, but you know the deck. Use the deck sheet, and go for the best score there is.

Deck (37 drawn after the starter, seed 11):

```
FFFFCCCFF FFCFFFCFF CCCCCFRFC SFRFRFFFR CCCCCFFFC WFFFFFFFF RFFFRFCFR RFRFFFFFR RFRFFFFFR RFFFRFFFR WFFFFFFFR RFRFFFCFR SFRFRFRFR RFFFRFFFR RFRFFFFFR RFRFFFFFR RFRFRFCFF CCCCCFRFC FFCFFFFFC WFFFFFFFF SFRFRFFFR RFFFRFFFR SFRFRFFFR RFRFCCCFR WFFFFFFFF FFCFFFCFF FFFFCCCFF FFFFCCCFF RFRFCCCFR SFRFRFCFR FFFFFFCFF RFRFCCCFR CFFFCFFFC FFFFCCCFF CFFFCFFFC WFFFFFFFR RFRFRFCFF
```

Best known line (14106 points):

```
N0,1 E1,1 W-1,0 S1,0 N1,2 N0,-1 E2,1 E1,-1 W0,-2 N-1,-2 S1,-2 N2,-1 N2,0 N1,-3 N2,-3 E0,-3 S2,-2 N2,2 N-1,-1 N-1,-3 S-2,-2 E-2,-3 W-2,-4 N-2,0 N-1,-4 E-1,-5 N0,-4 W-2,-1 N-2,-5 S-2,-6 N-1,1 S0,-5 N1,-4 E2,-4 E2,-5 S-3,-5 S2,-6
```

## Campaigns 3 and 4 (later)

- **Campaign 3**: 16 levels of 38 tiles each, decks chosen as Open Country's (one seed each), targets best known.
- **Campaign 4**: 12 levels of the whole 72-tile deck, nothing withdrawn: the order is the simple deck's draw for a seed with
  no card withdrawn (the same draw over 72 cards). Targets best known; the search is about twice as long per level.
- Neither is built in PR 2. Their unlock follows the same rule (2 stars per level of every campaign before).

## How the targets are set

**Exact, where it finishes in seconds.** `packages/game-core/src/engine/solver.ts` plays the engine itself
(`EngineGame`, deck `story`): at each tile it tries every legal cell and rotation, and a discard, depth first, and keeps the
best final score. Its pruning is exact (a rotation that looks the same is tried once; on the last tile a discard is tried
only when nothing fits). Each extra tile multiplies the positions by about 6 to 10: the Tutorial's levels take at most 66,446 positions,
1.4 s; other six-tile decks tried while designing took 0.1 to 7 s. A ten-tile deck is already out of reach.

**Best known, for the long levels.** `packages/game-core/src/engine/beam.ts` is a beam search on the same engine: at each
draw, every kept position tries every legal placement of the tile in hand and a discard; the children are ranked by their
score plus an estimate of their open structures (what a road, a city or a wonder would score closed, and a forest
the roads and cities along it, each discounted by its open half-edges), boards reached twice are kept once, and the best
`width` positions go on. The last two draws are then solved exactly (`solveFrom`) from the 8 best positions. No single
setting of the estimate wins everywhere, so `packages/game-core/scripts/story-search.ts` runs a fixed portfolio of
settings (width 16 to 1024; 2, 4 or all children per position; 4 discounts; 2 forest weights), cheapest first, until the
level's **time cap of 120 s**, and keeps the best line. Every setting is deterministic: the same setting gives the same
line on any machine; the table names the setting that found each target.

**Checked against the exact solver.** On the Tutorial's levels the beam finds every exact optimum (the test asserts it on
levels 1 to 5 at width 64), so the method is sound where it can be checked; on long decks it is a lower bound.

**Stored, replayed, raised.** A level's target and the line that reaches it are stored in `plan.ts`. The test replays each
line on the engine and fails if it does not reach the target exactly. `story-search.ts --write` replays the stored line
first and writes a new target only when a search beats it: a target only ever rises. A player's run above a best-known
target is kept on the device in the submission's shape; once runs reach the chain (#548), a higher run can be replayed and
become the new target the same way. The plan says plainly which targets are proven (**exact**) and which are the **best
known**: the end screen says it too.

Run it outside the tests, one level at a time, under `nice -n 10`:

```
nice -n 10 bun scripts/story-search.ts --campaign 2 --cap 120 --write
```

The costs in the tables were measured that way, one search at a time.

## How a long level's deck is chosen

A Story level fixes the draw order, so a long level needs a fixed order the engine's deck rules allow. Open Country takes it
from the Challenge's own draw (`packages/game-core/src/story/deck.ts`, `seededDeck(seed, drawn)`):

- **The seed** gives the 34 cards the simple deck withdraws at the start (`withdrawExtra`, as `Deck::tiles` on chain): the
  38 cards left are the game's, the starter included. **The withdrawn cards never appear**: a level's deck is drawn from the
  38, never from the 72, exactly as in a Challenge game.
- **The order** is the one the simple deck deals for that seed when every tile is discarded. In the Challenge a build
  reseeds from the cell the tile went to, so the order depends on the moves; a discard always reseeds from the centre, so
  "every tile discarded" is the one order of a seed that does not. A level takes its first `tiles - 1` plans; the last
  level takes all 37.
- **The seeds** are 1 to 11, one per level, in order: the levels are as random as a real game, and anyone can rebuild a
  deck from its seed (the test does). A designer can still hand-pick a level's order later: the plan then stores that
  order and no seed.

## The screens (PR 2)

- **Story** (`/story`): the campaigns one under the other, each with its stars (held / possible) and its levels: number,
  title, tiles, stars, and a lock. A locked campaign says how many stars it needs and how many are held. One column on a
  phone, a grid of three from tablet up. Home and Play lead here; `/tutorial` redirects here; the scripted tutorial's code
  is removed (the engine keeps the contracts' tutorial deck for its parity tests).
- **Level** (`/story/:campaign/:level`): the board of Training, with the level's name in the header.
  - **Intro**: the campaign and level, the tiles, the intro text, the three star thresholds (the target marked "best known"
    where it is), the player's best so far, and Start.
  - **Coach marks**: the level that introduces a control shows one tip under the header and rings that control on the
    board: Place tile (1-1), the rotate and cancel bubble on the tile (1-2, a tip only: the bubble sits on the tile),
    Discard (1-3, 1-4), the deck sheet's "Tiles left" (1-5, 2-1), the season wheel (1-6), the settings gear (1-7). "Got it"
    hides it.
  - **No Surrender**: a level restarts with Replay instead.
  - **End**: the stars, the score against the target ("of the best known" where it is one), a new personal best, the note
    when the player beat a best-known target, the three thresholds, then Next level (when it is open), Replay and Levels.
    Tutorial level 1's end also offers First Stone (`claim_tutorial`, connected players; Connect is offered to a guest).
- **Deck sheet** (#540): in every level it shows the level's own fixed deck (the starter and the drawn tiles, per plan,
  the played and discarded ones crossed out), never the simple deck's 72. It shows counts, not the order (decision 5).
- **Progress on the device** (`paved:story:v1`): per level the best score, its stars and the run that scored it, in the
  submission's shape below. With storage refused, the page says so and the progress lasts for the visit.

## On chain (later)

- The levels will be **defined on chain** (each campaign's levels, their decks and targets), and a run is **submitted as a
  whole at its end**, in one transaction: a Story game is free, so no move is sent one by one.
- **No deployment now.** PR 2 is client only: campaigns, levels, stars and progress live on the device. The chain wiring
  comes later (#548 pays the Cobbles, verified by replaying the run).
- **The submission** (`StorySubmission`, `packages/game-core/src/story/progress.ts`), which the device keeps for each level's
  best run:

  ```
  submit_run(campaign_id, level_index, moves)
    campaign_id   the campaign's number, from 1
    level_index   the level's index in its campaign, from 1
    moves         every move in play order: { discard, orientation, x, y }
                  discard: true for a discard (orientation, x, y then 0)
                  orientation: 1 North, 2 East, 3 South, 4 West
                  x, y: the chain's absolute coordinates (the starter at CENTER, CENTER), as a Challenge build
  ```

  The Cairo pull request's `submit_run` input is to match it; if the two differ when it lands, this side aligns.

## Two pull requests

The owner asked for the client and the Cairo architecture in the same step. They are two pull requests, in parallel:
**STORY-CAMPAIGNS** (this one: the plan, game-core's Story module, the screens, the device progress) and **STORY-CHAIN**
(the models and systems for campaigns, levels and the one-transaction submission, tested with snforge, not deployed). The
client and the contracts are different lanes, with their own CI jobs and reviewers; neither waits on the other to be
tested, and the one thing they share, the submission's shape, is named in both. This pull request does not merge before the
Cairo one's shape is final.

## Decisions to confirm

1. **The level list** (the Tutorial's 11 levels, one rule each, finale last; the split of the other campaigns,
   11 / 16 / 12, for about 50 levels in all). Reorder, drop or reword freely: only the
   decks and numbers have to be recomputed, and the test will say which.
2. **In Tutorial levels 1, 2, 5 and 10 no outcome falls between 70 % and 100 %** (checked over every playable game:
   level 1 ends on 0, 209 or 321; level 2 on 0, 419 or 643; level 5 on 0, 319, 369, 419 or 740; level 10 on 0 or 900), so 2
   stars and 3 stars coincide there. That is acceptable for the first levels; if not, a decoy tile can allow a middle
   score. Levels 3 and 4 do have a 2-star outcome (369, and 738).
3. **Wonder level (1-10) starts with a half-built board.** A wonder scores 900 once its eight neighbours are placed, more
   tiles than the exact solver searches from an empty board in seconds. So level 10 puts the wonder and four of its
   neighbours on the board from the start and deals the last three. Open Country has wonders built from scratch (2-3, 2-6,
   2-9, 2-10, 2-11).
4. **Starter**: every level uses the usual starter, so the board looks the same in every level and the engine needs
   nothing special. A level with another starter is possible if wanted.
5. **Showing the whole deck** (#540's deck sheet): built as the whole fixed deck in every level, as counts per plan. The
   proposal of PR 1 (only the next tile in levels 1 to 5) and showing the draw order are both possible if wanted.
6. **Intro texts and tips** are short drafts; they are not final copy. The second campaign's name (Open Country) is a
   proposal too.
7. **How long-deck targets are set** (new): the best known score of the deterministic beam portfolio above, the exact
   solver finishing the last two draws, capped at 120 s per level, stored with its line and replayed by the test, raised
   whenever a search or a replayed run beats it, and labelled "best known" in the plan and on the end screen. The
   alternatives: a longer cap (10 minutes per level is possible offline; a wider search may find more), a designer's
   line per level (it can be added: the search keeps the higher), or no 3-star target on long levels (rejected: the owner
   wants the maximum as the target). A player beating a best-known target gets 3 stars
   and is told so.

## Next

Once this plan is validated: the Cairo side lands (STORY-CHAIN), then the wiring (#548: the levels on chain, the
submission at the end of a run, the Cobble rewards), and campaigns 3 and 4.
