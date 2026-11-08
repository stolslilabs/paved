# The Puzzle: Play's Limited mode (contracts specification)

Written by track CLIENT for track CORE, with the client side built (PUZZLE-MODE). The client runs on the mock source today
(`packages/app/src/data/mock/puzzle.ts`). On chain the Puzzle has no contract yet, so Play's card shows "Coming soon" there
(`routes/sources.ts`, no `puzzle` source). This document is the contract the chain and the indexer must meet so that the client's
`PuzzleSource` (`packages/app/src/data/puzzle-source.ts`) can read and write the chain behind the same interface.

Every gas figure below is an estimate. No Cairo build or test was run for this design.

## 1. The owner's rules (2026-11-08)

- Every player plays **the same deck** on a given day. A game is a Training game: 38 tiles, the simple deck.
- **The deck's random is per day**: one seed per UTC day fixes which 38 of the base cards are in the deck.
- **Each tile drawn stays random from the VRF**: the order in which a game draws its deck is its own, drawn as the Challenge
  draws.
- **A daily leaderboard.** The day's best player wins **250 Cobbles**.
- **No XP and no chest** in this mode.

Defaults the client assumed, never contradicted by the owner. The client's UI shows them, so CORE keeps them unless the PM
rules otherwise:

| Point | Default |
|---|---|
| Attempts per day | Unlimited. The player's best score of the day counts. One game open at a time. |
| The day's deck | Public before playing: the view shows today's 38 cards (`puzzleDeck`). The order of each game's draws is not known in advance. |
| Ties | The earlier result ranks first. Its time is the block timestamp of the game's last move; in the same second, the result completed first (its transaction first in the chain's order). |
| The day | A UTC day, `timestamp / 86400`: the Challenge's `day_id`. It ends at 00:00 UTC. A game that ends after its day's end ranks nowhere. |
| Who wins | The first place at the day's end, one player. There is no prize on a day with no result. |
| The claim | Any time after the day's end, by the winner, once per day. Several days can be claimed in one call. |

## 2. Shared rules (game-core)

`packages/game-core/src/puzzle.ts` holds the rules that the client and the contracts must agree on, with their tests
(`packages/game-core/__tests__/puzzle.test.ts`):

