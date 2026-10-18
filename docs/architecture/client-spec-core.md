# Client specification v1: the contract items

S1, track CORE. The owner's client specification (v1) and the PM's rulings P-57 give CORE three contract items (P-57,
item 9); CLIENT's P0 (`docs/client/v2-architecture.md` on #373, sections 6.5 and 9.4) adds the view it needs. The PM
re-scoped S1 into a code PR and ruled on the expiry (2026-10-14). Brief: `docs/briefs/s1-client-spec-core.md`.

| Spec line | Item | Outcome in this PR |
|---|---|---|
| "A game is valid 24 h. Show it in the purchase scene and in the game's details." | 1 | Built: moves refused from `start + 24 h`, `GameView.expires_at` |
| "Keep the same prices and bonuses as Glitchbomb", "a minimum score to beat" | 2 | Parity table; no change |
| "It evolves with each placement, deterministically and predictably ... no loading" (P-57 item 8) | 3 | Built: `initial_seed(game_id)`; `tiles()` confirmed |

Paths below are under `contracts/src/` for Paved, and under `/home/claude/projects/glitchbomb/contracts/src/`
(commit `5efcbce`, read only) for Glitchbomb. Line numbers are those of this PR's head for Paved.

## 1. A game is valid 24 h

### Before S1: every time limit on a game

- **A game could be played forever.** `build`, `discard` and `surrender` checked that the game exists, has started,
  is not over and that the caller is its player (`components/playable.cairo:49-70`, `127-150`, `171-198` today), never
  the time. The only clock a move read was `end_in_day` on game over (`playable.cairo:30-43`).
- **The day id and `end_in_day`.** `day_id(time, 86400) = time / 86400` (`day.cairo:6-8`). A game that ends in the
  calendar day it started in gets `day_id` and `end_time` in `GameEnd`; one that ends later keeps `0` in both
  (`playable.cairo:30-43`). Since D-20 nothing is ranked on chain, so this is information for the indexer, not a limit.
  S1 does not change it: a game started at 23:00 may still end the next day (before its 24 h) with `day_id` 0.
- **Economy records at game over.** `Challenge.finish` calls `Economy.record(game_id, score)` on the move that ends
  the game (`systems/challenge.cairo:491-503`). `record` marks the game expired when `now >= terms.time + DAY`
  (`systems/economy.cairo:701`); `terms.time` is the purchase's block time (`economy.cairo:658-660`), the same second as
  the game's `start_time` (one transaction: `hostable.cairo:77-78`, then `challenge.cairo:418` and `:480`). An expired
  game enters no mean (`economy.cairo:704`).
- **Settlement.** `settle` pays a recorded game from the end of the day after its purchase day,
  `now >= (day + 2) * DAY` (`economy.cairo:729`): between 24 h and 48 h after the purchase, depending on the hour of the
  purchase. The longest wait from purchase to settlement is 48 h (a purchase at 00:00:00). An expired game is settled
  for 0 (`economy.cairo:734`).
