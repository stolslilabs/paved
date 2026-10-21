# The Challenge on Cartridge's VRF, with a queue of three tiles (#645, design)

Track CORE's design for #645, part of the PvP plan #637 (open point 6). It builds on #638's VRF component
(`vrf-draws.md`).

## 1. The owner's rulings

- **2026-10-20, #637 open point 6:** the Challenge draws from the VRF too, "a true random for every draw". This was to
  be confirmed, since it reverses D-3, D-13 and D-28.
- **2026-10-21, the go (comment on #645): yes, with a two-tile lookahead.**
  - The VRF draws tile **N+2** at each move. The player always sees the tile to place and the next two.
  - The game state holds a queue of three known tiles: the current one, the next and the one after it.
  - The start of a game draws the first three. Each confirmed move consumes the current tile and appends one tile drawn
    from the VRF.
  - The UI shows the tile to place large, with the two coming tiles smaller beside it, in order. The deck sheet counts
    the rest as before (#613).
  - Training keeps its local random, with the same three-tile queue. Story is unchanged (fixed decks).
  - The engine, the parity fixture, the goldens and the e2e run on the mock VRF with this queue.
  - Cartridge's point 2 (can a player get the proofs of future seeds from the public server?) stays a question to ask.
    With a two-tile horizon the exposure is bounded anyway.
- The owner's reasoning: drawing only N+1 postpones the problem, since a good player waits for the information before
  playing anyway. A short known horizon is better gameplay, with fewer moves dictated by fate.

**The decision rows.** D-30 is added. The VRF parts of D-3, D-13 and D-28 are marked "reversed by D-30"
(`docs/programme/DECISIONS.md`). R-4 is updated (`docs/programme/RISKS.md`).

## 2. What changes on chain

### 2.1 The draws

Every random of a Challenge game comes from `DrawableComponent::draw_random`, which `Challenge` now embeds. That is one
draw per transaction, and the draw must be the transaction's first consume (`vrf-draws.md`, section 3).

| Draw | When | `kind` | `game_id` of the salt | `draw_index` | What it gives |
|---|---|---|---|---|---|
| The spawn | `spawn`, `spawn_free` | `'CHALLENGE_SPAWN'` | the player's address | the player's spawn count in this contract | the game's seed, so its deck (G1's walk), and the three first tiles |
| A move | `build`, `discard`, when a tile is left to queue | `'CHALLENGE'` | the game id | the id the queued tile will have | the tile appended to the queue |

The salt is `draw_salt(kind, game_id, draw_index)`, as #638 rules: nothing the player chooses enters it.

**Why the spawn's salt is keyed by the player, not the game id.** The game id is a global counter. A client that
salted with "the next id" would race every other buyer, and its request would go stale whenever another spawn landed
first. Keyed by the player and the player's own spawn count (`vrf_spawn_counts`, a new map of `Challenge`), the salt is
known before the transaction and nobody else can move it. A reverted spawn does not count, so its retry draws the same
random. The count is incremented by the spawn that draws, free or paid, and is never read for anything else.

**From one random, several tiles.** The spawn needs three tiles, and a game spawned before this change needs three on
its first move (section 2.4). One transaction draws once, so these take sub-seeds of the one random `r`: `r` for the
first tile, then Poseidon(`r`, 1) and Poseidon(`r`, 2). Each tile is drawn with `draw_from_bitmap` from its sub-seed, on
the game's deck bitmap, as before. The spawn also takes `r` as the game's seed, so G1's walk builds the deck of 38
tiles from it. The seed no longer changes after the spawn: the reseed of `build` and `discard` (`GameImpl::reseed`)
is gone for VRF games.

### 2.2 The queue in `GameState`

The current tile is the tile in hand, as before: `held_tile` and its `Tile` slot, written with the plan when it is
revealed. The two next tiles are plan codes only. They get ids when they come into the hand, so the tile ids, the
`tile_count`, the end of the game and the events keep their meaning.

The two plans and a mark take 11 bits of the high half of `GameState`'s second slot. These bits are above the counters
and the free mark, so they are free in every slot written before (`upgrades.md`, "Packed slots keep their bits"). The
dead bits 72..88 (the roles before D-18) are not reused.

| Bits of the high half | Field |
|---|---|
| 0..8 | `tile_count` |
| 8..40 | `score` |
| 40..48 | `discarded` |
| 48..56 | `built` |
| 56 | `over` |
| 64..72 | `held_tile` |
| 72..88 | dead since D-18, written 0, never reused |
| 88..112 | `counts` (23 bits) and the free mark (bit 111) |
| **112..117** | **`next`: the plan of tile `held_tile + 1`, 0 for none (plan codes are 1 to 19)** |
| **117..122** | **`after`: the plan of tile `held_tile + 2`, 0 for none** |
| **122** | **the VRF mark: the game draws from the VRF** |

The high half stays below 2^123, so the slot stays under the felt's bound. `Game` gains one field, `queue: u16`,
holding the 11 bits in the same order.

### 2.3 A move

`build` and `discard` work as before, up to the draw:

1. The tile in hand is placed or discarded, and the game is over when `tile_count >= tile_limit` (unchanged).
2. If the game is not over, `next` comes into the hand as tile `tile_count + 1`, `after` moves to `next`, and the VRF
   draws the new `after`, tile `held + 3`, when that id is within `tile_limit`. Otherwise `after` stays 0.

So the last two moves before the end draw nothing, and the move that ends the game draws nothing. The deck's last tile
(id 38) is drawn by the move played on tile 35.

Whether a move draws is a pure function of the game state before the move (`GameImpl::move_draw`). `Challenge`
evaluates it before the move, draws if it must, and hands the random to `PlayableComponent`. The `draw` view returns
the same function's answer to the client (section 3).

### 2.4 Games spawned before this change

A Challenge game spawned by an older class has no queue and no mark. Its first move after the upgrade draws once from
the VRF, salted with the id of the tile that comes into the hand, and fills the hand and both queue slots from that
random (section 2.1). It sets the mark, and the game then goes on as a VRF game. Its seed and its deck are kept.
`initial_seed` answers the stored seed for a game with the mark: the spawn's random, or, for a game moved to the VRF
by a move, its seed at that move. For a game without the mark it answers the token seed, as before. The deck sheet
reads `tiles` (section 3), not the seed.

Since D-27, Sepolia starts again from a fresh deployment, so no live game is expected to take this path. It is kept
because the upgrade discipline asks for it, and it costs little: it is the spawn's fill, run from a move.

### 2.5 What does not change

- `Story`: its levels are fixed decks, replayed in one call (`submit_run`). It draws nothing.
- `TokenSeed` and `SeedSource` stay. `SeedSource` gives the spawn its seed, now from `VrfSeed`, the spawn's random.
  `TokenSeed` stays for `initial_seed` on games spawned before this change. `DaySeed` stays test-only, for the seed
  tests.
- The scoring, the deck's composition (G1's walk from the seed) and `draw_from_bitmap`.

