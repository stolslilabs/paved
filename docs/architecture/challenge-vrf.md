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
`initial_seed` keeps answering the token seed for such a game. For a VRF game it answers the stored seed, which is
the spawn's random.

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

## 4. Tests, gas and size

- **Every test that plays a Challenge game runs on the mock VRF.** `setup::spawn_game` deploys `MockVrfProvider` and
  sets it on `Challenge`. The test dispatcher gives each `spawn`, `build`, `discard` and `surrender` its own
  transaction hash, since one draw per transaction is the rule and snforge's hash is otherwise one for the whole test.
- **The goldens.** They spawn through `Challenge.spawn` on the mock, not on the day seed any more. The forced games
  keep their boards and scores, and their `drawn` plans are recorded again. The real-deck games (`daily_deck`,
  `daily_full_deck`) are recorded again, the full deck through its generator (`test_full_deck_generate`). The
  differential boards force every plan and do not change.
- **New tests** (`tests::e2e::challenge_vrf`):
  - the queue at spawn and after moves;
  - the draw index and salt of each draw;
  - the end of the deck;
  - the legacy path;
  - the provider's rules (no provider, not first consume, a second draw in one transaction);
  - fuzzing: the queue never holds a tile beyond `tile_limit`, the deck counts are conserved, and a retried move
    draws the same tile.
- **Gas.** `contracts/tests/gas.cairo` gets the spawn and a drawing move over the mock. Cartridge's part
  (`submit_random`, `assert_consumed`) is measured on Sepolia, as #638 rules.
- **CASM.** `Challenge` is measured with `scripts/class-sizes.sh` against the P-44 cap (72,947). It is split
  (P-44) only if it crosses the cap.

## 5. Open points

1. **Cartridge's point 2 stays open** (`vrf-draws.md`, section 7). If a player can reach the server's `/proof` route,
   they read every future draw, not only the next two. The two-tile horizon bounds what the UI shows, not that leak.
2. **The deck sheet.** It counts the rest from `tiles`, so the two queued tiles are not in the rest. The client task
   decides whether the sheet lists them apart.