- `PUZZLE_DAY_S = 86400`, `puzzleDayOf(t) = floor(t / 86400)`, `puzzleDayEnd(d) = (d + 1) * 86400`.
- `PUZZLE_PRIZE_COBBLES = 250`, `PUZZLE_TILES = 38` (the simple deck's count, starter included).
- `puzzleDeck(daySeed)`: the day's deck is the starter first. It is followed by the base cards that `withdrawExtra(starter bit,
  daySeed, total, count)` keeps, in deck order (`plan(index + 1)`). It is the same walk as a game's start
  (`GameImpl::start` → G1's `withdraw_extra`) with the **day's seed** in place of the game's.
- `comparePuzzle`: the one order of a day's ranking. The score in descending order, then the time in ascending order, then the
  completion order (`order`) in ascending order. Two results of a day never share an `order`, so the order is total: no two
  results tie. `rankPuzzle` sorts by it; `puzzlePlaceAmong` is one more than the number of results it ranks above. The
  standings, a game's place before and after it, and the prize all use it.
- `order`, the completion order: the place of the transaction of the result's last move in the chain's order. On chain it is
  the counter of section 3.4; the indexer reads it from the event (section 4). The client's mock uses its ledger's transaction
  number.

The engine takes the split between the deck and the draws as `EngineConfig.deckSeed`
(`packages/game-core/src/engine/game.ts`). With it, a simple-deck game withdraws its extras with `deckSeed`, while its draws
keep the game's own seed. Only a simple deck accepts it. `SeededChallenge(seed, player, deckSeed)` and
`SeededChallenge.replay(seed, player, moves, deckSeed)` replay a Puzzle game exactly as the chain plays it, with a three-tile
queue drawn from the VRF.

**The parity the contracts must keep:** `GameImpl::start` takes an optional deck seed, and `withdraw_extra(deck_seed)` must
give the same bitmap as game-core's `withdrawExtra(daySeed)`. The parity fixture (`docs/architecture/parity-fixture.md`) gains
one Puzzle game: a day seed, a game random and its moves, with the expected deck, draws and score.

## 3. The system: `Puzzle`

A new Dojo system, `paved::systems::puzzle`. It embeds the components the Challenge uses for a game (`Playable`, `Deckable`,
`Drawable` for the VRF) and nothing of the Challenge's money path: no price, no stake, no payable, no NFT mint. Its games live
in the same `Game` and `Tile` models under their own ids. `GameState`'s mode gains a Puzzle value (`types/mode.cairo`), so
`GameOver` and the indexer can tell a Puzzle game apart.

### 3.1 The day's seed

A day's seed is drawn once, by **the day's first spawn**, from the VRF:

| Draw | When | `kind` | `game_id` of the salt | `draw_index` | What it gives |
|---|---|---|---|---|---|
| The day | the first `spawn` of day `d` | `'PUZZLE_DAY'` | `d` | 0 | the day's seed (the deck), stored in `day_seeds[d]` |
| The spawn | each `spawn` | `'PUZZLE_SPAWN'` | the player's address | the player's Puzzle spawn count | the game's random: its three first tiles and its later draws' base |
| A move | `build`, `discard`, when a tile is left to queue | `'PUZZLE'` | the game id | the id of the queued tile | the tile appended to the queue |

One transaction makes one VRF draw (`vrf-draws.md`, section 3). The first spawn of a day therefore needs two randoms: the
day's and the game's. It draws once, with the spawn's salt, and derives both from that one random `r`:

- the day's seed is Poseidon(`r`, `'PUZZLE_DAY'`);
- the game's random is `r`.

The day's seed is written only while `day_seeds[d]` is zero, so a later spawn of the same day reads it and never changes it.

**Why not a seed known in advance (for example Poseidon(`d`)):** the deck would be known days ahead, and a player could
precompute strategies for it. Drawn by the day's first spawn, the deck is known only once the day has started. It is still
public from that moment on, which the owner wants (the view shows it).

Today's seed is public: `day_seed(d) -> felt252`, zero until the day's first spawn. The client shows the deck from it.
Before the first spawn, the view shows "no one has played today yet" and Play spawns the day.

### 3.2 Spawning a game

`spawn() -> u32`. It is free, so there is no `spawn_free` and no price.

1. The caller has no Puzzle game of today still open (`open_game[player]`, the id of their open game, if any). Otherwise:
   `'Puzzle: a game is open'`.
2. The VRF draw of the spawn (section 3.1), and the day's seed if this is the day's first spawn.
3. The game starts on the simple deck, with the day's seed as `deck_seed` (the extras withdrawn) and `r` as its random. It
   takes the three-tile queue of the Challenge (`challenge-vrf.md`, 2.1 and 2.2), its first three tiles taken from `r`'s
   sub-seeds.
4. The game records its day: `game_day[game_id] = d`. The ranking uses the spawn's day, never the day of a later move. A game
   spawned at 23:59 belongs to that day and ranks only if it ends before 00:00.
5. Event `PuzzleSpawned { game_id, player, day, day_seed }`.

### 3.3 Moves and the end

`build(game_id, orientation, x, y)`, `discard(game_id)` and `surrender(game_id)` are the Challenge's (`Playable`), with
these rules:

- A move after the day's end is refused (`'Puzzle: the day is over'`), except a surrender, so that a game can always be closed.
  This is the Challenge's expiry, with `expires_at = puzzleDayEnd(day)`.
- The game ends when its last tile is played, or by a surrender. At its end, `finish`:
  - computes the score as a Training game's (the same closings, no XP and no chest: the `rewards` path is not called);
  - if the game ended **before** its day's end, it offers the score to the day's ranking (section 3.4);
  - clears `open_game[player]`;
  - emits `PuzzleOver { game_id, player, day, score, end_time, order, ranked: bool }` (`order`: the completion order of section
    3.4, 0 for a game that does not rank).

### 3.4 The day's ranking on chain

The chain keeps only what the prize needs. The leaderboard's list belongs to the indexer (section 4).

- `results: u64`: the completion order, a counter of the system. Each game that ranks (it ends before its day's end) takes
  `results + 1` as its `order` at its end and writes the counter back. It goes up with the chain's transaction order, so the
  result completed first has the lower `order`, in the same block too. Estimate: one read and one write, about 195,050 L2 gas, at
  the end of a ranked game only.
- `best[(day, player)] = (score, time, order)`: the player's best result of the day. A result replaces it only when its score is
  strictly higher. An equal score keeps the earlier result, because the earlier submission wins a tie.
- `leader[day] = (player, score, time, order)`: the day's first place, by `comparePuzzle`. A result replaces it only when its
  score is strictly higher: a later result has a later or equal time and a higher `order`, so an equal score never ranks above
  the leader. The time is the block timestamp of the game's last move. Two equal scores in the same block resolve by `order`,
  the transaction first in the block's order holding the lead.
- `players[day]: u32`: the number of players with a result that day. It goes up by one when `best[(day, player)]` is first
  written.
- `led_days[player]`: the days the player led **at the day's end**. Section 5 explains how the client derives its mail from
  it.

Event `PuzzleBest { day, player, score, time, order, leader: bool }` when a player's best changes. `leader` is true when this result
is the day's first place now.

**`led_days` without a closing transaction.** No transaction runs at 00:00, so the chain cannot write "the winner of day `d`"
when the day ends. It keeps the current leader instead, and the claim decides:

- `leader[d]` stops changing once the day is over, because no game of day `d` ranks after its end (section 3.3). The leader
  read after `puzzleDayEnd(d)` is therefore the day's winner.
- `led_days[player]` is a list the player appends to when they **become** the leader of a day. They may lose the lead later
  the same day. The list says "may have won". The client checks each day against `leader[d]` (section 5).
  - Size: at most one entry per day per player, written only on becoming the leader.
  - Estimate: one storage write of about 118,210 L2 gas, on top of `leader`'s write, on the moves that take the lead. Most
    moves pay nothing.

### 3.5 The claim

`claim(days: Span<u64>) -> u32`, the Cobbles credited.

For each day:

- the day is over (`now >= puzzleDayEnd(d)`), else `'Puzzle: the day is not over'`;
- `leader[d].player` is the caller, else `'Puzzle: not the day's winner'`;
- `claimed[d]` is false, else `'Puzzle: already claimed'`. It is then set.