## 3. The client's contract

**The provider.** `Challenge.set_vrf_provider(address)` is owner only, and emits `VrfProviderSet`. Its read is
`vrf_provider()`. On devnet the provider is the mock (`deploy.sh` sets it). On Sepolia and mainnet it is Cartridge's.
Until a provider is set, every spawn and every move that draws reverts with `'VRF: no provider'`.

**New views** (`IChallengeDraw`, additive: `GameView` is unchanged):

- `draw(game_id) -> DrawView`:
  - `next` and `after`: the plans of the two coming tiles (0 for none).
  - `tiles`: the deck bitmap. Its clear bits under the deck's 72 are the tiles still to draw, so the deck sheet counts
    them with no seed. It reads 0 once the deck's last tile is drawn: `draw_from_bitmap` resets it.
  - `vrf`: the mark.
  - `draws`: whether the next `build` or `discard` draws.
  - `salt`: the salt of that draw, 0 if none.
- `spawn_salt(player) -> felt252`: the salt the player's next spawn draws with.

**The multicall.** A call that draws puts `request_random(Challenge, Source::Salt(salt))` on the provider first
(`withVrfRequest` in `@paved/chain`). A call that does not draw must not request: Cartridge's wrapper ends with
`assert_consumed`, which reverts when nothing consumed. So:

- `spawn` and `spawn_free`: always request, with `spawn_salt(player)`.
- `build` and `discard`: request only when `draw(game_id).draws`, with its `salt`.
- `surrender`: never.

**The event.** Each tile that enters the queue emits `Queued { game_id, tile_id, plan }`, with the id the tile will
have in the hand. A spawn emits three (ids 2, 3 and 4), and a drawing move emits one. So the client learns the new
tile from the move's receipt, with no view read. The tile that comes into the hand is the `next` the client already
knows. The indexer can rebuild the queue from these events.