- **An unfinished game's stake.** It stays where the purchase put it: 70 % swapped and burned, the rest to the
  referrer and the Vault, at purchase time (`economy.cairo:611-637`). Nothing is held for the game, so nothing is lost or
  stranded when a game never ends. An unfinished game is never recorded, so it can never be settled
  (`'Economy: not recorded'`, `economy.cairo:726`); its reward would have been 0 after its 24 h anyway. The day's mean
  closes without it (`close` reads the day's accumulator, not the list of its games).

So before S1 the 24 h existed only in Economy: after it, a game could still be played and ended, but its reward and
its weight in the mean were void.

### The rule (the PM's ruling, built here)

- **From `start_time + 24 h` on, `build` and `discard` revert with `'Game: expired'`**
  (`components/playable.cairo:64` and `:192`, through `GameAssert::assert_not_expired`, `models/game.cairo:504-506`).
  The check is strict: the last second that takes a move is `start_time + 86399`; at `start_time + 86400` the move
  reverts, the same second at which `Economy.record` starts calling a game expired. The validity is
  `constants::GAME_VALIDITY` (`constants.cairo:20`), pinned equal to `economy::DAY` by
  `test_expiry_validity_is_the_economy_day`.
- **`surrender` stays open after the expiry** (`playable.cairo:141-142`; the PM's ruling of 2026-10-14). It is the
  player's way to end an expired game. Since no move lands after the expiry, the score it ends with is the score at the
  expiry.
- **The economy is unchanged.** `economy.cairo` is not touched. An expired game surrendered is recorded with
  `expired = true` (no mean, `economy.cairo:701-708`) and settled for 0 (`economy.cairo:734`), exactly as a game over
  after 24 h was before S1.
- **The deadline in the views:** `GameView.expires_at = start_time + 86400`, appended as field 17
  (`views.cairo:53`, `:136`). It does not move with the moves or at game over. Economy's own `terms(game_id).time + DAY`
  gives the same second.

Exactly what changes for a player, compared with before S1:

| After 24 h | Before S1 | S1 |
|---|---|---|
| `build`, `discard` | accepted, the game plays on | revert `'Game: expired'`, nothing written |
| `surrender` | accepted | accepted (unchanged) |
| The score recorded | the score of the move that ends the game, possibly after 24 h | the score at the expiry (no move after it) |
| `Economy.record` of the game | `expired = true`, no mean | the same |
| `settle` | pays 0 | the same |
| The stake | spent at purchase | the same |

Why not end an expired game without a call (record alone, no surrender): it would need `Economy` (or a keeper) to
record a game nobody ended. `Economy.record` only accepts the game contract (`assert_game`, `economy.cairo:694`, `:918`) and the
game contract has no entry point that ends a game for someone else; adding one is a new permissionless path in
`Challenge` for a game whose reward is 0 anyway. `surrender` already does it, from the one address that cares (the
player, whose quests count the game). So surrender stays open, as ruled.

What it costs: one `get_execution_info` syscall and one comparison per `build` and `discard`; `start_time` is already
in `GameConfig`, which every move reads (`store.cairo:156-181`). No storage slot is added. Measured in
`docs/measures/baseline.md`, "After S1".

### Games spawned before the upgrade

The deadline is computed from `GameConfig.start_time`, which every class has written at spawn. A game spawned before
the upgrade gets the same 24 h from its own start: one spawned more than 24 h before the upgrade is expired at once
(it can only be surrendered), and its reward was already void in Economy. Pinned by
`tests::e2e::expiry::test_expiry_a_game_spawned_before_the_upgrade_gets_24h_from_its_start` (a game spawned by the
frozen class `legacy_g1::ChallengeBeforeG1`, then the upgrade). No storage changes, so `upgrades.md` is not touched.

`GameView` grows by one field. A `Collection` of this class reads `Challenge.game` and deserializes 17 fields; the old
Sepolia `Tutorial` would return 16, but no network deployed after D-21 has a Tutorial minter (`sepolia.json` lists none),
so no `Collection.token_uri` reads it. A `Collection` of an older class reading a new `Challenge` ignores the extra field.

### Glitchbomb's expiry, for comparison

Glitchbomb stores `expiration = start + GAME_EXPIRATION_TIME` (86,400, `constants.cairo:13`) at start
(`models/game.cairo:335-336`) and refuses every action from it on, `cash_out` included (`is_expired`,
`models/game.cairo:308-312`; `components/playable.cairo:105`, `:343`, `:403`, `:473`, `:520`, `:580`, `:595`). Paved
differs on purpose: it computes the deadline (no slot) and keeps `surrender` open (the PM's ruling).

## 2. Prices and stake bonuses: Paved against Glitchbomb

Glitchbomb's live values are the `GLITCHBOMB-Setup` arguments of `dojo_mainnet.toml` (repository root, `:55-60`).
CLIENT found five figures already matching (`v2-architecture.md` 6.5); each is confirmed below.

| Row | Paved | Glitchbomb | Same? |
|---|---|---|---|
| Base price | 2 USDC per stake unit: `BASE_PRICE = 2_000_000` (`systems/economy.cairo:36`), `CHALLENGE_PRICE` (`constants.cairo:15`) | 2 USDC: `DEFAULT_ENTRY_PRICE = 2_000_000` (`constants.cairo:7`), `entry_price 0x1E8480` (`dojo_mainnet.toml:55`) | **Same** (CLIENT's 1) |
| Stake options | 1 to 10, price `stake x 2 USDC` (`economy.cairo:37`, `:601`; `challenge.cairo:475`) | 10 bundles, price `stake x base_price`, stake 1 to 10 (`components/purchase.cairo:29`, `:82-85`) | **Same** (CLIENT's 2) |
| Burn | 70 % of the price swapped and burned: `burn_bps 7_000` (`economy.cairo:72`, `curve.cairo:36`) | 70 %: `burn_percentage 0x46` (`dojo_mainnet.toml:57`), `price x burn_percentage / 100` (`purchase.cairo:181`) | **Same** (CLIENT's 3) |
| Referral | 5 % of the price, out of the margin, the burn stays 70 % (`curve.cairo:11`, `:30-37`; P-31) | 5 %: `REFERRAL_PERCENTAGE = 5` (`purchase.cairo:31`, `:72`, `:89`), paid by the bundle before the burn of 70 % of the full price (`:181`) | **Same** (CLIENT's 4) |
| Reward boost for high stakes | `R = b' x (10_000 + 100 k) / 10_000 x F`: `+k %` (`economy/curve.cairo:89-96`) | `boost = burn x price / base_price / 100`, `+k %` of the burn (`purchase.cairo:241-242`) | **Same** (CLIENT's 5) |
| Supply factor | 2x at 0, 1x at the target, 0 at twice it (`curve.cairo:42-55`); target 1,000,000 PAVED (`economy.cairo:72`) | the same shape (`helpers/rewarder.cairo:64-69`); target 1,000,000 GLITCH (`dojo_mainnet.toml:56`) | Same |
| LP fee | the pool key's fee, set by the owner (`set_pool`, `economy.cairo:177`); D-10: 5 % | 5 %: `pool_fee 0xccc...c` (`dojo_mainnet.toml:60`, 0.05 x 2^128) | Same (deploy value) |
| **Margin** | all of it to the Vault (`economy.cairo:635-636`); D-10: "no team share" | Vault 0 %, team the rest: `vault_percentage 0x0` (`dojo_mainnet.toml:58`; `purchase.cairo:227-237`) | **Different** |
| **Minimum score to beat** | a cliff: reward 0 below `mean x (1 + sigma)`, then `R x c x score / threshold`, capped at `5 R` (`curve.cairo:97-123`; `sigma 0`, `c 1.222`, `H 5`, `economy.cairo:72`) | no cliff: `base(score)` step table, 0 below 65 points (`helpers/rewarder.cairo:8-55`), times `supply x burn / base(average)`, so the average score earns back the burn (`rewarder.cairo:78-100`, `purchase.cairo:244-247`) | **Different** |
| **The mean** | the day's mean, weighted by stake, with the EMA as prior; scores under 100 left out, clamped at 4x (`economy/mean.cairo:1-27`); a game is paid against its purchase day's mean, after `day + 2` (`economy.cairo:729-731`; P-34) | one EMA for all games, pushed at game end, weighted, min score 5, max weight 1,000 (`models/config.cairo:52-84`, `constants.cairo:36-40`); initial average 150 (`dojo_mainnet.toml:59`); frozen into the multiplier at purchase (`purchase.cairo:244-247`) | **Different** |
| **Free game** | none: every Challenge game is paid (`challenge.cairo:455-482`) | a free social bundle, price 0, behind a Twitter condition (`purchase.cairo:67-79`, `:161-177`) | **Different** |
| **Quantity** | one game per `spawn` | `quantity` games per purchase (`purchase.cairo:148`, `:181`, `:242-243`) | **Different** |
| **Price guard** | `R` counts at most 110 % of `quote x rate` (`curve.cairo:17`, `:55-70`) | none | **Different** |

Recommendations (every difference is kept; none needs a contract change):

- **Margin to the Vault, not a team: keep.** D-10 fixed "entirely to the Vault's beneficiaries; no team share"
  (`economy.md`, D-10 table). Aligning would reverse an owner's decision.
- **The cliff and the curve: keep.** D-10 fixed the cliff ("below the profitability-shifted mean, the whole stake is
  lost"); P-31 the curve, P-46 `sigma 0` and `c 1.222`. The spec's "a minimum score to beat (the average performance
  adjusted for the protocol's fees, as in Nums)" is this threshold: the mean, shifted by `sigma`. Glitchbomb's step
  table is a different game's score scale. Changing it is the owner's (D-10) and the PM's (P-46).
- **The day's mean: keep.** P-34 (option B) chose a day accumulator so that every game of a day is paid against the
  same mean; Glitchbomb's frozen-at-purchase EMA is Nums' option A, kept as the fallback in `economy.md`.
- **No free game, one game per spawn, the price guard: keep.** The free bundle and the quantity are client and
  marketing features of Glitchbomb's bundle package, not prices or bonuses; the guard is a Paved safety (economy.md,
  section 5). A free or multi-game purchase would be a new product decision (the PM's).

Nothing here touches a decided value. If the owner wanted Glitchbomb's curve itself, that would reverse D-10's cliff
and P-46: the owner's and the PM's to rule, then a change in `economy.cairo` (paused for V1b).

## 3. Next-tile prediction

What the draw reads, and where the client gets it:

| The draw reads | Contract | The client gets it from |
|---|---|---|
| The initial seed | `TokenSeed`: `Poseidon(0, Challenge, game_id)` (`seed.cairo:20-37`), passed to `start` (`hostable.cairo:81-82`) | `initial_seed(game_id)` (new, `views.cairo:92`, `:200-206`; `systems/challenge.cairo:338-340`) |
| The deck's withdrawal at spawn | `deck.tiles(tiles, seed)` (`models/game.cairo:156-176`), G1's walk since 78ab2ab0 | the engine, from the initial seed (G1's walk: a game spawned by a pre-G1 class used the old one, see below) |
| Each draw | `draw_from_bitmap(seed, number, tiles)`, then `seed = Poseidon(seed, tile_count)` (`game.cairo:294-317`) | the engine |
| The reseed before a draw | `seed = Poseidon(seed, x, y)` of the tile built or discarded (`game.cairo:192-198`; `playable.cairo:99`, `:243`) | `tiles()`: the position of a placed tile |
| The tiles drawn so far, in order | ids 1 to `tile_count` | `tiles(game_id, from, count)`: every drawn tile, in draw order, with its status (placed, discarded, held) (`views.cairo:140-181`) |

`tiles()` is confirmed as CLIENT asks (`v2-architecture.md` 9.4): every tile from id 1 to `tile_count`, in draw order
(the loop over ids, `views.cairo:158-180`), with its status and, for a placed tile, its position and orientation. This
PR does not change it, and `public-interface.md` keeps it as a promise.

**One rule the client must know:** a discarded tile reseeds on the position it was drawn with, `(CENTER, CENTER)`
(`TileImpl::new`, `models/tile.cairo:43-44`; the discard reseeds on the stored tile, `playable.cairo:73`, `:99`), while
`tiles()` reports a discarded tile at `(0, 0)` (`views.cairo:167-171`). The engine already does it
(`packages/game-core/src/engine/game.ts:431`). `test_expiry_initial_seed_replays_the_draws` replays a game (a build,
two discards) from `initial_seed` and `tiles()` alone and finds the chain's current seed, deck bitmap and tile in hand.

**No extra call per move.** On open, the client reads `initial_seed` once, `tiles()` (pages of 64; a game has at most
38 tiles, one page) and `game()`, replays, and checks its seed and tile in hand against `game()`. During play, each
move's next tile is computed locally the moment the placement is chosen (the reseed reads the position). The chain's
answer confirms it with what the client already reads today: the receipt's `Built` or `Discarded` event (the tile
placed or discarded, `events.cairo`) and the one `game()` read that follows (the new seed, `tile_id` and `plan`). No
event carries the drawn tile; the `game()` read is the confirmation, as today. Optional and not added: the deck bitmap
in `GameView` (CLIENT 9.4 calls it unnecessary at 38 tiles).

`initial_seed` is computed, not stored: `TokenSeed` is the only seed source of `spawn` (`challenge.cairo:223-231`),
and the Sepolia `Challenge` has used it since its deployment (`deployments/sepolia.json`, `deployed_at` 5dbc692b),
so the seed it returns is right for every game, at no gas and no storage. What reverses it:
a seed source that cannot be recomputed from the game id (a VRF, `seed.cairo:1-7`) must store the seed at spawn and
this view read it. The golden games of the tests start from another source (`tests::golden::harness`); their
`initial_seed` is not their seed, which only tests can see.

**Which games the replay holds for.** The seed is right for every game, but the replay also needs the deck's
withdrawal at spawn, and that changed with G1 (78ab2ab0): a game spawned by a pre-G1 class built its deck with the old
walk (`tests::legacy_g1::tiles_before_g1`), which the current engine does not reproduce. The class live on Sepolia
(5dbc692b) predates G1. By D-27 that class is never upgraded in place: G6 part B is dropped, and Sepolia gets one fresh
deployment at the end. So every game that `initial_seed` can be read for is spawned by a post-G1 class, and the replay
holds for all of them. If a class were ever upgraded over games spawned before G1, those games' decks would use the
pre-G1 walk: the client's open-time check against `game()` (its seed and tile in hand) would fail, and the client must
fall back to no prediction for them (CLIENT's `v2-architecture.md`, 9.3, "The initial check fails").

## For the PM

- **Expiry built as ruled** (2026-10-14): `build` and `discard` refused from `start_time + 86400`; `surrender` open.
  The argument against ending a game without a call is in section 1; nothing to decide unless the PM wants a
  permissionless close.
- **The parity table keeps every difference** (margin to the Vault, the cliff, the day's mean, no free game, one game
  per spawn, the guard), each on a decision (D-10, P-31, P-34, P-46). Aligning any is the owner's (D-10) or the PM's.
- **`initial_seed` is computed** (no storage). If a VRF is ever planned, the seed moves to storage then.
