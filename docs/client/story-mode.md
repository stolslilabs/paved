# Story mode: campaigns (#546, #721)

Status: **proposal, for the owner's validation**, built client side in PR 2 (the screens, the levels, the stars and the
progress on the device). Rebuilt for #721 (owner, 2026-10-24): three campaigns of 12 levels, every level from the starter
alone, a tip per level, a tile theme per campaign; the screens follow in STORY-SCREENS. The decks and scores below are computed by the engine, not estimated; the decisions at the end
are still open. The Cairo side (the levels on chain, the end-of-run submission) is a separate pull request (see "Two pull
requests").

## How a level works

- A level is a fixed deck. It starts from the usual starter tile alone (a city to the north, a road from east to west; no
  other tile on the board before the first draw), then the player draws the deck **in the order listed**, one tile at a time (engine deck `story`: no withdrawal, no reseed). The
  same level is the same game every time, so its best score is a single number, and it is always reachable.
- The player places or discards each tile (a discard takes 50 points, at most the score). The level ends after the last
  tile. Tile names are the plan codes of the game (`RFFFRFCFR` and so on: the centre, then the eight spots around it
  clockwise from the north-west corner).
- Cell coordinates in the lines are relative to the starter at (0, 0), north is +y. A stored line is one string: a build is
  the orientation's initial and the cell (`N1,0`), a discard is `D` (`packages/game-core/src/story/line.ts`).
- Every level opens on its intro: the title, the intro, the tiles it deals and **one tip** (`StoryLevel.tip`): one sentence
  that guides on this deck (what to keep open, what comes later), never the whole line, never a star threshold.
- Every level is drawn in its campaign's tile theme (`StoryCampaign.theme`, the chain's `u8` theme code: 0 Default, 1
  Forest), whatever skins the player has set.
- The plan lives in `packages/game-core/src/story/plan.ts`; a test (`__tests__/story-solver.test.ts`) checks that this page
  states every level's deck, target and 2-star score, replays every stored line to its target, re-solves every exact
  level, and holds the rules below (12 levels, no placed tile, a tip each, 9 to 16 tiles outside the Tutorial).

## Stars and unlocks (owner, 2026-10-18 and 2026-10-19)

- **3 stars** = the target, the maximum score of the level: the exact optimum where the exhaustive solver finishes, the
  **best known** score elsewhere (see "How the targets are set"). **2 stars** = at least 70 % of the target, rounded up.
  **1 star** = the level finished. A score above a best-known target earns 3 stars, and the end screen says the player beat
  the best known score.
- **Levels unlock in order**: a level is locked until the one before it is finished (1 star).
- **A campaign unlocks on stars**: the stars held over every level of the campaigns before it must reach 2 x their number
  of levels (2 stars per level on average). Open Country opens at 24 stars over the Tutorial's 12 levels, Dark Forest at 48
  over the 24 levels of the two campaigns before it.
- Stars never go down: a replay keeps the best score, its stars and its run.

## The campaigns