The total, 250 per day, is credited through `Setup`'s ledger by a new `ISetupPuzzle::credit_puzzle(player, days, cobbles)`.
It follows `credit_story` and `credit_league` (`systems/setup.cairo`), with `CobblesClaimed` as its event. The client's mock
refuses with the same texts (`data/mock/ledger.ts`: `puzzleClaim`), so the client's error mapping does not change.

Cost estimate per day claimed:

| Step | Cost (L2 gas) |
|---|---|
| Read `leader` | about 76,840 |
| Read `claimed` | about 76,840 |
| Write `claimed` | about 118,210 |
| Total | about 272,000 |

The `Setup` credit is added once for the whole call.

### 3.6 Reads

| Read | Returns | Used by |
|---|---|---|
| `current_day() -> u64` | `timestamp / 86400` | the card's and the view's day |
| `day_seed(day) -> felt252` | 0 until the day's first spawn | `PuzzleStanding.seed`, the deck sheet |
| `open_game(player) -> u32` | 0 for none | `activeGame` |
| `game(game_id) -> GameView` and `tiles(...)` | the Challenge's views | the board, its replay (`replayPuzzle`) |
| `best(day, player) -> (u32, u64, u64)` | the player's best, its time and its order | the card's PB |
| `leader(day) -> (ContractAddress, u32, u64, u64)` | the day's first place | the trophy's goal, the claim's check |
| `players(day) -> u32` | the count | "N played" |
| `led_days(player) -> Span<u64>` and `claimed(day) -> bool` | the days to check, and their claims | the Inbox's mail |
| `draw(game_id) -> DrawView` | the next draw's salt | the client's VRF request (as `Challenge::draw`) |
| `spawn_salt(player) -> felt252` | the spawn's salt | the client's VRF request |

## 4. The indexer

The leaderboard lists the first 50 players of a day (`PUZZLE_STANDING_LIMIT`), with their profiles, plus the viewer's own
place. The chain does not sort, so the indexer does (`docs/architecture/indexer.md`):