**The client can no longer predict a draw.** The predicted session (`@paved/game-core`, `predicted-session.ts`) plays a
move optimistically. The tile that comes into the hand is known (it was `next`), and the tile it appends is not. The
UI shows the queue's last slot as pending until the receipt's `Queued` arrives.

### What the client task needs (filed apart by the coordinator)

- `@paved/chain`:
  - the `draw` and `spawn_salt` views;
  - the `Queued` event;
  - `withVrfRequest` on spawn, and on build and discard when `draws`;
  - `request_random` as a session policy;
  - the deployment's `vrfProvider`, which exists since #638.
- `@paved/game-core`:
  - the engine's draw takes a queue of three;
  - Training draws locally into the same queue;
  - the predicted session takes the appended tile from the receipt;
  - the parity fixture is transcribed again from the regenerated goldens (`transcribe-goldens.ts`). Its games carry
    their drawn plans, which the engine now takes as given, instead of predicting them from the seed.
- `@paved/app`: the hand panel shows the current tile and the two next ones. The deck sheet counts the rest from
  `tiles`.
- `@paved/indexer`: `Queued`, if the API serves the queue.

**Deployment gate.** A Sepolia deployment of this class goes with that client work. An older client sends no
`request_random`, so every spawn and every drawing move reverts on Cartridge's provider (`NOT_FULFILLED`). The devnet
mock answers without a request, so an older client still plays on devnet, with a wrong predicted tile.

## 4. Tests, gas and size (as built)

**Tests.**

- **Every test that plays a Challenge game runs on the mock VRF.** `setup::spawn_game` deploys `MockVrfProvider` and
  sets it on `Challenge` (`setup::set_mock_vrf`). The test dispatcher (`setup::TestChallenge`) runs each `spawn`,
  `spawn_free`, `build`, `discard` and `surrender` in a transaction of its own (`setup::next_tx`), and the test goes on in
  a fresh one. One draw per transaction is the rule, and snforge's hash is otherwise one for the whole test. `Challenge`
  is deployed at a fixed address (`setup::deploy_challenge`): the mock's random is keyed by its consumer, so the draws of
  the goldens and of the gas scenarios do not move when a class hash does.
- **The goldens.** They spawn through `Challenge.spawn` on the mock (`harness::spawn_golden`, the player's spawn `n` for
  `day(n)`), not on the day seed any more. The forced games keep their boards and scores, and their `drawn` plans are
  recorded again. `daily_deck` keeps its 0. `daily_full_deck` is a new game (final 6,558), chosen by its generator, with
  the oracle's walks giving every score (`golden-games.md`, "Regenerated in CHALLENGE-VRF"). The differential boards
  force every plan and do not change.
- **New tests** (`tests::challenge_vrf`, coverage group `tests-challenge-vrf`). Each expected draw is computed from the
  mock's formula and the salt of section 2.1, then replayed on an in-memory `Game`:
  - the spawn's seed, deck and three tiles, and the three `Queued`;
  - the spawn salt per player, and a reverted spawn that counts nothing;
  - a move's shift and its N+2 draw, the `draw` view, and a build that draws as a discard does;
  - a retried move draws the same tile;
  - the end of the deck: the last two moves and the game over draw nothing (the provider's consume count);
  - the legacy fill: three tiles from one draw, and the mark set;
  - the provider's rules: one draw per transaction, nothing draws without a provider, `set_vrf_provider` (owner only,
    never zero, `VrfProviderSet`), and a surrender draws nothing;
  - a fuzz over the tile limit (4 to 38). The queue never holds a tile beyond the limit and is full while it can be.
    Every tile is drawn once (one `Queued` each), and each draw is its salt's.
- **Changed tests.**
  - The re-entrant spawn is now refused (`'VRF: one draw per tx'`). The spawn and the expiry replay use the VRF seed.
  - G1's upgrade test counts the queue's fill.
  - The frozen pre-D-18 class gets a game without a queue (section 2.4, "A rollback").
  - The storage pins and the store's round trip cover the new slots and bits (`upgrades.md`, "CHALLENGE-VRF").

**Gas** (`contracts/tests/gas.cairo`, one external call each, L2 gas, scarb 2.20.1, snforge 0.64.0, the Mac; the base is
an export of main at `17b07a14`, measured the same way):