**The rule** (owner, #721, 2026-10-24):

- **Every level starts from the starter alone**: no tile is placed before the first draw. The `placed` field of a level and
  the contract keep the capability, unused; a test fails if a level of the plan has placed tiles.
- **12 levels per campaign**, the Tutorial included.
- **9 to 16 tiles per level outside the Tutorial** (the starter included); the Tutorial keeps its short levels.
- **One campaign per tile theme.** Every new tile theme (Dark Forest, then Snow, Desert, Volcano...) ships with a campaign
  drawn in that theme, to show it off, and the two are released together. A Story level ignores the player's skins: every
  tile of it is drawn in its campaign's theme. A test (`packages/app/__tests__/story-themes.test.ts`) fails when an
  available theme other than Default (`SKIN_THEMES`) has no campaign.

| # | Campaign | Theme | Levels | Tiles per level (the starter included) | Targets | Seeds |
|---|---|---|---|---|---|---|
| 1 | Tutorial | Default (0) | 12 | 3 to 9: one rule per level | exact optimum, best known on 1-10 | hand-made decks |
| 2 | Open Country | Default (0) | 12 | 9, 10, 10, 11, 11, 12, 12, 13, 14, 14, 15, 16 | best known | 1 to 12 |
| 3 | Dark Forest | Forest (1) | 12 | 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 16, 16 | best known | 13 to 24 |

Why this split:

- **Tutorial, 12**: one rule or control per level, short decks. Level 1-10, the monastery, is rebuilt from the starter
  alone (its deck is the wonder and seven neighbours, the starter being the eighth), and one level is new: **1-11, Look
  ahead**, planning with the deck sheet (proposed, see "Decisions to confirm"). The other levels keep their decks and
  targets; the finale, The first village, becomes 1-12.
- **Open Country, 12**: the Challenge's deck from 9 to 16 tiles, never shorter than the level before, every size from 9 to
  16 used. Its seeds stay 1 to 12, so levels 1 to 11 keep the start of their former decks.
- **Dark Forest, 12**: the same method on its own seeds, 13 to 24, from 10 to 16 tiles: it comes after Open Country, so it
  starts one tile longer and reaches 16 twice. Its name, titles and intros are proposals.

With #548's rewards (5, 10 and 15 Cobbles for the first, second and third star, 30 per level at most), the 36 levels pay
1,080 Cobbles in all. The unlock rule follows the counts: Open Country opens at 24 stars (2 x 12), Dark Forest at 48
(2 x 24). The campaign of 27 levels of 38 tiles closed by a 72-tile finale (#593) is withdrawn: the 16-tile cap rules it
out, and the card that announced it (`UPCOMING_CAMPAIGNS`) is gone.

On chain nothing changes: the Story system keeps campaigns and levels in storage (`set_campaign` with its level count,
`set_level`, both correctable; `placed` stays optional). `scripts/deploy.sh` sets the Tutorial's 12 levels
(`FRESH_STORY_CAMPAIGNS`, `FRESH_STORY_LEVELS`; a game-core test keeps them in step with the plan); Open Country and Dark
Forest go there with the wiring (#548). Setting the deployed Story again is the owner's step.

## Campaign 1: Tutorial

Each level teaches one rule or one control; the coach mark of the screens points at the control the level introduces (see
"The screens"). Levels 1-1 to 1-9 and 1-12 (formerly 1-11) keep the decks, intros and optima of #555.

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
| 1-10 | The monastery | Wonders: a wonder scores 900 once all eight tiles around it are placed. | WFFFFFFFF RFRFFFFFR RFRFRFCFF FFFFCCCFF FFFFCCCFF FFCFFFCFF RFRFFFFFR CCCCCFRFC | 9 | **1543** best known | 1081 | best known (the exact solver did not finish in 15 min); beam w64 pall d0.7 f50, 168 settings, 763,216 positions, 46.4 s; designer 419 |
| 1-11 | Look ahead | Planning ahead: the deck sheet lists every tile to come, and a tile's best cell depends on the ones after it. | SFRFRFCFR CCCCCFRFC CCCCCFRFC FFCFFFFFC FFFFCCCFF | 6 | **2250** exact | 1575 | exhaustive, 117,025, 8.3 s |
| 1-12 | The first village | Everything together: cities, roads, a junction and the size bonus. | FFFFCCCFF SFRFRFCFR FFCFFFFFC SFRFRFRFR FFCFFFFFC CFFFCFFFC | 7 | **1578** exact | 1105 | exhaustive, 66,446, 1.4 s |

### 1-1, First stone

> Tap a cell next to the board to place the tile in your hand. Roads must meet roads. A road scores once both of its ends are closed, and a crossroads closes every road that reaches it.

Tip: Look where the starter's road runs out: that is where a crossroads closes it.

Best line, exact (321 points; search: 14 positions):

1. `SFRFRFRFR` at (1, 0), North
2. `SFRFRFRFR` at (-1, 0), North: road of 3 = 321

### 1-2, Turn it around

> Tap a cell, then Rotate until the tile fits, or Cancel to pick another cell. Close the city at the top. One of your three tiles has nothing to do with it.

Tip: Turn the first tile so that its city carries the starter's city further up.

Best line, exact (643 points; search: 253 positions):

1. `CFFFCFFFC` at (0, 1), East
2. `RFRFFFFFR` at (1, 0), North
3. `FFFFFFCFF` at (0, 2), North: city of 3 = 643

### 1-3, Not this one

> Some tiles only get in the way. Discard throws the tile away and draws the next. While you have no points it costs nothing.

Tip: A city you cannot close is worth nothing, so a tile that only opens more of it can go.

Best line, exact (419 points; search: 25 positions):

1. `CCCCCCCCC`: discard (free)
2. `FFCFFFCFF` at (0, 1), North: city of 2 = 419
3. `WFFFFFFFF` at (0, -1), North

### 1-4, The price of a discard

> Once you have points, a discard costs 50 of them. Sometimes it is still the right call: count what the next tile is worth.

Tip: Before you discard, count what the tile after it can close.

Best line, exact (788 points; search: 257 positions):

1. `FFCFFFCFF` at (0, 1), North: city of 2 = 419
2. `CCCCCCCCC`: discard (-50)
3. `RFRFRFCFF` at (0, 2), North: city of 2 = 419
4. `SFRFRFRFR` at (1, 0), North

### 1-5, Under the trees

> Forests fill the gaps between roads and cities. When a forest is fully surrounded it scores for the roads and cities around it.

Tip: Close the city first: a forest only scores for what is closed around it.

Best line, exact (740 points; search: 79 positions):

1. `FFCFFFCFF` at (0, 1), North: city of 2 = 419
2. `CFFFCFFFC` at (1, 1), East
3. `CFFFCFFFC` at (-1, 1), East: forest of 3 = 321

### 1-6, The long road

> A road of four tiles is worth more than two roads of two. Each tile in a structure raises its value by 2.35 %, so build long before you close.

Tip: Let the road reach four tiles before you close it.

Best line, exact (1066 points; search: 12426 positions):

1. `SFRFRFRFR` at (1, 0), North
2. `RFFFRFFFR` at (-1, 0), North
3. `CCCCCFRFC` at (2, 0), East: road of 2 = 209
4. `WFFFFFFFR` at (-2, 0), South: road of 4 = 438
5. `FFFFFFCFF` at (0, 1), North: city of 2 = 419

### 1-7, Crossroads

> A junction splits a road in pieces, and each piece scores on its own. Plan so that one tile closes two roads at once.

Tip: A crossroads comes last: leave a road end waiting for it.

Best line, exact (1285 points; search: 25573 positions):

1. `SFRFRFCFR` at (1, 0), North
2. `RFRFRFCFF` at (1, 1), East
3. `WFFFFFFFR` at (-1, 0), South: road of 3 = 321
4. `FFFFCCCFF` at (0, 1), North: city of 3 = 643
5. `SFRFRFRFR` at (2, 1), North: road of 3 = 321

### 1-8, Hearth and field

> One tile can close a road and the forest next to it together. Look for the tile that finishes two structures.

Tip: Look for the one cell where a single tile finishes the road and the forest beside it.

Best line, exact (1515 points; search: 28842 positions):

1. `FFCFFFFFC` at (0, 1), South: city of 2 = 419
2. `RFRFFFCFR` at (1, 0), North
3. `CCCCCFRFC` at (-1, 0), West
4. `CCCCCFRFC` at (1, 1), North: road of 4 = 438, forest of 4 = 658
5. `CCCCCCCCC` at (1, -1), North

### 1-9, Patience

> The best board is not always the fullest one. Throw away what does not belong, then finish with two tiles that close three structures.

Tip: Only a few of these tiles matter for the finish: keep their cells free.

Best line, exact (971 points; search: 7145 positions):

1. `RFFFRFFFR`: discard (free)
2. `CCCCCFFFC` at (0, -1), South
3. `WFFFFFFFF`: discard (free)
4. `CCCCCFRFC` at (1, 0), East
5. `CCCCCFRFC` at (-1, 0), West: forest of 3 = 321, road of 3 = 321, forest of 4 = 329

### 1-10, The monastery

> A monastery scores 900 once all eight cells around it hold a tile. It comes first: build its seven other neighbours with the tiles that follow, rotating each so its edges match.

Tip: Put the monastery right next to the starter, so the starter is already one of its eight neighbours.

From the starter alone (#721): the five tiles that stood around the monastery from the start are now in the deck. Best
line, best known (1543 points; the exact solver did not finish in 15 minutes; designer's line 419; the running score after each move):

1. `WFFFFFFFF` at (0, -1), North
2. `RFRFFFFFR` at (-1, 0), East
3. `RFRFRFCFF` at (1, -1), North
4. `FFFFCCCFF` at (1, -2), South
5. `FFFFCCCFF` at (-1, -1), East
6. `FFCFFFCFF` at (0, -2), East: 643
7. `RFRFFFFFR` at (1, 0), West: 643
8. `CCCCCFRFC` at (-1, -2), North: 1543 (the wonder)

### 1-11, Look ahead

> The deck sheet lists every tile this level deals, in order. Read it before your first move: the tile in hand could close the city at once, but the tiles after it can do far better.

Tip: The last two tiles carry city edges: leave the cities open for them.

New (#721). Best line, exact (2250 points; search: 117,025 positions; the running score after each move). The first tile
closes the starter's city at once if placed north (419): the designer's line takes it and ends on 1480.

1. `SFRFRFCFR` at (1, 0), South
2. `CCCCCFRFC` at (-1, 0), West: 321
3. `CCCCCFRFC` at (2, 0), East: 1188
4. `FFCFFFFFC` at (0, 1), South: 1607
5. `FFFFCCCFF` at (1, 1), East: 2250

### 1-12, The first village

> Six tiles, three cities and a road. Build the village the way you would in a real game, then compare your score with the best there is.

Tip: Leave two small cities side by side: one tile can close both.

Best line, exact (1578 points; search: 66446 positions):

1. `FFFFCCCFF` at (0, -1), North
2. `SFRFRFCFR` at (1, 0), South
3. `FFCFFFFFC` at (0, 1), South: city of 2 = 419
4. `SFRFRFRFR` at (-1, 0), North: road of 3 = 321
5. `FFCFFFFFC` at (1, 1), West: city of 2 = 419, city of 2 = 419
6. `CFFFCFFFC` at (0, -2), East

## Campaign 2: Open Country

The Challenge's own deck, frozen: each level takes the first tiles the simple deck deals for its seed (see "How a long
level's deck is chosen"), so the player meets the real mix of tiles, a few more each level, from 9 tiles to 16. The deck
sheet lists the level's whole deck, so planning ahead is what separates 2 from 3 stars. The titles and intros name what the
level's deck stresses (roads, wonders, cities, junctions). Theme: Default.

| Level | Title | Adds | Tiles | Seed | 3 stars | 2 stars | Designer's line | Search (method, positions, time) |
|---|---|---|---|---|---|---|---|---|
| 2-1 | Open country | Nine tiles, the whole deck on the sheet: planning a few tiles ahead. | 9 | 1 | **2693** best known | 1886 | designer 1481 | beam w256 p4 d0.5 f50 (168 settings); 994,246 positions, 62.3 s |
| 2-2 | Road builders | A deck rich in roads: long roads, and the junction that ends them. | 10 | 2 | **1296** best known | 908 | designer 838 | beam w16 p2 d0.4 f50 (161 settings); 1,609,739 positions, 119.3 s |
| 2-3 | Two monasteries | Wonders in a short deck: knowing when one cannot score. | 10 | 3 | **1533** best known | 1074 | designer 419 | beam w1024 pall d0.5 f50 (163 settings); 1,099,026 positions, 117.8 s |
| 2-4 | Walls and fields | Cities and the forests between them, closed in the right order. | 11 | 4 | **2170** best known | 1519 | designer 1500 | beam w16 p2 d0.4 f50 (134 settings); 1,279,544 positions, 120.8 s |
| 2-5 | Market day | A mixed deck: keeping a few structures open, not too many. | 11 | 5 | **2826** best known | 1979 | designer 877 | beam w16 p2 d0.6 f50 (137 settings); 959,812 positions, 118.1 s |
| 2-6 | The cloister road | Wonders and roads together on a bigger board. | 12 | 6 | **1319** best known | 924 | designer 0 | beam w16 pall d0.4 f50 (130 settings); 991,981 positions, 117.4 s |
| 2-7 | Hill town | City pieces of every shape: fitting them into one wall. | 12 | 7 | **2029** best known | 1421 | designer 1257 | beam w16 p2 d0.4 f50 (128 settings); 961,820 positions, 120.1 s |
| 2-8 | Roads by the walls | Roads that run along cities: two structures on one tile. | 13 | 8 | **2962** best known | 2074 | designer 1900 | beam w16 pall d0.4 f50 (110 settings); 933,021 positions, 118.6 s |
| 2-9 | City walls | A city-heavy deck: big cities and their size bonus. | 14 | 9 | **4385** best known | 3070 | designer 1578 | beam w128 p4 d0.4 f150 (135 settings); 1,457,920 positions, 118.7 s |
| 2-10 | Twin cloisters | Two wonders back to back in a long deck. | 14 | 10 | **2862** best known | 2004 | designer 1062 | beam w128 p4 d0.7 f50 (135 settings); 1,687,312 positions, 118.0 s |
| 2-11 | Crossings | Junctions everywhere: splitting roads on purpose. | 15 | 11 | **3641** best known | 2549 | designer 1771 | beam w256 p2 d0.6 f50 (113 settings); 1,071,795 positions, 119.4 s |
| 2-12 | A long day | Everything together, sixteen tiles: the campaign's longest game. | 16 | 12 | **4119** best known | 2884 | designer 2587 | beam w128 p2 d0.5 f50 (85 settings); 676,346 positions, 116.4 s |

### 2-1, Open country

> Nine tiles this time, and the deck sheet lists every one of them. Look ahead before you place: the city you open now may close three tiles later.

Tip: Almost every tile carries a piece of city: grow one big city rather than closing small ones.

Deck (8 drawn after the starter, seed 1):

```
FFFFCCCFF FFCFFFFFC FFCFFFFFC FFFFCCCFF CCCCCFRFC RFRFCCCFR RFRFRFCFF SFRFRFCFR
```

Designer's line (1481 points):

```
N0,1 N1,1 S1,2 S0,2 W-1,0 S-1,-1 E2,2 N-1,-2
```

Best known line (2693 points):

```
E0,1 N0,2 W0,3 W-1,1 E-1,2 N-1,3 S-2,1 N-2,2
```

### 2-2, Road builders

> Most of these tiles carry a road. Let a road run before you close it, and use the junction to finish two roads with one tile.

Tip: Grow one long road, and close it with a tile that ends a city too.

Deck (9 drawn after the starter, seed 2):

```
RFFFRFFFR RFRFRFCFF RFFFRFCFR RFRFCCCFR RFRFCCCFR CCCCCFFFC RFRFRFCFF SFRFRFFFR RFFFRFFFR
```

Designer's line (838 points):

```
N1,0 N0,1 S1,1 E-1,0 N2,0 S0,-1 N1,2 S2,1 E-1,1
```

Best known line (1296 points):

```
N0,-1 N0,1 N0,-2 S0,-3 N-1,-3 W-1,1 S-1,-4 N1,0 N1,-1
```

### 2-3, Two monasteries

> Two monasteries come early, but nine tiles are not enough to surround one and build the rest. Decide what they are for.

Tip: A monastery that cannot be surrounded still fills a cell: let the cities around it score instead.

Deck (9 drawn after the starter, seed 3):

```
WFFFFFFFF SFRFRFFFR RFFFRFFFR WFFFFFFFF RFRFCCCFR RFRFRFCFF RFRFCCCFR FFFFCCCFF RFRFRFCFF
```

Designer's line (419 points):

```
N0,-1 N1,0 N-1,0 N1,-1 N2,0 N0,1 W1,1 E-1,-1 E2,1
```

Best known line (1533 points):

```
N0,-1 S0,-2 N-1,0 N-1,-1 N0,-3 E-1,-2 E-1,-3 N0,1 E1,1
```

### 2-4, Walls and fields

> A forest scores for the closed roads and cities around it, but only if they are closed before it is. Finish the walls first, then the fields.

Tip: Finish the starter's city first: the roads that follow have their own closers.

Deck (10 drawn after the starter, seed 4):

```
CFFFCFFFC FFCFFFFFC RFFFRFFFR RFFFRFCFR RFRFFFFFR SFRFRFFFR RFRFFFFFR CCCCCFRFC RFFFRFCFR RFRFFFCFR
```

Designer's line (1500 points):

```
E0,1 S0,2 N1,0 E1,2 E1,1 N-1,0 W-1,1 E2,0 N2,1 S1,3
```

Best known line (2170 points):

```
E0,1 S0,2 E1,1 E1,2 E2,1 W1,3 N1,0 W-1,0 N0,-1 S0,-2
```

### 2-5, Market day

> Everything at once. Keep two or three things open at a time: more, and the last tiles will not be enough to finish them.

Tip: Of the two monasteries that come first, only one can be surrounded: build the deck around it.

Deck (10 drawn after the starter, seed 5):

```
WFFFFFFFR WFFFFFFFF RFRFCCCFR RFRFFFFFR CCCCCFFFC CFFFCFFFC RFRFRFCFF CFFFCFFFC RFRFCCCFR SFRFRFCFR
```

Designer's line (877 points):

```
N1,0 N0,-1 E-1,0 S-1,1 W-1,-1 N1,1 N2,0 N0,-2 N0,1 E2,1
```

Best known line (2826 points):

```
N1,0 N0,-1 N0,1 S1,-1 E2,0 N1,1 S2,-1 N3,0 E2,1 E4,0
```

### 2-6, The cloister road

> Two monasteries and a long road share this deck. A wonder wants to be surrounded, a road wants to run: one tile can help both, and not every tile has to be placed.

Tip: Only one of the two monasteries can be surrounded, so let the road wrap around that one.

Deck (11 drawn after the starter, seed 6):

```
CCCCCFFFC WFFFFFFFF RFFFRFCFR RFRFFFFFR WFFFFFFFF RFRFFFFFR RFRFCCCFR RFRFFFFFR RFRFCCCFR RFFFRFFFR CFFFCFFFC
```

Designer's line (0 points):

```
E0,1 N-1,1 N-1,0 E-2,0 N-1,2 W-2,1 N1,0 E-3,1 S1,1 N2,1 E0,2
```

Best known line (1319 points):

```
D N0,-1 N0,1 S0,-2 N-1,-1 W-1,-2 W1,0 E-1,0 N1,-2 E1,-1 N0,2
```

### 2-7, Hill town

> Nine of these tiles carry a city edge. Fit them into a few big cities, and keep the caps for the end.

Tip: Two small cities pay early; the big one grows from the tiles in the middle of the deck.

Deck (11 drawn after the starter, seed 7):

```
RFRFRFCFF RFFFRFCFR SFRFRFCFR FFFFFFCFF RFFFRFFFR FFFFCCCFF CFFFCFFFC RFRFFFCFR FFFFCCCFF RFRFFFFFR CCCCCFFFC
```

Designer's line (1257 points):

```
N0,1 N1,0 S1,-1 N-1,1 N0,-1 N0,-2 N-1,2 S-1,0 E-2,0 E-1,-1 W-2,-1
```

Best known line (2029 points):

```
N0,1 N0,-1 W0,2 S0,-2 N-1,2 S1,2 E1,3 N1,4 E-1,1 N1,0 E2,3
```

### 2-8, Roads by the walls

> Many of these tiles carry a road and a city edge together. Place each one so that both keep growing.

Tip: The city tiles come early: stack them above the starter before the roads take the room.

Deck (12 drawn after the starter, seed 8):

```
RFRFFFCFR SFRFRFCFR RFFFRFFFR CFFFCFFFC FFCFFFCFF FFFFFFCFF RFRFFFFFR RFFFRFCFR RFRFFFCFR RFFFRFFFR RFRFCCCFR CFFFCFFFC
```

Designer's line (1900 points):

```
N0,1 N1,0 E1,1 N0,-1 E0,-2 E1,-2 E-1,0 W-1,-2 S-1,1 E0,2 S0,3 N0,-3
```

Best known line (2962 points):

```
N0,1 S0,2 N-1,1 E0,3 N0,4 N0,5 E-2,1 S-1,2 S-2,2 N1,2 N1,0 E-1,3
```

### 2-9, City walls

> Cities, and more cities. Each tile adds 2.35 % to a structure's value: a city of eight is worth far more than two cities of four.

Tip: The lone monastery comes too late to be surrounded: put it out of the city's way.

Deck (13 drawn after the starter, seed 9):

```
RFRFCCCFR FFCFFFCFF RFRFFFCFR CCCCCFFFC RFRFCCCFR CCCCCFFFC FFCFFFCFF RFRFRFCFF CFFFCFFFC WFFFFFFFF CFFFCFFFC SFRFRFCFR RFRFCCCFR
```

Designer's line (1578 points):

```
N1,0 N0,1 N0,2 S0,-1 E-1,0 N1,-1 E2,0 E3,0 N2,-1 N1,-2 N2,1 E3,-1 S0,3
```

Best known line (4385 points):

```
S-1,0 N0,1 N0,2 W-1,1 N-2,1 N-2,0 E-3,0 N-1,2 E1,1 N0,-1 N-2,-1 S0,3 S-1,3
```

### 2-10, Twin cloisters

> Two monasteries arrive one after the other, in the middle of the deck. Build the board so that they have neighbours waiting.

Tip: Build your first tiles where the two monasteries can later sit in the middle of them.

Deck (13 drawn after the starter, seed 10):

```
FFFFCCCFF FFFFFFCFF RFRFFFFFR CCCCCFRFC RFFFRFFFR FFFFCCCFF WFFFFFFFF WFFFFFFFF RFRFFFFFR RFRFCCCFR FFFFCCCFF RFRFFFCFR RFFFRFCFR
```

Designer's line (1062 points):

```
N0,1 E1,1 W1,0 W-1,0 E1,-1 E0,-1 N2,0 N2,1 N1,-2 S0,-2 N2,-1 N0,-3 S0,-4
```

Best known line (2862 points):

```
N0,1 E1,1 W-1,1 W-2,1 E2,1 S-1,2 N1,2 N0,2 E1,3 N-1,3 S0,3 S2,2 N2,3
```

### 2-11, Crossings

> Two junctions, one of them a full crossroads, and ten road tiles. A crossroads ends every road that reaches it, so a short road between two of them scores quickly.

Tip: The full crossroads comes late: leave room for it where several roads meet.

Deck (14 drawn after the starter, seed 11):

```
FFFFCCCFF FFCFFFCFF CCCCCFRFC SFRFRFFFR CCCCCFFFC WFFFFFFFF RFFFRFCFR RFRFFFFFR RFRFFFFFR RFFFRFFFR WFFFFFFFR RFRFFFCFR SFRFRFRFR RFFFRFFFR
```

Designer's line (1771 points):

```
N0,1 E1,1 W-1,0 S1,0 W-1,1 N0,-1 E2,1 N2,0 E1,-1 N2,-1 W2,2 N3,-1 D E3,0
```

Best known line (3641 points):

```
N0,1 E1,1 W-1,0 N0,2 N2,1 N2,0 E3,1 S2,-1 W1,-1 E3,0 N1,0 N2,2 N3,-1 N0,-1
```

### 2-12, A long day

> Sixteen tiles: three junctions, a monastery, cities and roads. Use the deck sheet, and go for the best score there is.

Tip: Three junctions come early and late: let the roads grow between them.

Deck (15 drawn after the starter, seed 12):

```
SFRFRFFFR FFFFCCCFF FFCFFFFFC RFFFRFCFR CCCCCFRFC RFRFCCCFR WFFFFFFFF RFRFFFFFR SFRFRFCFR CFFFCFFFC RFRFFFCFR SFRFRFCFR RFFFRFFFR FFFFCCCFF RFRFCCCFR
```

Designer's line (2587 points):

```
N1,0 N0,1 S0,-1 E1,1 W-1,0 S1,2 N2,1 N2,2 E2,3 N1,-1 E2,-1 S0,-2 N1,-2 N1,3 N0,-3
```

Best known line (4119 points):

```
N1,0 E0,1 S-1,1 S-1,0 W-2,0 N2,0 N1,-1 W0,-1 S2,1 E2,-1 S1,1 N2,2 E0,-2 N1,-2 S2,-2
```

## Campaign 3: Dark Forest

The Forest theme's campaign (theme 1, the high-forest set; the shop calls it Forest): every tile of its levels is drawn
in that theme, whatever skins the player has set. The decks are taken as Open Country's, from seeds 13 to 24, from 10
tiles to 16. Its name, titles and intros are proposals for the owner, in the mood of the woods.

| Level | Title | Adds | Tiles | Seed | 3 stars | 2 stars | Designer's line | Search (method, positions, time) |
|---|---|---|---|---|---|---|---|---|
| 3-1 | Under the canopy | The same rules, in the deep woods: ten tiles to start. | 10 | 13 | **1122** best known | 786 | designer 0 | beam w16 p2 d0.4 f150 (141 settings); 778,447 positions, 119.3 s |
| 3-2 | The hermit | A lone monastery and two junctions among the trees. | 11 | 14 | **2916** best known | 2042 | designer 1904 | beam w32 pall d0.4 f50 (129 settings); 720,251 positions, 119.9 s |
| 3-3 | Woodcutters' track | A long road through the trees, and the cities beside it. | 12 | 15 | **2231** best known | 1562 | designer 1466 | beam w16 p4 d0.6 f50 (108 settings); 772,325 positions, 117.4 s |
| 3-4 | Twin shrines | Two monasteries and a full city in a short deck. | 12 | 16 | **1543** best known | 1081 | designer 419 | beam w32 p2 d0.4 f150 (118 settings); 621,057 positions, 111.9 s |
| 3-5 | Charcoal burners | Roads and cities woven together. | 13 | 17 | **1443** best known | 1011 | designer 689 | beam w32 p2 d0.4 f150 (87 settings); 509,661 positions, 116.5 s |
| 3-6 | Three chapels | Three monasteries in thirteen tiles: not every one has to score. | 13 | 18 | **2219** best known | 1554 | designer 1319 | beam w32 p4 d0.4 f150 (90 settings); 581,780 positions, 119.8 s |
| 3-7 | Moss and stone | Cities and wonders on mossy ground. | 14 | 19 | **3490** best known | 2443 | designer 2338 | beam w64 p4 d0.5 f50 (88 settings); 662,581 positions, 120.4 s |
| 3-8 | The keep in the wood | A city-heavy deck with a full city tile. | 14 | 20 | **2872** best known | 2011 | designer 838 | beam w16 p2 d0.7 f150 (106 settings); 705,348 positions, 119.7 s |
| 3-9 | Wild hamlets | Many small cities and two wonders. | 15 | 21 | **4145** best known | 2902 | designer 2256 | beam w16 p2 d0.6 f50 (88 settings); 692,706 positions, 113.8 s |
| 3-10 | Lantern road | A long deck of roads and cities. | 15 | 22 | **3748** best known | 2624 | designer 980 | beam w16 p2 d0.6 f50 (75 settings); 488,294 positions, 121.6 s |
| 3-11 | The old city | Sixteen tiles, a full city and two junctions: the largest walls of the campaign. | 16 | 23 | **2716** best known | 1902 | designer 2610 | beam w16 p4 d0.4 f50 (74 settings); 455,981 positions, 115.3 s |
| 3-12 | Heart of the forest | Everything together, sixteen tiles: the campaign's finale. | 16 | 24 | **3086** best known | 2161 | designer 1520 | beam w32 p2 d0.4 f50 (79 settings); 531,050 positions, 118.5 s |

### 3-1, Under the canopy

> The trees close in over the road. Ten tiles, the deck on the sheet: find the paths that the forest leaves open.

Tip: The monastery comes too late to be surrounded: keep the roads and the city open for the last tile.

Deck (9 drawn after the starter, seed 13):

```
RFRFFFFFR CCCCCFFFC RFFFRFFFR SFRFRFFFR FFFFFFCFF WFFFFFFFF RFFFRFFFR FFFFCCCFF RFRFRFCFF
```

Designer's line (0 points):

```
N1,0 E0,1 N-1,0 N-2,0 E-1,1 N0,-1 N-3,0 N1,-1 E1,1
```

Best known line (1122 points):

```
S0,-1 E0,1 E-1,-1 W-1,1 N0,2 D E-1,-2 E1,1 S1,0
```

### 3-2, The hermit

> A hermit keeps a chapel deep in the wood. Two junctions split the old paths around it.

Tip: The hermit's monastery comes third: give it a quiet corner the next tiles can fill.

Deck (10 drawn after the starter, seed 14):

```
FFFFFFCFF RFFFRFFFR WFFFFFFFF SFRFRFCFR RFRFRFCFF FFFFFFCFF SFRFRFRFR CCCCCFRFC FFFFFFCFF FFCFFFFFC
```

Designer's line (1904 points):

```
N0,1 N1,0 N1,1 N2,0 S2,-1 E0,2 N-1,0 E3,0 W-1,2 E1,2
```

Best known line (2916 points):

```
N0,1 N-1,0 N-1,1 E-2,0 S-2,1 N-2,2 N1,0 W-3,1 E0,2 E-1,2
```

### 3-3, Woodcutters' track

> The woodcutters cut one long track through the forest. Let it run, then close it where it pays most.

Tip: Nine tiles carry a road: one long track is worth more than three short ones.

Deck (11 drawn after the starter, seed 15):

```
RFFFRFFFR RFRFFFFFR RFFFRFFFR CFFFCFFFC CCCCCFRFC RFRFFFFFR CCCCCFRFC FFFFCCCFF WFFFFFFFR SFRFRFCFR RFFFRFCFR
```

Designer's line (1466 points):

```
N1,0 E-1,0 N2,0 E0,1 E3,0 W-1,1 W-2,1 W1,1 N0,-1 N0,2 N-1,-1
```

Best known line (2231 points):

```
N0,-1 N1,-1 N0,-2 E0,1 W-1,0 W1,0 W-1,-1 N0,2 N1,-2 S-1,-2 E1,2
```

### 3-4, Twin shrines

> Two shrines stand in a clearing, and a whole walled town comes late. Not all of them can have their room.

Tip: Of the two shrines, the second is the one the deck can surround: keep a quiet spot for it.

Deck (11 drawn after the starter, seed 16):

```
WFFFFFFFF RFRFFFFFR RFRFFFFFR RFRFCCCFR FFFFFFCFF WFFFFFFFF RFRFFFFFR FFFFCCCFF FFCFFFFFC CCCCCCCCC CCCCCFFFC
```

Designer's line (419 points):

```
N0,-1 N1,0 E-1,0 S1,1 N1,-1 N-1,-1 S-1,1 N0,-2 N1,-2 N1,2 W-2,0
```

Best known line (1543 points):

```
N0,-1 N1,0 S0,-2 E0,1 W-1,1 N1,-1 W1,-2 N2,0 E2,-2 N3,0 E2,-1
```

### 3-5, Charcoal burners

> Smoke rises over the clearings. The burners' paths run between small towns: close them in turn.

Tip: Close the small cities as they come: the late tiles are mostly road.

Deck (12 drawn after the starter, seed 17):

```
RFRFFFFFR RFRFCCCFR RFFFRFFFR CCCCCFRFC FFFFCCCFF SFRFRFCFR FFFFCCCFF RFFFRFFFR CFFFCFFFC RFFFRFFFR FFFFCCCFF RFRFFFFFR
```

Designer's line (689 points):

```
N1,0 E-1,0 E1,1 N-1,1 E0,1 E1,2 W0,2 E1,3 E-1,2 N2,2 N2,1 S1,4
```

Best known line (1443 points):

```
S0,-1 E0,1 E-1,-1 E1,1 W-1,1 E0,2 N-1,2 E-2,-1 E-2,1 E-1,-2 E2,1 S-1,0
```

### 3-6, Three chapels

> Three chapels hide among the trees, and thirteen tiles will not surround them all. Choose the ones that can score.

Tip: Two chapels come close together: build them next to each other and let the third go if it must.

Deck (12 drawn after the starter, seed 18):

```
FFFFCCCFF WFFFFFFFF CCCCCFRFC RFFFRFFFR RFRFFFFFR RFFFRFFFR RFRFFFCFR WFFFFFFFF WFFFFFFFF RFRFFFFFR FFFFFFCFF RFFFRFCFR
```

Designer's line (1319 points):

```
N0,1 N-1,1 E1,0 N-1,0 E-2,0 E-2,1 S-2,2 N0,-1 N-1,-1 N-1,2 S0,2 N-2,3
```

Best known line (2219 points):

```
E0,1 N1,1 W-1,0 E2,1 N0,2 E2,0 S2,2 N1,2 N1,3 W1,0 N2,3 E0,3
```

### 3-7, Moss and stone

> Old stone walls under the moss, and two monasteries. Close the walls, then fill the ground around the wonders.

Tip: The first monastery carries a road: put it at the end of one.

Deck (13 drawn after the starter, seed 19):

```
FFCFFFFFC RFFFRFFFR SFRFRFFFR FFFFCCCFF FFCFFFCFF RFFFRFFFR WFFFFFFFR CCCCCFFFC FFCFFFCFF WFFFFFFFF CCCCCFFFC RFRFFFFFR FFCFFFFFC
```

Designer's line (2338 points):

```
S0,1 N1,0 N-1,0 S1,1 N1,2 E-1,1 N2,0 S1,-1 N1,3 N0,2 S2,-1 W-1,2 S1,4
```

Best known line (3490 points):

```
S0,1 E-1,1 E-1,2 S1,1 N1,2 E-1,3 N0,2 E2,1 N1,3 N0,3 S1,4 W-1,4 E0,4
```

### 3-8, The keep in the wood

> A keep rises in the middle of the wood. Most of these tiles carry its walls.

Tip: Close the keep with the caps that come early: the full city tile comes too late to help.

Deck (13 drawn after the starter, seed 20):

```
CCCCCFFFC CFFFCFFFC RFFFRFFFR RFRFFFCFR FFFFCCCFF FFFFFFCFF RFRFCCCFR WFFFFFFFF FFCFFFFFC RFFFRFFFR CCCCCCCCC RFFFRFFFR RFRFRFCFF
```

Designer's line (838 points):

```
E0,1 E0,2 N1,0 E-1,0 S1,1 W-2,0 N2,0 N0,-1 S1,-1 E-1,1 N2,-1 E-1,2 S1,-2
```

Best known line (2872 points):

```
E0,1 N1,1 E-1,1 N0,2 S2,1 N2,2 S0,3 N1,2 S0,4 N2,3 D N1,3 W-1,3
```

### 3-9, Wild hamlets

> Hamlets dot the forest, each behind its own wall. Two monasteries watch over them.

Tip: Ten tiles carry city edges: join hamlets into a town before you close them.

Deck (14 drawn after the starter, seed 21):

```
RFRFCCCFR CCCCCFFFC FFFFFFCFF FFFFCCCFF CFFFCFFFC FFFFCCCFF RFRFRFCFF FFCFFFCFF RFRFFFFFR FFFFFFCFF WFFFFFFFR WFFFFFFFF FFFFCCCFF RFFFRFFFR
```

Designer's line (2256 points):

```
N1,0 E0,1 N0,2 N0,-1 N2,0 S1,-1 E1,1 N0,-2 N2,1 E3,0 S-1,0 N-1,1 E-1,-1 E2,2
```

Best known line (4145 points):

```
N0,1 N1,1 N1,2 E2,1 E2,0 W2,-1 E3,-1 E2,-2 W0,-1 W1,-2 N1,0 N1,-1 S1,3 E0,-2
```

### 3-10, Lantern road

> Lanterns mark the road through the night wood. Roads and walls come in equal numbers.

Tip: The monastery comes second: put it beside the starter's road, where the deck will surround it.

Deck (14 drawn after the starter, seed 22):

```
CCCCCFRFC WFFFFFFFF FFFFCCCFF RFRFCCCFR FFCFFFFFC RFRFRFCFF SFRFRFFFR RFRFCCCFR RFFFRFFFR RFRFFFFFR FFFFCCCFF RFRFFFFFR FFFFCCCFF RFRFCCCFR
```

Designer's line (980 points):

```
E1,0 N0,-1 W1,-1 E-1,0 S0,1 S-1,1 N-2,1 S-2,2 N-3,1 E-4,1 S-1,-1 S-4,2 E1,1 N-1,2
```

Best known line (3748 points):

```
W-1,0 N0,-1 E0,1 W1,0 S-1,1 S-1,-1 E1,-1 E1,-2 E-1,-2 N2,-2 N0,-2 W2,-1 S1,-3 W0,-3
```

### 3-11, The old city

> The forest has grown over an old city. Twelve tiles carry its walls: raise them again.

Tip: The full city tile comes fifth: build around it, and close the walls last.

Deck (15 drawn after the starter, seed 23):

```
RFRFCCCFR CCCCCFRFC CFFFCFFFC FFFFFFCFF CCCCCCCCC RFRFFFCFR RFRFFFCFR CCCCCFFFC SFRFRFCFR FFFFCCCFF FFFFCCCFF RFRFFFFFR SFRFRFFFR CFFFCFFFC RFFFRFFFR
```

Designer's line (2610 points):

```
N1,0 W-1,0 E0,1 N0,2 N2,0 S1,1 N2,1 W-1,1 E2,2 N1,2 E-1,2 S2,3 N3,3 E1,-1 N3,2
```

Best known line (2716 points):

```
N0,1 W-1,0 N1,1 E2,1 N-2,0 W1,0 E1,-1 N1,2 S2,-1 E2,0 N0,-1 N2,-2 S1,-2 E-1,-1 E3,1
```

### 3-12, Heart of the forest

> At the heart of the forest, two monasteries, long roads and walled towns. Use the deck sheet, and go for the best score there is.

Tip: The two monasteries come in the middle of the deck: keep room for them near the centre.

Deck (15 drawn after the starter, seed 24):

```
RFRFFFFFR FFFFCCCFF RFFFRFFFR FFCFFFFFC RFRFFFFFR WFFFFFFFF RFRFCCCFR WFFFFFFFF CCCCCFFFC RFRFFFFFR FFFFCCCFF RFFFRFFFR RFRFCCCFR RFRFFFCFR FFCFFFCFF
```

Designer's line (1520 points):

```
N1,0 N0,1 N-1,0 N-1,1 E-2,0 N0,-1 S1,1 N-1,-1 S0,-2 N2,1 N-1,-2 E2,2 W-2,1 N1,2 N-2,2
```

Best known line (3086 points):

```
S0,-1 E0,1 E-1,-1 E-1,1 W-2,-1 N-2,0 N-1,2 N-2,1 W-3,1 S-1,0 S-3,0 N-3,-1 N-3,2 E-2,2 E0,2
```

## How the targets are set

**Exact, where it finishes in seconds.** `packages/game-core/src/engine/solver.ts` plays the engine itself
(`EngineGame`, deck `story`): at each tile it tries every legal cell and rotation, and a discard, depth first, and keeps the
best final score. Its pruning is exact (a rotation that looks the same is tried once; on the last tile a discard is tried
only when nothing fits). Each extra tile multiplies the positions by about 6 to 10: the Tutorial's levels take at most 117,025 positions
(1-11, 8.3 s on a loaded machine); other six-tile decks tried while designing took 0.1 to 7 s. Eight drawn tiles are
already out of reach: on 1-10, the monastery rebuilt from the starter (8 tiles after it), the solver did not finish in 15
minutes (2026-10-24, `nice -n 10`, load 20 to 28 on 8 cores), so 1-10's target is best known, and the plan and the end
screen say so.

**Best known, for the long levels: the designer's line, then a strong search from it.** Each long level has a
**designer's line** (`packages/game-core/src/engine/designer.ts`): the way the team plays a fixed deck by hand, written down
as rules so that anyone can replay and check it. For each tile in hand: (1) if a placement scores, take the one that scores
most; (2) otherwise keep the board tidy: the placement that leaves the fewest open half-edges, then the one that grows the
largest open road or city, then the one nearest the starter; (3) discard only a tile that fits nowhere. It is a human
player's line, not a search: it plans no further than the tile in hand, so it is the floor a careful player reaches. The
plan stores it beside the target, the test replays it and checks that the rules still give it, and the target is never
below it.

Then `packages/game-core/src/engine/beam.ts`, a beam search on the same engine, **starts from the designer's line**: at each
draw, every kept position tries every legal placement of the tile in hand and a discard; the children are ranked by their
score plus an estimate of their open structures (what a road, a city or a wonder would score closed, and a forest
the roads and cities along it, each discounted by its open half-edges), boards reached twice are kept once, and the best
`width` positions go on, with the designer's position at that draw always kept among them (so no search ends below the
designer's line, and a narrow search can still branch off a good human line late in the game). The last two draws are then solved exactly (`solveFrom`) from the 8 best positions. No single
setting of the estimate wins everywhere, so `packages/game-core/scripts/story-search.ts` runs a fixed portfolio of
settings (width 16 to 1024; 2, 4 or all children per position; 4 discounts; 2 forest weights), cheapest first, until the
level's **time cap of 120 s**, and keeps the best line. Every setting is deterministic: the same setting gives the same
line on any machine; the table names the setting that found each target.

**Checked against the exact solver.** On the Tutorial's levels the beam finds every exact optimum (the test asserts it on
levels 1 to 5 at width 64), so the method is sound where it can be checked; on long decks it is a lower bound.

**Stored, replayed, raised.** A level's target, the line that reaches it and the designer's line are stored in `plan.ts`.
The test replays each line on the engine and fails if the best line does not reach the target exactly or the target is
below the designer's line. `story-search.ts --write` replays the stored line first and writes a new target only when the
designer's line or a search beats it: a target only ever rises. A designer who finds a better line by hand adds it the same
way (it replaces the stored line when it scores more). A player's run above a best-known
target is kept on the device in the submission's shape; once runs reach the chain (#548), a higher run can be replayed and
become the new target the same way. The plan says plainly which targets are proven (**exact**) and which are the **best
known**: the end screen says it too.

Run it outside the tests, one level at a time, under `nice -n 10`:

```
nice -n 10 bun scripts/story-search.ts --campaign 2 --level 1 --cap 120 --write
```

The costs in the tables were measured that way, one level at a time (#721, 2026-10-24, on a loaded machine: the load
average stood at about 15 to 28 on 8 cores, so a level tried fewer settings within its cap than on a quiet one). Each
search started from the designer's line; the table names the setting that found the target, with the number of settings
tried, the positions and the time.

## How a long level's deck is chosen

A Story level fixes the draw order, so a long level needs a fixed order the engine's deck rules allow. Open Country and Dark
Forest take it from the Challenge's own draw (`packages/game-core/src/story/deck.ts`, `seededDeck(seed, drawn)`):

- **The seed** gives the 34 cards the simple deck withdraws at the start (`withdrawExtra`, as `Deck::tiles` on chain): the
  38 cards left are the game's, the starter included. **The withdrawn cards never appear**: a level's deck is drawn from the
  38, never from the 72, exactly as in a Challenge game.
- **The order** is the one the simple deck deals for that seed when every tile is discarded. In the Challenge a build
  reseeds from the cell the tile went to, so the order depends on the moves; a discard always reseeds from the centre, so
  "every tile discarded" is the one order of a seed that does not. A level takes its first `tiles - 1` plans; the last
  level of a campaign takes at most 15 (16 tiles with the starter).
- **The seeds** are 1 to 12 for Open Country and 13 to 24 for Dark Forest, one per level, in order: the levels are as
  random as a real game, and anyone can rebuild a deck from its seed (the test does). A campaign's sizes never go down
  from one level to the next, so a level keeps the start of its seed's draw whatever its length. A designer can still
  hand-pick a level's order later: the plan then stores that order and no seed.

## The screens (PR 2)

- **Story** (`/story`): the campaigns one under the other, each with its stars (held / possible) and its levels: number,
  title, tiles, stars, and a lock. A locked campaign says how many stars it needs and how many are held. One column on a
  phone, a grid of three from tablet up. Home and Play lead here; `/tutorial` redirects here; the scripted tutorial's code
  is removed (the engine keeps the contracts' tutorial deck for its parity tests).
- **Level** (`/story/:campaign/:level`): the board of Training, with the level's name in the header.
  - **Deck presentation** (#593): the level opens on its deck, over the board: the campaign and level, the title, the
    intro, then the tiles the level deals, grouped by plan with their counts (the build-time renders, landing one after
    another in under a second), the player's best so far, and Start; a tap anywhere starts too. The device remembers it per
    level (`paved:story-decks:v1`): a replay, or a later visit, goes straight to the board, and the deck sheet's "Present
    the level again" shows it on request. Under reduced motion the tiles are there at once.
  - **Star thresholds are hidden** (#593): no screen shows the score a star needs (not the level card, not the
    presentation, not the HUD). They stay in the plan, which computes the stars.
  - **Coach marks**: the level that introduces a control shows one tip under the header and rings that control on the
    board: Place tile (1-1), the rotate and cancel bubble on the tile (1-2, a tip only: the bubble sits on the tile),
    Discard (1-3, 1-4), the deck sheet's "Tiles left" (1-5, 2-1), the season wheel (1-6), the settings gear (1-7). "Got it"
    hides it.
  - **The tip and the theme** (#721, STORY-SCREENS): the intro also shows the level's tip, set apart, and every tile of a
    level (the board, the starter, the hand, the stack, the intro, the deck sheet) is drawn in its campaign's theme.
    STORY-SCREENS may move the "Tiles left" coach mark from 2-1 to the new 1-11, which introduces the deck sheet.
  - **No Surrender**: a level restarts with Replay instead.
  - **End** (#593): over the board, the stars earned fill one by one, each with a sound (`place`, the third `wonder`) and a
    buzz where the device has one; a tap skips to the end, and under reduced motion they are there at once. Then the score
    screen: the score, a new personal best, **how many points the next star was missing** (the only figure drawn from a
    threshold), the note when the player beat a best-known target, then Next level (when it is open), Replay, Levels, and
    Board (the finished board, with a bar that brings the result back). Tutorial level 1's end also offers First Stone
    (`claim_tutorial`, connected players; Connect is offered to a guest).
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

1. **The level list** (#721): three campaigns of 12 levels, 36 in all; the Tutorial's levels one rule each, finale
   last. Reorder, drop or reword freely: only the decks and numbers have to be recomputed, and the test will say which.
2. **In Tutorial levels 1, 2 and 5 no outcome falls between 70 % and 100 %** (checked over every playable game:
   level 1 ends on 0, 209 or 321; level 2 on 0, 419 or 643; level 5 on 0, 319, 369, 419 or 740), so 2 stars and 3 stars
   coincide there. That is acceptable for the first levels; if not, a decoy tile can allow a middle score. Levels 3 and 4
   do have a 2-star outcome (369, and 738). The new 1-10 and 1-11 were not enumerated this way (1-10 is out of the exact
   solver's reach).
3. **The wonder level (1-10) starts from the starter alone** (#721): the monastery comes first, then the seven tiles that
   can surround it with the starter. Eight drawn tiles are beyond the exact solver, so its target is the best known one,
   labelled so on the end screen.
4. **The new Tutorial level, 1-11 Look ahead** (proposed): planning with the deck sheet, placed just before the finale. Its
   first tile can close the starter's city at once (419 points), the move a player who plans no further takes (the
   designer's line ends on 1,480); placed elsewhere it lets the tiles after it score 2,250, the exact optimum. 2-1's coach
   mark introduces the deck sheet today; this level would introduce it in the Tutorial.
5. **Dark Forest**: its name, its titles and intros, and its sizes (10 to 16 tiles, from seeds 13 to 24) are proposals
   for the owner.
6. **Starter**: every level uses the usual starter, so the board looks the same in every level and the engine needs
   nothing special. A level with another starter is possible if wanted.
7. **Showing the whole deck** (#540's deck sheet): built as the whole fixed deck in every level, in draw order.
8. **Intro texts and tips** are drafts; they are not final copy. The tips name no figure: no star threshold, no cell.
9. **How long-deck targets are set**: the higher of the designer's line (the written rules above, stored and replayed per
   level) and the deterministic beam portfolio started from it, the exact solver finishing the last two draws, capped at
   120 s per level; stored with its line and replayed by the test, raised whenever a search, a better designer's line or
   a replayed run beats it, and labelled "best known" in the plan and on the end screen. A longer cap is possible
   offline. A player beating a best-known target gets 3 stars and is told so.

## Next

Once this plan is validated: the Cairo side lands (STORY-CHAIN), then the wiring (#548: the levels on chain, the
submission at the end of a run, the Cobble rewards, Open Country and Dark Forest in `scripts/deploy.sh`). Each new tile
theme after Forest ships with its own campaign.