- From `PuzzleBest`, it keeps per day the best `(score, time, order)` of each player, ranked by `comparePuzzle` (`rankPuzzle`).
  `order` is the event's own. Its equivalent from the indexer's side, which must give the same order, is the event's position
  in the chain: `(block_number, transaction_index, event_index)` in ascending order. The indexer checks that both agree and
  ranks by `order`, so a same-second, same-block tie never depends on the order the events were stored in.
- `standing(day, viewer)` answers the first 50, `players`, and the viewer's place: one more than the results ranked above it,
  as in `puzzlePlaceAmong`.
- `result(game_id)` answers a finished game's effect from `PuzzleOver` and the player's previous `PuzzleBest`: the best and the
  place before and after the game, and `late` when the game was not ranked. The places use the same `comparePuzzle` as the
  standings, so the end screen's place is the leaderboard's.
- `prizes(player)` answers each day of `led_days` whose final `leader` is the player (the first of `comparePuzzle`, as the chain's
  `leader`), with the day's score, `players`, its first
  10 (`PUZZLE_PRIZE_TOP`) and `claimed`.

The indexer is a convenience, not an authority. The chain alone decides the prize: the claim checks `leader[d]`. A client
with no indexer can still list its prizes from the chain's `led_days` and `leader` (section 5).

## 5. The Inbox: mail without a server

The owner's ask: a mailbox where the system's mail waits, such as a Puzzle prize, with no central server. The prize needs no
transaction at 00:00, and so no event announces it. The client derives the mail instead:

1. It reads `led_days(player)`, or the indexer's `prizes(player)`.
2. For each day `d` that is over, it reads `leader(d)`. The day is a prize when the leader is the player.
3. The mail is "Puzzle of <day>: you won!". It waits while `claimed(d)` is false, and is marked claimed after that.
4. The Inbox's "Claim all" and a mail's gift both call `claim(days)`.
5. **Deleting a mail is local.** It hides the mail on the device (`paved.inbox.hidden.v1`, `data/puzzle.ts`:
   `useHiddenMails`). Deleting a mail whose gift still waits claims it first (`PrizeMailView`). Nothing on chain records a
   deletion.

The mail's id is `puzzle-<day>` (`puzzleMailId`), so the route `/chat/mail/puzzle-<day>` is stable. The Chat badge counts the
gifts that wait (`social-count.tsx`). Other system mail can follow the same pattern later: a chain state that the client reads,
and a local hide.

## 6. What the client expects, and where it plugs in

- **The source.** `PuzzleSource`'s methods map to section 3.6 and section 4:
  - `standing`, `result` and `prizes` read the indexer;
  - `activeGame` and `game` read the chain;
  - `start`, `play` and `claim` are the system's `spawn`, `build`/`discard`/`surrender` and `claim`.
  - `visit` is the mock's alone (its welcome prize) and is a no-op on chain.
- **The game.** `usePuzzleSession` (`data/puzzle-game.ts`) applies each move at once on the engine and queues its send. On
  chain it becomes a `PredictedSession` on the Puzzle system, the Challenge's, with each move's VRF request (`draw`) before
  the move.
- **The rules a refusal carries.** The client shows the chain's reason. The mock's texts are those of section 3:
  - `'Puzzle: a game is open'`
  - `'Puzzle: the day is over'`
  - `'Puzzle: the day is not over'`
  - `'Puzzle: not the day's winner'`
  - `'Puzzle: already claimed'`
- **Turning it on.** Add `puzzle` to the chain's sources in `routes/sources.ts` once the system and the indexer answer. Play's
  card then replaces "Coming soon" by itself (`usePuzzleAvailable`).

## 7. Open points for the PM

1. **Bots.** A free mode with a Cobbles prize invites farming accounts. The Challenge's guard does not apply because nothing
   is paid. Options:
   - a minimum level to play;
   - a prize only above N players;
   - the prize paid to the first place among accounts older than a day.
2. **The day's first spawn pays the day's draw.** It pays one VRF draw, as every spawn does. Only the Poseidon and the extra
   seed write are added, about 120,000 L2 gas, once per day.
3. **A player who abandons a game.** An open game blocks the next spawn until it is surrendered. The client always offers
   Resume or Surrender. Should the chain also let a spawn of a new day close the previous day's open game by itself?