| Scenario | Base | #645 | Change |
|---|---:|---:|---:|
| a0, an open move (draws) | 4,577,029 | 5,802,627 | +1,225,598 |
| a, a simple move (draws) | 4,948,265 | 6,277,804 | +1,329,539 |
| e, a forest closes (draws) | 8,328,395 | 9,558,693 | +1,230,298 |
| f, the worst forest scan (draws) | 17,823,234 | 19,571,226 | +1,747,992 |
| l, game over on a build (no draw) | 7,359,153 | 7,704,115 | +344,962 |
| s, game over on a discard (no draw) | 4,173,579 | 4,518,441 | +344,862 |
| g, a surrender | 3,952,394 | 3,976,620 | +24,226 |
| m, a paid spawn | 15,604,817 | 17,633,419 | +2,028,602 |
| z5, a free spawn | 6,483,235 | 8,511,847 | +2,028,612 |
| z24, a0 with nothing to queue | | 4,694,160 | |
| z25, a0 filling a legacy game's queue (three tiles, one draw) | | 6,270,729 | |
| z26, `set_vrf_provider` | | 272,150 | |

- **A move's draw** costs about 1.0M to 1.7M (a0 against z24: 1.1M); a pick's cost follows the deck bitmap it walks. That is the component (#638's z15: 986,461) and the pick.
- **A move that does not draw** costs about 0.12M to 0.34M more than before. That is the second read of the game, to
  decide whether it draws, before the provider's call (`Challenge::move_random`).
- **The spawn's draw** costs about 2.0M, its three picks included.
- Cartridge's part (`submit_random`, `assert_consumed`) is measured on Sepolia, as #638 rules.
- The ceilings that the change crossed are reset to measured + 5 % (`baseline.md`, "After CHALLENGE-VRF").

**CASM** (`scripts/class-sizes.sh`, release, the Mac): `Challenge` goes from 64,826 to 69,494 felts (+4,668).

- That is 84.8 % of Starknet's cap, and **3,453 felts under the P-44 cap (72,947; 4.7 % of it)**, against 8,121 before.
- No split is needed. The next feature that grows `Challenge` by that much needs one (`class-headroom.md`,
  "After CHALLENGE-VRF").
- `Story` grows by 187 felts, from the `Queued` variant of `paved::events::Event`.

### 4.1 Audit: correctness and security

The Challenge is where money comes out (R-10). Each point below was checked in the code and, where it says so, by a
test.

- **No player choice enters a draw.** The spawn's salt is the player and its spawn count. A move's salt is the game and
  the id of the queued tile. Neither the position, the orientation, nor build against discard enters it. The draw reads
  the deck bitmap, which only the draws change. Tested: a build and a discard draw the same tile.
- **A revert does not reroll.**
  - A reverted move or spawn writes nothing: not the spawn count, not the last draw's transaction. So its retry draws
    the same random. Tested for a move and for a spawn.
  - If Cartridge's paymaster lands a reverted transaction with its proof (open point 2), the player learns that draw
    early. They cannot change it: the retry draws the same.
  - At the spawn, the most such a player can do is spend that index on a free game (`spawn_free` shares the count),
    since credits are limited.
- **The draw is the transaction's first and only one** (#638's rules, in the component). A spawn re-entered from the
  token's `transferFrom` is refused (`tests::e2e::cold_paths_audit`).
- **Checks before the draw.**
  - The spawn checks the pause and the wiring before it draws, and `spawn_free` checks the pause.
  - A move draws only when it can be played: the game is live and not expired, and the caller is its player. So an
    invalid move fails with its own error, not the provider's.
  - The provider is called before `PlayableComponent` reads the game it writes, so no state read before the call is
    written after it.
- **Bits.**
  - The queue is in bits that every slot written before holds as 0.
  - The counters are now read through a 24-bit mask, so the queue does not leak into them.
  - `Store::set_builder` keeps the queue. Tested at every bit's maximum.
- **Trust.** The provider is the owner's (`set_vrf_provider`, owner only, never zero). An owner who sets a dishonest
  provider chooses the draws, as an owner who upgrades the class can. The mock refuses mainnet, and `deploy.sh` refuses it
  off devnet.
- **A rollback to a class before #645** cannot read a VRF game: its counters' read takes the queue's bits and panics.
  Roll back only with no VRF game in flight (`upgrades.md`).

## 5. Open points

1. **Cartridge's point 2 stays open** (`vrf-draws.md`, section 7). If a player can reach the server's `/proof` route,
   they read every future draw, not only the next two. The two-tile horizon bounds what the UI shows, not that leak.
2. **The deck sheet.** It counts the rest from `tiles`, so the two queued tiles are not in the rest. The client task
   decides whether the sheet lists them apart.
