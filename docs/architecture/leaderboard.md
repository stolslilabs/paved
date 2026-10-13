# Leaderboard behind an interface (P6, design)

Design of the on-chain leaderboard of the Daily tournaments as an interface that the game flow calls, so that the
current implementation can be replaced by a published package without a change to the game flow, the public views
or the events. Part 1, stage A is implemented (`contracts/src/leaderboard.cairo`, PR "refactor: P6 leaderboard behind an interface (stage A)"); the measured figures below replace the estimates the first version of this document gave.

Context. Grim World's track ARC is porting cartridge-gg/arcade's leaderboard module into quiver (no Dojo) and will
publish it. Paved uses that package instead of its own if performance is not degraded, decided by measured numbers
once it is published (`docs/programme/DECISIONS.md` O-1: by published version on scarbs.xyz only). Ruling P-18
keeps the prize top 3 on chain and the full leaderboard in the indexer (`docs/architecture/indexer.md`).

Sources read for this design: `contracts/src/models/tournament.cairo`, `models/index.cairo`, `store.cairo`,
`views.cairo`, `events.cairo`, `components/playable.cairo`, `components/hostable.cairo`, `systems/daily.cairo`,
the tests under `contracts/src/tests/` and `contracts/tests/`, `docs/measures/baseline.md`,
`docs/measures/golden-games.md`, `docs/architecture/indexer.md`, `docs/programme/DECISIONS.md`.

**D-20 (built) and D-21 to D-24 (planned)**: tournaments, the prize and the on-chain ranking have left the code
("As built: D-20" below: `leaderboard.cairo` and the `Tournament` model are gone, and part 1 describes code that no
longer exists on main); the tutorial leaves the contracts, `Daily` becomes Challenge, and `Lobby`'s cold paths and the
quests are reorganised (the sections "D-21" to "D-24" before part 2).

The document has two parts: part 1, the interface and how the swap is made and tested; part 2, "What Paved needs
from a leaderboard package", the request for the package, written to be forwarded as it is.

## Part 1. Leaderboard behind an interface

### What exists today

One model, `Tournament` (`contracts/src/models/tournament.cairo`), keyed by tournament id (`timestamp / 86400`),
stored by `Store` in `tournaments: Map<u64, Slots5>` (`store.cairo`). It holds two different things:

| Part | Fields | Written by | Read by |
|---|---|---|---|
| Ranking | `top1..3_player_id`, `top1..3_score` | `Tournament::score`, called from `PlayableComponent` on game over | `Daily.claim` (who holds a rank, whether rank 2 and 3 are empty), the `tournament` view |
| Prize | `prize`, `top1..3_claimed` | `buyin` (in `HostableComponent.spawn` and `sponsor`), `claim` | `Daily.claim`, the `tournament` view |

Five slots: the prize, three player ids, and one word that packs the three scores (32 bits each) and the three
claimed flags (bits 96 to 98).

The rule of `Tournament::score`, which the interface must keep exactly:

- A score at or below the third score does not rank (`<=`): **equal scores keep the earlier submission**, and an
  empty rank has score 0, so a score of 0 never ranks.
- A ranked score shifts the lower ranks down by one.
- It ranks **games, not players**: nothing stops one player from holding two or three ranks.
- The order is the order of the calls; no timestamp or game id takes part.

Where it is written. The same block of seven lines is repeated in `discard`, `surrender` and `build` of
`PlayableComponent`: when the game is over and the tournament of its start equals the tournament of the block
(`tournament_id == id_end`), it reads the tournament, calls `score(player_id, game.score)`, writes the tournament,
and stores `tournament_id` and `end_time` in the game. A game that ends after its tournament closed ranks in
nothing and has `tournament_id` 0 in the `GameOver` event. `GameOver` is emitted after, by `events::game_over`.

Where the prize and the claims are used. `HostableComponent.spawn` and `sponsor` add to the prize (`buyin`);
`HostableComponent.claim` (called by `Daily.claim`) checks the tournament exists (`prize != 0`) and is over, that
the caller holds the rank, that the rank is not claimed and not empty, sets the flag and returns the reward; the
reward split (`reward(rank)`: rank 3 gets a sixth, rank 2 a third of the rest, rank 1 the remainder, with the
absent ranks getting zero) depends on the prize and on whether rank 2 and rank 3 have a player.

Tutorial never touches the ranking: it embeds `TutoriableComponent`, not `PlayableComponent`, which is `Daily`'s.

### The interface

A handle, as `Store` is: a zero-sized `Leaderboard` with a trait, created by `LeaderboardImpl::new()`,
used from the components without a contract state. New module `contracts/src/leaderboard.cairo`.

```cairo
/// What a game contract submits when a game ends.
pub struct Submission { pub player_id: felt252, pub game_id: u32, pub score: u32, pub time: u64 }
/// What Paved reads back for a rank. Zero player and zero score mean an empty rank.
pub struct Ranked { pub player_id: felt252, pub score: u32 }
pub struct Top3 { pub first: Ranked, pub second: Ranked, pub third: Ranked }

pub trait LeaderboardTrait {
    fn new() -> Leaderboard;
    /// Rank taken, 1 to 3, or 0 when the submission is not placed. Never reverts on a valid game end.
    fn submit(self: Leaderboard, tournament_id: u64, submission: Submission) -> u8;
    fn ranked(self: Leaderboard, tournament_id: u64, rank: u8) -> Ranked;
    fn top(self: Leaderboard, tournament_id: u64) -> Top3;
}
```

Decisions behind the shape:

- **An internal Cairo trait, not a contract.** A call to another contract costs a `CallContract` syscall and a
  deployed address to know about; the ranking is written in the very move that ends the game, in the same
  transaction, from the same contract. The package is therefore used as code and storage inside `Daily`. That also
  settles access control: only the game contract can submit, because `submit` has no external entry point.
- **The reads give player and score, nothing else.** `game_id` and `time` are passed to `submit` because the
  package may keep them, but Paved does not read them back,
  and the native implementation does not store them (storing them would add slots and gas to the closing move).
  Nothing in the views or events needs them: the indexer has them from `GameOver`.
- **`mark_claimed` is not in the interface.** The brief suggested it; I left the claimed flags in Paved instead.
  The package does not need to know about claims, the claim flags go with the prize they protect, and a package
  that does not offer a claim API remains eligible. Reverse: the package brings a claim API that is cheaper than
  Paved's own flags (it is not expected to).
- **No ranking logic in Paved's types any more.** `Tournament::score` and the `top*` fields leave the model and
  move behind the interface; the same code, moved, becomes the native implementation.

### Can player 0 reach the top 3?

On main `Tournament::score` has no check on the player: a submission of player 0 with a score above rank 3 would rank (the bench measured 230,778). It cannot be reached, by three guards in the game flow, all on main (`9f930468`) as well as in this PR:

1. **Where `player_id` comes from.** `HostableComponent.spawn` takes `get_caller_address()`, reads `store.player(caller)` and `player.assert_exists()` (`hostable.cairo`), then `GameImpl::new(.., player.id)` writes it as `GameConfig.player_id`. An unregistered caller reverts with `Player: Does not exist` (`test_access_daily_spawn_reverts_for_unregistered_caller`, `test_access_tutorial_spawn_reverts_for_unregistered_caller` in `src/tests/e2e/access.cairo`). The `player_id` submitted at the end is not read from the game: `build`, `discard` and `surrender` take `get_caller_address()` again (`playable.cairo`).
2. **The caller must be the player of the game.** Each of the three calls does `game.builder_of(player_id)` then `builder.assert_exists()` before anything else. `builder_of` returns a builder with the held tile only when `player_id != 0 && player_id == game.player_id`; anyone else, and player 0 in particular even for a game whose `player_id` is 0, gets tile 0, which is the zero builder, so the call reverts with `Builder: does not exist` before `end_in_tournament` (`test_access_daily_build_reverts_on_another_players_game`; new: `test_access_daily_player_zero_cannot_end_its_game`, which forces a game of player 0 and calls `surrender` from address 0).
3. **A game of player 0 cannot even be paid for.** `create` and `spawn` only check that the caller is unregistered, then registered, so address 0 could register; but the entry price is debited from the caller in the token, and the mock token refuses the zero address (`ERC20: mint to 0`); a real ERC20 has no balance or allowance at 0 either. A transaction does not have the zero address as caller in any case.

So a game end with `player_id` 0 does not reach the leaderboard on main: no bug, no change of behaviour on main. The native implementation returns 0 for player 0 anyway (an empty rank is player 0, so a ranked player 0 would be indistinguishable from an empty rank, and `claim` would treat the rank as empty): `test_leaderboard_player_zero_does_not_rank` (`src/tests/leaderboard.cairo`), part of the conformance suite a package must also pass.

### What stays in Paved, what the package would hold

| | Stays in Paved | Held by the implementation behind the interface |
|---|---|---|
| Prize pool: `buyin`, `sponsor`, overflow check, "tournament exists" (`prize != 0`) | yes | no |
| Reward split by rank (`reward`) and the claim rules (over, not claimed, caller holds the rank, not empty) | yes (it reads `top` or `ranked`) | no |
| Claimed flags | yes | no |
| Tournament id from a time (`compute_id`), the same-tournament test (`tournament_id == id_end`) | yes | no |
| `GameOver` and the other events, the `tournament` view, `entry_price` | yes | no |
| The top 3 by score for a tournament id, the tie rule, the shift | no | yes |

Paved's remaining record is the prize and the three flags: two slots (the prize, one word of flags), down from five.
The `Tournament` struct keeps `id`, `prize` and `top1..3_claimed`; its methods take the `Top3` when they need to
know who holds a rank (`claim`, `reward`). The `tournament` view builds `TournamentView` from the prize record and
`top`, with the same fields in the same order: the view and its ABI do not change.

### Call sites

Two stages, so that the swap itself touches nothing of the game flow.

**Stage A: extract the interface (the code PR that implements this part).** Behaviour does not change; this is the
one time the game flow is touched.

| File | Change |
|---|---|
| `contracts/src/leaderboard.cairo` (new), `lib.cairo` | The trait, the three types, and the native implementation: the logic of `Tournament::score`, storage in the node of `Store` (four slots: one word of three scores, then three player ids) |
| `components/playable.cairo` | The three repeated blocks (`discard`, `surrender`, `build`) become one private function `end_in_tournament` that calls `Leaderboard.submit(tournament_id, Submission { player_id, game_id: game.id, score: game.score, time })`, then sets `game.tournament_id` and `game.end_time` and `set_game_end`, exactly as now |
| `components/hostable.cairo` | `claim` reads `Leaderboard.top(tournament_id)` and passes it to `Tournament::claim`; `spawn` and `sponsor` keep their `buyin` on the (smaller) prize record |
| `models/tournament.cairo`, `models/index.cairo` | `Tournament` loses the `top*_player_id` and `top*_score` fields and `score`; `reward`, `claim`, `player` take a `Top3` |
| `store.cairo` | `tournaments` becomes the two-slot prize record; the four-slot ranking is added next to it for the native implementation |
| `views.cairo` | `ViewsImpl::tournament` fills `top*` from `Leaderboard.top(id)` |

Not touched in stage A: the `Daily` and `Tutorial` entry points and their ABI, `TournamentView`, `PriceView`,
`entry_price`, every event, `GameOver` and its ordering.

**Stage B: the swap (when a package is published and measured).** Only the leaderboard module and the manifest:

| File | Change |
|---|---|
| `contracts/Scarb.toml` | the package, `=x.y.z`, from scarbs.xyz (O-1) |
| `contracts/src/leaderboard.cairo` | `LeaderboardImpl` calls the package instead of the native logic; the native implementation stays as the legacy reader (below) and as the test oracle |
| `contracts/src/systems/daily.cairo` (only if the package is a component) | the `component!` line and its storage member, no event member if the package has none |

`playable.cairo`, `hostable.cairo`, `views.cairo`, `events.cairo` and the models are not in the diff of stage B; if
they are, the interface was wrong and the swap stops.

### Storage node or component: what a package of either form changes

The interface is a zero-sized handle over storage reached the way `Store` reaches its own (`Leaderboard::new()`,
no state argument), because the three call sites are components that receive `self: @ComponentState` and
cannot take a contract state by `ref`. Grim World's package is designed as a **storage node** in the consumer's
storage (no entry point, no event; `submit`, `ranked`, `top`; N = 3; four slots per tournament), which is
the form this shape expects: stage B changes `LeaderboardImpl` alone (it holds the package's node, as
`PavedStorage` holds `rankings` today) and adds the node as one member of `PavedStorage`. Nothing at the call
sites changes.

If Cairo 2.20 storage nodes cannot hold a `Map` and the package has to be a **component** instead, its state is taken by `ref self`
and its calls need the component state of the contract. What changes then: `Daily` embeds the component
(`component!` line, a storage member, `substorage(v0)` and an event member only if the package has one, which
part 2 forbids); `LeaderboardImpl` takes a state argument (`submit(ref state, ...)`); and `end_in_tournament`
in `playable.cairo`, `claim` in `hostable.cairo` and `ViewsImpl::tournament` take that state. `PlayableComponent`
and `HostableComponent` are components themselves (`self: @ComponentState`), so they would reach the leaderboard
component through the contract's `get_dep_component!` with a `+HasComponent` bound added to their
generics. That is a signature change in the game flow, and stage B would no longer touch only the leaderboard
module: the swap rule above ("if they are in the diff, the interface was wrong") is the check that tells
which form was delivered. The ABI test (`Daily.json` byte-identical) still holds if the component has no
external function.

### Deployed data: the cutover

Nothing is deployed on a public network today, so the first deploy can use the package from the start. After a
deploy, a swap changes where the top 3 of a tournament lives; the tournaments already ranked in the old slots must
stay readable and claimable. The swap therefore carries a `cutover_tournament_id` (the first tournament that will
rank in the package, the tournament after the one of the upgrade): `submit` always goes to the package, `top` and
`ranked` read the native slots for ids below the cutover and the package from it on. The native module stays for
that. The cutover is a constant of the implementation, fixed in the stage B PR. A swap done before any deploy has
no cutover and removes the native storage.

### How the swap is tested

The aim is a swap that the client and the indexer cannot see. In decreasing order of strength:

1. **The ABI does not change.** `scripts/abis.sh` regenerates `contracts/abis/*.json` and CI fails when a
   committed file is stale. `Daily.json` must be byte-identical across stage A and stage B: it contains the views
   (`tournament`, `entry_price`) and every event, so it proves the client's and the indexer's contract is
   unchanged. A package that adds an entry point or an event to `Daily` fails here and is not accepted as is.
2. **A conformance suite on the trait.** Tests written against `LeaderboardTrait` only (`contracts/src/tests/leaderboard.cairo`), run
   for the native implementation in stage A and for the package in stage B (the same file, the implementation
   switched by `LeaderboardImpl`): a table of cases (ties keep the earlier, shift, score 0, one player on three
   ranks, ids 0 and `MAX_TOURNAMENT_ID`, three submissions then a lower one), and a property test against the old
   `Tournament::score` kept as the reference model in the test module (the same pattern as the P5 oracle tests).
3. **The goldens and e2e tests, unchanged.** `snforge test golden` (the expected scores and the tournament top
   score recorded in `docs/measures/golden-games.md`), `daily_advanced` (`test_daily_e2e_claim_rewards_top_player_after_tournament_end`,
   `test_daily_e2e_claim_pays_exact_reward_per_rank`, `test_daily_e2e_claim_reverts_before_tournament_end`,
   `test_daily_e2e_sponsor_updates_prize_and_balance`), `views` (`test_views_tournament_lifecycle`,
   `_empty_day`, `_id_bounds`) and `events` (`GameOver` emission). None of their expected values may be edited in
   either stage: an edited expectation is a behaviour change and goes back to the PM.
4. **The cutover** (stage B on a deployed network only): a test that ranks in the native slots, switches to the
   package, ranks a second tournament in it, and claims in both.
5. **The indexer cross-check, unchanged.** The indexer replays the ranking from `GameOver` events and compares
   `prize_ranks` with the `tournament` view of each closed day (`docs/architecture/indexer.md`, D-P6-5). The
   devnet scenario of the indexer package runs on the contracts of stage B with no change; a mismatch is a swap
   bug. The indexer itself is not edited by either stage.
6. **Gas.** `contracts/tests/gas.cairo` keeps its ceilings; stage A adds a scenario that ends a game inside the
   tournament on the closing move and takes the delta of the leaderboard call (this is the measure of "today's
   cost", missing in `baseline.md`). The swap is accepted only if the closing move that places costs no more than
   before it and `submit`, `top` and `ranked` meet the ceilings of part 2. This is the "performance not degraded"
   test, with measured numbers.

Peak memory of these runs follows `AGENTS.md`: `snforge test <filter>` with the module path (`leaderboard`,
`golden`, `e2e::daily_advanced`, `e2e::views`, `e2e::events`), a capped first run, `--max-threads 2` for the
golden filter.

### Effect on gas (measured)

A closing move that ranks costs 14.3 % less (1,440,588 to 1,234,989), one that does not rank 37.7 % less (to 897,489): the ranking is four slots instead of five, a submission that cannot rank reads one slot and writes nothing, and one that ranks writes the slots that change (D-232: player slot 3 is also rewritten, unchanged, when the placement reaches it, about 72k, rare). `spawn` and `sponsor` handle the two-slot prize record instead of five. The `tournament` view costs 17 % more. Figures and method: `docs/measures/baseline.md`. The first version of this document estimated the update at 0.5M without a rank and 1.15M with one, from unit costs; the measure gives 0.71M for main whatever happened.

### Decided here

- **D-P6L-1** The leaderboard is an internal trait with a native implementation, not a contract. Reverse: the
  package can only be a separate contract (then `submit` is a call, with the registered-game access control of
  part 2, and its gas goes in the comparison).
- **D-P6L-2** The claimed flags stay in Paved, with the prize. Reverse: see above.
- **D-P6L-3** Reads return player and score only; `game_id` and `time` are inputs the implementation may keep.
  Reverse: a view needs them (it would be an appended field of `TournamentView`, allowed by the append-only rule
  of `public-interface.md`).
- **D-P6L-4** Stage A is its own PR and measures first. Stage B waits for a published, pinned package.
- **D-P6L-5** The native implementation stays as the test oracle and, after a deploy, as the legacy reader.

### Risks and open points

- **The package may rank players, not games.** Arcade-style boards often keep one entry per player. That would
  change who holds the ranks (a player could no longer hold two) and break the cross-check and the goldens; part 2
  asks for the Paved rule. If the package cannot offer it, the swap does not happen (the criterion is behaviour
  first, then gas).
- **Component or storage node.** A component takes its state by `ref self`, and Paved's components receive
  `self: @ComponentState`. If the package is only a component, stage B needs signature changes in the game flow;
  part 2 asks for a storage-node form.
- **Events from the package** would appear on the `Daily` address and the indexer halts on what it cannot decode;
  part 2 forbids them by default.

## Results of L-1: `quiver_leaderboard` 0.1.0 against the native leaderboard (measured)

**Decision (CORE, 2026-10-12): not adopted.** Daily +328 felts past the P-44 cap and gas worse on g and j. The
measured swap is commit `3cc0516` on branch `hp/paved-core/t-0199-l-1-quiver-leaderboard-comparison`.

What would reopen it:

- a package release with one hashed address per tournament (the four slots under one base, as the native
  `Slots4`), measured again with the same tests and `scripts/class-sizes.sh`; or
- a change of the P-44 cap of `Daily` by the PM, together with gas not worse than the native leaderboard.

Brief: `docs/briefs/l1-quiver-leaderboard.md`. The package was read as resolved by Scarb from scarbs.xyz
(`quiver_leaderboard = "=0.1.0"`, checksum `f8900c60…981e770e` in `Scarb.lock`, the one the brief gives; its
`VCS.json` names commit `3f091250` of `bal7hazar/quiver`, `packages/leaderboard`). The swap (stage B) is commit
`3cc0516` (not merged): `LeaderboardImpl`
calls the package's `LeaderboardStorage` node, rooted at `selector!("leaderboard")` in the storage of the contract
that runs the code, as `PavedStorage` is at `selector!("paved")`. Only `leaderboard.cairo`, `Scarb.toml` and
`Scarb.lock` changed; Paved's `Submission`, `Ranked` and `Top3` stay, converted field by field.

**Recommendation: do not adopt 0.1.0.** Both criteria of the brief fail: `Daily` grows by 328 CASM felts, past
the P-44 cap, and the closing move that ranks into a full board costs 4.1 % more, the `tournament` view 18.4 %
more. The package keeps the rule exactly. The extra gas comes from its storage layout, not from the adapter.

### Gas (snforge L2 gas of one call, `contracts/tests/gas.cairo`, the same file on both sides)

Test g0 (a closing move into an empty tournament) was added at `3cc0516` and run on main before the swap; it is not merged. Before:
main `30b3226` plus that test. After: the swap.

| Scenario | Before (native) | After (package) | Change |
|---|---|---|---|
| g0, closing move, empty board (ranks 1st, first submission of the day) | 3,524,849 | 3,382,490 | −142,359 (−4.0 %) |
| g, closing move that ranks 1st into a full board (two shifts) | 3,524,849 | 3,669,920 | **+145,071 (+4.1 %)** |
| h, closing move that does not rank (full board above it) | 3,121,693 | 3,129,884 | +8,191 (+0.3 %) |
| k, g with the largest report | 3,853,729 | 3,998,800 | +145,071 (+3.8 %) |
| l, game over on the last `build`, empty board | 7,582,195 | 7,439,836 | −142,359 (−1.9 %) |
| j, `tournament` view (full board) | 370,828 | 439,069 | **+68,241 (+18.4 %), above `CEILING_VIEW` 388,740** |
| i, game over after its tournament (no leaderboard call) | 2,589,504 | 2,597,234 | +7,730 |
| a0, a, b, c, d, e, f (moves that never reach the leaderboard) | | | +7,820 each |
| q claim / r reclaim | 1,940,878 / 1,535,068 | 1,902,559 / 1,443,419 | −38,319 / −91,649 |
| m, n, o spawns, p sponsor | | | 0 |

Why, read from the code (not measured apart): the native ranking is a `Slots4` under one hashed address per
tournament, reached by offset; the package keeps `scores: Map<u64, Scores>` and `players: Map<(u64, u8), felt252>`,
so every player slot is a separate map entry with its own hash of a tuple key. A rank-1 placement into a full board
reads two players and writes three (five such hashes), the view reads three. On an empty board the package reads
no player slot and skips the empty ones, hence the gain on g0 and l. The +7,820 on every `Daily` move that does not
reach the leaderboard is measured, its cause not established (the moves run the same code; the class is larger).

Whole suite after the swap (`snforge test --max-threads 2`): 708 passed, 35 failed. Each failure is gas, none is a
behaviour assertion: 34 tests exceed their `#[available_gas]` budget (those are set about 1,000 L2 gas above the
measured cost, so the +7,820 per move goes over them), and `test_gas_j_view_tournament` is above its ceiling.

### Class sizes (`scripts/class-sizes.sh`, release profile, CASM felts of 81,920)

| Class | Before | After | Change |
|---|---|---|---|
| `Daily` | 72,947 (89.0 %) | **73,275 (89.4 %)** | **+328, above the P-44 cap of 72,947** |
| `Lobby` | 61,301 (74.8 %) | 61,613 (75.2 %) | +312 |
| every other class (`Tutorial` 67,044 included) | | | 0 |

No class passes 90 % (73,728). Per the brief nothing was trimmed. Levers, not applied:

- Raise the P-44 cap of `Daily` by at least 328 felts: 73,275 is 453 felts under 90 %. The PM's call.
- Move the code that reaches the leaderboard out of `Daily` into the `Lobby` library (20,307 felts of margin at
  90 % after the swap). The share of the 328 felts that would leave `Daily` is not measured.
- A package whose four slots per tournament sit under one hashed address (as the native `Slots4`): this targets
  the gas of g, k and j; its effect on size and gas is not measured. It is a change of the package's storage
  layout, a breaking release for Grim World.

### The rule, kept by the package?

| Point | Package 0.1.0 | Adapter needed |
|---|---|---|
| `<=` the third score does not rank; ties keep the earlier submission | yes (`rank`: strictly greater) | no |
| a score of 0 never ranks; a player of 0 does not rank | yes (returns 0, nothing read or written) | no |
| games are ranked, not players | yes (no de-duplication) | no |
| the order is the order of the calls (`game_id`, `time` never compared, no block timestamp) | yes | no |
| the prize top 3 on chain, the full board in the indexer (P-18) | yes: N = 3, no event, no entry point | no |
| `ranked` outside 1..=3 answers empty; any `u64` id (0 and `MAX_TOURNAMENT_ID` included) | yes | no |
| never reverts on a valid game end | yes | no |

The conformance suite `contracts/src/tests/leaderboard.cairo` (15 tests, the reference model included) passes
unchanged on the package. The golden outcomes are unchanged: 14 goldens pass, and the 7 that fail only on their
gas budget each have a `_structures_agree` twin that replays the same moves, asserts the same outcome, and passes.

### What the indexer reads (`docs/architecture/indexer.md`)

| Point | Same after the swap? |
|---|---|
| ABI of every class (`scripts/abis.sh`, `contracts/abis/*.json`) | yes, byte-identical |
| `GameOver` keys and data, `tournament_id` included (0 after the tournament) | yes (`playable.cairo` untouched, events tests fail only on gas) |
| No new event on the `Daily` address | yes (the package emits nothing) |
| `tournament` view: fields and values for a tournament ranked after the swap | yes |
| `tournament` view of a tournament ranked before an upgrade of a deployed `Daily` | **no**, see below |

### Storage on the deployed Sepolia `Daily` and `Tutorial`

- **What the package adds.** Two maps of a storage node, `scores` and `players`, under the root
  `selector!("leaderboard")`: the root is the adapter's choice, the package forces none. It is not a member of any
  `#[storage]`, so no substorage is added and no layout changes: nothing is renamed or retyped. No name clash with
  the top-level names of `Daily`, `Tutorial` or `Lobby` (`hostable`, `ownable`, `payable`, `playable`,
  `tutoriable`, the `Quest_*` and `Achievement_*` members of the quiver components, `upgradeable`, `lobby_class`)
  or with `PavedStorage` at `selector!("paved")`. `Lobby` reaches the same root through the same function, so it
  keeps sharing `Daily`'s layout (P-26). `Tutorial` never calls the leaderboard.
- **Existing tournaments are not kept readable.** The rankings written before the upgrade stay in
  `PavedStorage.rankings`, untouched, and the package does not read them
  (`contracts/src/tests/leaderboard_storage.cairo` at `3cc0516`, not merged). After a plain upgrade under D-17, `top` and `ranked` answer
  empty for every earlier tournament: the `tournament` view shows no ranks, a claim of an earlier day fails the
  rank check, and the day open at the upgrade loses the ranks it had.
- **Answer: an upgrade, not a redeploy, but only with the cutover of "Deployed data: the cutover"**: the native
  code kept to read (and, for the day of the upgrade, to rank) the tournaments before a cutover id. No migration
  and no redeploy, but more code in `Daily`, which is already over its cap with the plain swap; that variant was not
  built or measured. Otherwise, a migration (an owner entry point that copies the rankings: an ABI change) or a
  redeploy.

### Licence

MIT, declared in the package manifest (`license = "MIT"`); the archive has no licence file. Compatible with
Apache-2.0. The README says it is written from Paved's specification with no Arcade code, so no ported headers are
due.

### Peaks (VPS, `/usr/bin/time -v`, largest process, under the caps of the brief)

| Run | Before | After |
|---|---|---|
| `snforge test test_gas_ --max-threads 2` | 6,317,340 kB, 2:37 | 5,288,572 kB, 2:01 |
| `snforge test paved::tests::leaderboard` | 3,445,368 kB | 3,510,160 kB (5,338,156 kB with the new storage tests, after a rebuild) |
| `snforge test paved::tests::golden` | 3,445,092 kB | 3,510,480 kB |
| `scripts/class-sizes.sh` | 3,739,768 kB, 1:01 | 2,732,300 kB, 0:32 |
| `scripts/abis.sh` | | 3,635,420 kB |
| `snforge test --max-threads 2` (whole suite, once) | | 4,333,112 kB, 3:38 |

## As built: D-20

D-20 and P-48 (`docs/programme/DECISIONS.md`, owner via the PM and PM, 2026-10-13), with the PM's rulings of
2026-10-13 after #332: the daily prize **and the on-chain ranking** are gone; the daily seed, the day id (renamed
`day_id`), the economy settlement and the daily leaderboard (the indexer's) stay. Built by D-20b (brief
`docs/briefs/d20b-no-tournaments-impl.md`); paths below are under `contracts/src/` on the D-20b branch. The interface
side is `public-interface.md`, "Breaking change D-20". The planned inventory this section replaces was read from
main at `7d04872d`; where the code differed, the difference is under "Spec corrections" at the end.

**Why here.** The prize was designed in `economy.md` (P-31, P-37, P-37b, "As built: E3"); this note owned the
ranking (`leaderboard.cairo`) and the cutover of its storage, so the inventory lives here; `economy.md`,
`class-headroom.md`, `native-storage.md` and `quests.md` point to it.

### What went

| Kind | Item | Was (main `7d04872d`) |
|---|---|---|
| Entry point | `Daily.claim(tournament_id: u64, rank: u8)` (rank 0: the sponsor's reclaim, P-37b), `Daily.sponsor(amount: felt252)` | `systems/daily.cairo:17-18`, `:190-199` |
| Entry point | `Lobby.claim`, `Lobby.sponsor`, and `Lobby`'s event `Reclaimed` | `systems/lobby.cairo:30-31`, `:215-227`, `:260-280` |
| Component | `HostableComponent::claim`, `sponsor`, `reclaim` and the error `NOTHING_TO_RECLAIM`. `HostableComponent` stays (its `spawn` and `spawn_with`) | `components/hostable.cairo` |
| Component | `PayableComponent::pay` and `refund`, their errors (`ERC20: pay failed`, `ERC20: refund failed`), and `transfer` in the component's `IERC20` interface. `token_address` and `initialize` stay | `components/payable.cairo` |
| Model | `Tournament` (struct) and the whole `models/tournament.cairo` (`TournamentImpl`, `TournamentAssert`, `ZeroableTournament`, the errors, the unit tests) | `models/index.cairo:61-68`, `models/tournament.cairo` |
| Ranking | `leaderboard.cairo` whole (`Leaderboard`, `LeaderboardImpl::submit`, `ranked`, `top`, `Top3`, `Ranked`, `Submission`) | ruling 1 |
| Store | `Store::tournament`, `set_tournament`, `ranking`, `ranking_base`, `ranking_read`, `ranking_write` | `store.cairo` |
| Event | `Sponsored`, `Claimed` (`paved::events`) | `events.cairo:18-19`, `:88-103` |
| View | `tournament(id) -> TournamentView`, the struct `TournamentView`, `MAX_TOURNAMENT_ID` | `views.cairo` |
| Report | task 9 (`WIN`) at game over: the tally's `rank` and the rank `submit` returned | `quests.cairo:98-100`, `components/playable.cairo:43` (ruling 1) |

### The day id: renamed, moved, unchanged in value

- `TournamentImpl::compute_id(time, duration)` is now `paved::day::day_id(time, duration)` (`day.cairo`), the same
  `time / duration`. It is used by the seed (`types/mode.cairo`, `Mode::seed`), the spawn
  (`components/hostable.cairo`), the game over (`components/playable.cairo`, `end_in_day`, was `end_in_tournament`)
  and `current_day` (`views.cairo`).
- Renamed (ruling 2), layouts and order unchanged: `GameSpawned.tournament_id`, `GameOver.tournament_id` and
  `GameView.tournament_id` are `day_id`; `current_tournament_id()` is `current_day()`; the interface
  `ITournamentView` is `IDailyView`. `entry_price()` stays. The internal `Game.tournament_id` is `Game.day_id`.
- The constants `DAILY_TOURNAMENT_PRICE` and `DAILY_TOURNAMENT_DURATION` are `DAILY_PRICE` and `DAILY_DURATION`
  (`constants.cairo`), same values.
- `end_in_day` keeps setting `day_id` and `end_time` (`store.set_game_end`) when the game ends in the day it started,
  and leaves both 0 otherwise; it ranks nothing.

### No ranking on chain, and task 9

Ruling 1: the ranking goes and `WIN` (task 9) is no longer reported. `Tally` lost its `rank`; the encoded tally
(`quests::encode`) keeps its layout and leaves the 8 bits that held the rank at 0, so that `Daily` and a `Lobby` class
of either side of D-20 decode the same word during the rollout (`Daily`'s `build` encodes, `Lobby.report` decodes).
`achievement_counts` reports tasks 1 and 4 to 7: at most 5 entries (`ACHIEVEMENT_ENTRIES`, was 6). `TASK_WIN` stays
defined (9), never reported, never given to another task: a Champion achievement, if the owner wants one, is credited
by the indexer from its daily leaderboard, as On the Podium is (`quests.md`). Tested by
`tests::e2e::quests::test_quests_game_over_first_of_its_day_reports_no_task_9` (the first game of an empty day, rank 1
before D-20: `GameOver`, then exactly quests 1 and 3 and achievements 1 and 7, no task 9) and by the report tests
that now assert no `WIN`.

### The tokens after D-20

`Daily` holds no token and has no path that sends one. The token transfers left in the classes D-20 touched:

| Class | Transfer | Where | Belongs to |
|---|---|---|---|
| `Lobby` (run as `Daily`) | `transferFrom(player, Economy, stake x price)` on the entry token | `systems/lobby.cairo`, `purchase` | the purchase |
| `Economy` (untouched) | the purchase's split: swap through the router, burn, margin to the `Vault`, referral; the settlement's rewards | `economy/economy.cairo` | the economy (purchase, settlement) |
| `Vault` (untouched) | stakers' deposits, withdrawals and `claim` of their USDC (its own `Claimed { account, amount }`) | `economy/vault.cairo` | the Vault |

Nothing reads the prize storage: no code reads `tournaments`, `sponsorships` or `rankings` (`git grep` on
`contracts/src` finds them only where they stay declared, in the `lobby_audit` pin below (addresses and sentinels only), and in the frozen pre-D-18
copy `tests::legacy::store`, whose `ranking*` functions no test calls). The settlement never
did: `Economy.record` and `settle` keep their own `days` and `means`, keyed by `get_block_timestamp() / DAY`.

**Sepolia's prize funds (ruling 4)**, read-only on 2026-10-13 at block 16,538,960: `balanceOf(Daily)` on MockUSDC is
0, and `Daily` (`0x06a9...5ac8`) never emitted `Sponsored`, `Claimed` or `Reclaimed` (`starknet_getEvents` from block
0; the same query finds its 3 `GameSpawned`). Nothing was ever sponsored, so nothing is stuck: the funds question of
"Open for the PM" (4) has no object for this deployment. Earlier Sepolia deployments (another `Daily` address or
another token) are out of scope: the fresh deployment of P-53 replaces them, and no D-20 upgrade runs on Sepolia
(`upgrades.md`, "D-20 on Sepolia").

### Storage under P-42: what is dead

Each stays declared, is never written or read again, and is never reused; a comment says so where it is declared.

| Field | Declared in | Was written by |
|---|---|---|
| `PavedStorage.tournaments: Map<u64, Slots2>` (prize, claimed flags). Its name keeps "tournament": storage names do not change | `store.cairo` | `set_tournament` (`claim`, `sponsor`) |
| `PavedStorage.rankings: Map<u64, Slots4>` | `store.cairo` | `LeaderboardImpl::submit` |
| `HostableComponent.sponsorships: Map<(u64, ContractAddress), felt252>` (flat substorage of `Daily` and `Tutorial`) | `components/hostable.cairo` | `sponsor`, `reclaim` |

Kept live: `PavedStorage.game_ends` (`end_time`, `day_id`), `payable.token_address`, every other field. On Sepolia
the dead maps keep whatever they hold (`rankings` of the days played there; `tournaments` and `sponsorships` are
empty, above). `tests::e2e::lobby_audit::test_lobby_and_daily_pin_the_dead_fields_by_name` pins all three by name: the
entry address the code resolves through each field (`sponsorships` in `HostableComponent` as `Daily` and as `Lobby`
embed it, through a test-only accessor; `tournaments` and `rankings` through `PavedStorage`) equals the address
computed from the literal name, so a rename or a removal fails it (checked once by renaming `rankings`: the test fails
on `'Dead: rankings name'`); and sentinels written at every slot survive a whole game (spawn, build, surrender) through
`Daily` and its `Lobby`, so a reuse fails it.

### What `Lobby` and `Tutorial` lost

- `Lobby`'s class: `ILobby.claim`, `ILobby.sponsor` and the event `Reclaimed`. On an existing deployment a new class
  would be declared and set on `Daily` and `Tutorial` with `set_lobby_class` (P-42); on Sepolia the fresh deployment of
  P-53 starts with it (`upgrades.md`, "D-20 on Sepolia").
- `Tutorial` loses no entry point and no view; its ABI loses `Sponsored` and `Claimed` (declared, never emitted), and
  so does `Account`'s. Both ABIs also lose the `core::integer::u256` struct, which only `Claimed` used there.

### Mocks, tests and goldens

- `mocks/reentrant_token.cairo` **stays**: its `SPAWN` re-entry is not the prize's
  (`tests::e2e::lobby_audit::test_lobby_reentry_during_spawn_cannot_change_the_game_written`). Its `CLAIM`, `RECLAIM`
  and `SPONSOR` actions went, and `arm` lost its `tournament_id` and `rank` arguments.
- Tests removed: `tests/e2e/reclaim.cairo` (whole); `tests/leaderboard.cairo` (whole, the ranking's unit tests);
  `tests/bench.cairo` and `tests/bench_backend.cairo` (whole, the benches of the ranking update, P6);
  the unit tests of `models/tournament.cairo` (with the module); `e2e/daily_advanced.cairo`: the sponsor test and the
  three claim tests; `e2e/access.cairo`: the three claim refusals and the sponsor test (and `close_tournament`);
  `e2e/events.cairo`: `test_events_daily_sponsor_and_claim`; `e2e/views.cairo`: the `tournament` view's lifecycle,
  empty day and id bounds (replaced by `test_views_current_day_and_the_day_of_a_game`); `e2e/lobby.cairo`:
  `test_lobby_claim_writes_state_before_the_transfer` and the sponsor half of the spawn test (now
  `test_lobby_spawn_writes_state_before_the_transfer`), and the sponsor and claim steps of the two layout tests;
  `e2e/lobby_audit.cairo`: the claim, reclaim (two) and sponsor re-entries; `e2e/store.cairo`: the `Tournament`
  round trip; the `tournament` and `set_tournament` helpers of both `setup.cairo`; the gas cases h, j, p, q and r.
- Tests changed: `e2e/quests.cairo` (no task 9, 5 achievement entries at most, one new test above); the gas cases g
  and k (no prefill, g renamed `test_gas_g_closing_move_in_its_day`, i renamed `..._after_its_day`); the events and
  views tests build `GameSpawned`, `GameOver` and `GameView` with `day_id`.
- **Goldens: no expected score changed.** Only the harness's `top1_score` check (and the field in each case) went with
  the ranking; final scores, built and discarded counts, tile counts and the game-over flag stay asserted.

### Spec corrections (the planned inventory against the code)

- `leaderboard.cairo` had a third reader the inventory did not list: the P6 benches (`tests/bench.cairo`,
  `tests/bench_backend.cairo`). They went with the ranking.
- `PayableComponent::pay` raised `ERC20: pay failed` too, and `Lobby`'s purchase has its own constant with the same
  text (`Lobby::errors::PAY_FAILED`): the message stays, from `Lobby` only.
- The ABIs of `Account` and `Tutorial` also lose the `core::integer::u256` struct (only `Claimed` used it there).
- `tests::legacy::store` (the frozen pre-D-18 copy) read the `Tournament` model; its `tournament` and
  `set_tournament` went with it.

## As built: D-21, the tutorial leaves the contracts

D-21, D-22 and P-49 (`docs/programme/DECISIONS.md`, 2026-10-13): the tutorial goes fully off-chain, the game engine
is reproduced off-chain for a free Training mode (CLIENT's), and on chain only a claim of the tutorial achievement
stays, unverified by design. **Built by step D** (brief `docs/briefs/d-setup-quests.md`, with D-24 in one PR). The
inventory below was read from main at `7d04872d` (its line numbers are of that commit); every row was carried out as
it says, but for the differences under "Spec corrections (D-21 and D-24)" at the end of D-24. Since D-24 (below) the
claim lives in `Setup`, not in `Daily` or `Account`. The parity fixture (P-49 ruling 3) is in `parity-fixture.md`;
CLIENT keeps the tutorial game frozen from 38f1c95.

**As built, in short.** Gone: `systems/tutorial.cairo`, `components/tutoriable.cairo`, `elements/decks/tutorial.cairo`,
`Deck::Tutorial`, `Mode::Tutorial` and the felt `TUTORIAL`, the scripted branch of `Game::draw_plan` (the `else`
branch kept as it was), the Tutorial branch of `HostableComponent::spawn_with`, the tutorial paths of `Lobby` (with the
class, D-24), `Collection.tutorial()` (the view; the `tutorial` slot stays, read by `uri` for the Sepolia tokens),
`tests/golden/tutorial.cairo`, `tests/e2e/tutorial.cairo`, `tests/e2e/tutorial_advanced.cairo`,
`test_differential_tutorial_full_sequence`, `play_tutorial`, the tutorial cases of the e2e files, `build_tutorial`
of the frozen pre-D-18 class (`tests/legacy.cairo`) and the scripted branch of its `draw_plan`. **Codes reserved**:
`Mode` 2 and 3 and `Deck` 1 and 3 read as `None` (the `_` arm of `IntoU8Mode` and `IntoDeck`), each named in a comment
where the codes are listed, and `test_reserved_u8_into_mode` pins `Mode` 2 and 3; token ids from `TUTORIAL_OFFSET` up
have no minter on a new deployment (`Collection.set_minters(daily, 0)` is now accepted).

### What goes

| Item | Where (main) | What happens |
|---|---|---|
| The `Tutorial` contract: `ITutorial` (`spawn`, `discard`, `surrender`, `build`), its constructor, `set_lobby_class`, `IGameView`, `upgrade` | `systems/tutorial.cairo:1-186` (`ITutorial` `:3-9`) | the source goes. The Sepolia `Tutorial` stays deployed and unused (ruling 1); D-18c still upgrades it |
| `TutoriableComponent` (`discard`, `surrender`, `build` of the scripted game) | `components/tutoriable.cairo:1-238` | goes. It calls the shared engine (`placement` `:13`, `StructuresTrait` `:14`, `place_structures` `:201`, `assess` `:221`, `Store`), it does not change it |
| The tutorial deck and script | `elements/decks/tutorial.cairo:1-125` | goes |
| `Deck::Tutorial` | `types/deck.cairo:6`, `:26`, `:35`, `:46` (code 3), `:58`, `:71`, `:80`, `:89`, `:98`, `:107` | the variant goes; its code 3 stays dead (comment at `:19-20`), never reused (P-42, ruling 4) |
| The size-10 draw test | `helpers/random_deck.cairo:428-436` | stays as a draw test (it tests `draw_from_bitmap` on 10 cards, nothing of the tutorial); only its name and comment change |
| `Mode::Tutorial` and the felt `TUTORIAL` | `types/mode.cairo:22`, `:24`, `:30`, `:39`, `:48`, `:63`, `:72`, `:90`, `:101`, `:113`, tests `:125-157` | the variant goes; the u8 code 3 (persisted in `Game.mode`) maps to `Mode::None` and is never reused (ruling 4); the comment at `:24` says so |
| `Game::draw_plan`'s scripted branch | `models/game.cairo:278-286` | goes: the draw of the scripted deck (in order, no seed). The `else` branch (`:287-296`), the only one a Daily game takes, is unchanged |
| `HostableComponent::spawn`'s Tutorial branch | `components/hostable.cairo:89-94` (`tournament_id` 0), comment `:109` | goes |
| `Lobby`'s tutorial paths | `systems/lobby.cairo`: `ILobby.tutorial_discard`, `tutorial_surrender`, `tutorial_report` (`:34-35`, `:38-39`, `:294-312`), `TutoriableComponent` (`:83`, `:126-127`, `:189`, `:210`), `finish_tutorial` (`:464-470`), the Tutorial mint (`:404-416`), the comments (`:1-10`, `:21`, `:60`, `:68`, `:250`) | go (24 lines cite the tutorial). With D-24 the whole class ends (below) |
| `Collection`'s Tutorial range | `systems/collection.cairo:8-11`, `:23-24` (`TUTORIAL_OFFSET`), `:31`, `:35`, `:254`, `:303-306`, `:321-328`, `:333-336`, `:351-352` | stays readable (see "What `Collection` keeps") |
| Comments | `views.cairo:99`, `seed.cairo:15`, `lib.cairo:27`, `:85`, `:93` (modules) | follow |
| `TASK_TUTORIAL_FINISHED` (10) | `constants.cairo:39`, test `quests.cairo:238` | **stays**: the task the claim reports |
| Tests that run the tutorial | `tests/e2e/tutorial.cairo`, `tests/e2e/tutorial_advanced.cairo`, `tests/golden/tutorial.cairo`, `test_differential_tutorial_full_sequence` (`tests/differential.cairo`), `play_tutorial` of `tests/golden/harness.cairo`, and the tutorial cases of `tests/collection.cairo`, `e2e/access.cairo`, `e2e/events.cairo`, `e2e/lobby.cairo`, `e2e/lobby_audit.cairo`, `e2e/mint.cairo`, `e2e/quests.cairo`, `e2e/economy.cairo`, `e2e/upgrade_d18.cairo`, `e2e/upgrades.cairo`, `e2e/views.cairo`, `tests/seed.cairo`, `tests/setup.cairo`, `tests/legacy.cairo`, `tests/legacy/game.cairo` | go or lose their tutorial cases. The golden `tutorial_full` (2,794) is exported once to the parity fixture before its deck goes (`parity-fixture.md`) |

`scripts/deploy.sh` declares and deploys `Tutorial` (`:1886`, `:1979`, `:2003`), checks it (`:1200`, `:1573`, `:2076`) and upgrades it in `--d18` (`:1342`, `:1458`):
part B stops deploying it on a fresh network and leaves the Sepolia one alone.

### Does the removal touch the shared structure-state code? No

`structure/**` has no reference to the tutorial (`git grep -i tutorial contracts/src/structure` is empty), and
neither has `store.cairo`. In `models/game.cairo` the removal touches only `draw_plan`'s scripted branch
(`:278-286`), the draw, not `assess` (`:327`) or `place_structures` (`:313`). `TutoriableComponent` is a caller of
the engine; removing a caller leaves the engine as it is. So **ruling 5's audit is not needed**, on one condition
that part B keeps: the `else` branch of `draw_plan` stays byte for byte, which the real-deck goldens
(`daily_real_deck_discards`, `daily_full_deck`) pin.

### What `Lobby` and `Collection` lose, and their classes

- **`Lobby`** loses the three `tutorial_*` entry points, `finish_tutorial`, the Tutorial branch of `spawn` and
  `mint`, and `TutoriableComponent` (whose storage is empty, `tutoriable.cairo` `struct Storage {}`, so no address
  of the shared `PavedStorage` moves). Its class would change; with D-24 it ends.
- **`Collection`** keeps working on Sepolia unchanged: the `tutorial` minter is already set, and `uri` of a Tutorial
  token reads the `game` view of the still-deployed `Tutorial` (`collection.cairo:303-310`). No Tutorial token is
  minted after the upgrade. But a fresh deploy cannot call `set_minters` without a Tutorial: it refuses a zero
  `tutorial` and `daily == tutorial` (`:324-326`). Part B changes `Collection` to accept a zero `tutorial`; with
  D-23's rename (`daily()` becomes `challenge()`) its class changes anyway.

### Storage left dead

- `Tutorial`'s own storage, at its own address: everything stays as it is, unused (games, tiles, achievement
  storage, `lobby_class`, `owner`).
- In `Daily` (Challenge): nothing; the tutoriable substorage is empty.
- `Collection.tutorial` (`collection.cairo:254`): still read for the Tutorial tokens of Sepolia, never written again.
- Codes never reused: `Mode` 3, `Deck` 3, and the token ids from `TUTORIAL_OFFSET` up.

### The claim (ruling 2)

Superseded by D-24 (P-51 ruling 3): the claim lives in the quest system, so the `Daily`-or-`Account` comparison of
the first addendum is dropped. Its design is in "D-24" below: `claim_tutorial()`, called by the player, one flag per
player, emits `AchievementProgressed { player_id, task_id: 10, count: 1 }`, which credits First Stone
(`quests.md`, achievement 1, `TUTORIAL_FINISHED` 1).

## D-23: Daily becomes Challenge (planned)

D-23 and P-50 (`docs/programme/DECISIONS.md`, 2026-10-13): `Daily` is renamed `Challenge`, and the shared daily
seed is dropped: each game's seed comes from its token id, so every Challenge game is different. The indexer still
ranks Challenge scores per UTC day. Not built yet; read from main at `7d04872d`, paths under `contracts/src/`. The
interface table is in `public-interface.md`, "Breaking change D-23".

### External names that change

| Old | New (proposed) | Where (main) |
|---|---|---|
| contract `Daily`, module `paved::systems::daily` | `Challenge`, `paved::systems::challenge` (`systems/challenge.cairo`) | `systems/daily.cairo:49`, `lib.cairo:91` |
| ABI file `contracts/abis/Daily.json` | `Challenge.json` | `scripts/abis.sh` |
| `IDaily` | `IChallenge` | `systems/daily.cairo:10`, `:80`, `:181` |
| `IDailyQuests` | leaves for the quest system (D-24) | `systems/daily.cairo:29`, `:222` |
| ABI impl names `DailyImpl`, `DailyQuestsImpl` | `ChallengeImpl` (the quests impl leaves, D-24) | `systems/daily.cairo:181`, `:222` |
| ABI event enum `paved::systems::daily::Daily::Event` | `paved::systems::challenge::Challenge::Event` | `systems/daily.cairo:136` |
| `Mode::Daily` | `Mode::Challenge`: **code 1 unchanged** (`types/mode.cairo:100`, `:112`), Serde index 1 unchanged in `Lobby.json` | `types/mode.cairo:29`, and every `Mode::Daily` (`daily.cairo:187`, `lobby.cairo:251`, `views.cairo:254`, `models/game.cairo:467`) |
| felt `DAILY = 'DAILY'` (`Mode` into `felt252`) | `CHALLENGE = 'CHALLENGE'` | `types/mode.cairo:21`, `:89`; stored nowhere (below) |
| `DailySeed`, `DailySeedImpl` | replaced by `TokenSeed` (below) | `seed.cairo:15-24`, `components/hostable.cairo:19`, `:49` |
| `DAILY_TOURNAMENT_PRICE`, `DAILY_TOURNAMENT_DURATION` | `CHALLENGE_PRICE`, `DAY` (proposed; D-20 drops "tournament") | `constants.cairo:10-14` |
| errors `'Daily: account is zero'`, `'Daily: token is zero'`, `'Daily: lobby class is zero'` | `'Challenge: ...'` (the third goes with `lobby_class`, D-24) | `systems/daily.cairo:85-87` |
| errors `'Daily: quest not on UTC day'`, `'Daily: task total is zero'`, `'Daily: task id repeated'` | move to the quest system with the definitions (D-24), renamed there | `systems/lobby.cairo:111-113` |
| `Collection.daily()` view; `set_minters(daily, tutorial)` argument | `challenge()`; `set_minters(challenge, ...)` (an argument's name is not in a selector) | `systems/collection.cairo:31`, `:34`, `:321`, `:347` |
| `scripts/deploy.sh`: no mode is named after `Daily` (`--repoint`, `--d18`, `--estimate-only`, `--rehearse`); the names are `addr("Daily")`, `declare_class Daily`, `deploy Daily`, `DAILY*` variables and messages, and the record keys `declare.Daily`, `previous.Daily.class_hash`, `Daily.class_hash` | `Challenge` everywhere | `scripts/deploy.sh:794`, `:1303-1311`, `:1331-1338`, `:1409`, `:1468-1484`, `:1510-1515`, `:1885`, `:1978`, `:2003`, `:2016`, `:2099-2150` (89 lines name it) |
| `contracts/deployments/sepolia.json`, `devnet.json`: `contracts.Daily` | `contracts.Challenge` | `sepolia.json:18`, `devnet.json:18` |
| test-only: `IDailySafeDispatcher` of the re-entrant mock, the test helpers | follow | `mocks/reentrant_token.cairo:39`, `tests/**` |

No event, view or struct of `paved::events` or `paved::views` holds "Daily" in its name. The economy's names (`Economy`,
`Purchased`, `Settled`, ...) do not either; its comments say "Daily" (`economy/economy.cairo:1-4`) and follow.

### Storage: no address moves (ruling 1)

| Checked | Depends on a name that changes? |
|---|---|
| Substorage names of `Daily` (`hostable`, `ownable`, `payable`, `playable`, `quest`, `achievement`, `upgradeable`; `systems/daily.cairo:113-130`) and the field `lobby_class` (`:127`) | no: none holds "daily". With `#[substorage(v0)]` (flat) the component fields hash by their own names (`sponsorships`, `token_address`, `owner`, `Quest_*`, ...), not by the contract's |
| The storage node `PavedStorage`, rooted at `selector!("paved")` | no: `store.cairo:112`, `lobby.cairo:385`, `:395`. These are the only `selector!` of the contracts outside the tests, and no `sn_keccak` of a contract name exists |
| `Collection`'s field `daily: ContractAddress` | **its address is `sn_keccak("daily")`** (`collection.cairo:253`): it stays only if the field keeps its name, which P-42 requires. The view is renamed, the field is not. Flagged for part B, not for the PM: no move if the rule is kept |
| `Economy`'s `game` field (the address of `Daily`, `set_game`) | no: the address of the upgraded contract does not change |
| The `Mode` code stored in each game (`Game.mode`, a `u8`, packed by `store.cairo:320`) | no: `Mode::Challenge` keeps code 1. The felt `'DAILY'` is never stored or hashed |
| Event keys | no: an event's selector is its variant name (`GameSpawned`, ...), not the module path; the ABI's enum name changes, the keys do not |
| The contract's address on Sepolia | no: `Daily` is upgraded in place to the class named `Challenge` (P-42); the address and the storage stay |

So nothing goes under "For the PM" from storage.

### Who reads `contracts.Daily` and the ABI name

- `scripts/deploy.sh` (`--repoint` `:1303-1311`, `--d18` `:1331-1515`, the deploy and smoke `:1885-2150`).
- META, the indexer: `packages/indexer/src/deployment.ts:53` (`address("Daily")`), and the comments that name
  `Daily.json` (`crosscheck.ts:20`).
- CLIENT: `packages/chain/src/abis.ts:2` (imports `contracts/abis/Daily.json`), `:13`, `:41` (`ContractName`),
  `deployment.ts:45`, `views.ts:24`, `:185-193`, `economy/writer.ts:281`, `:390`, `writer.ts:256-317` (the prize calls
  go with D-20), `packages/app-web/src/pages/Player.tsx:156` (the label "Daily").

**When the key changes.** With the code that reads it: the later Sepolia upgrade that installs D-19 to D-24
(ruling 5) rewrites `contracts.Daily` to `contracts.Challenge` in `sepolia.json`, in the same PR as `deploy.sh` and the
renamed ABI. META and CLIENT must read the new key from that release on. Proposed, to avoid a lockstep: before the
upgrade, META's `deployment.ts` and CLIENT's `chain` package accept `Challenge` and fall back to `Daily`; after it,
the fallback goes.

### The seed (ruling 2)

- **Today.** `HostableComponent::spawn` calls `spawn_with(mode, @DailySeed {})` (`components/hostable.cairo:48-50`);
  `spawn_with` takes the game id from `store.uuid()` (`:64`, `store.cairo:135-139`, the counter
  `PavedStorage.game_count`), then asks the source for the seed with `source.seed(mode, time, game.id, game.seed)`
  (`:69`). `DailySeed` (`seed.cairo:15-24`) answers `Mode::seed` (`types/mode.cairo:52-62`):
  Poseidon(salt, day id) for a Daily game, 0 for the Tutorial. The salt is `game.seed`, which `Game::new` sets to 0
  (`models/game.cairo:95`): **every Daily game of a day has the same seed**, Poseidon(0, day id).
- **Where the token id comes from.** `Collection` has **no counter**: its storage is `daily`, `tutorial`, `owners`,
  `balances` (`collection.cairo:247-256`). A Daily game's token id is its game id (`lobby.cairo:409-416`), and the
  game id is `Daily`'s own counter, drawn by `store.uuid()` before the seed. The order at spawn is: game id
  (`hostable.cairo:64`), seed (`:69`), game written (`:87`), `GameSpawned` (`:95-107`), then the purchase
  (`lobby.cairo:252`) and last `Collection.mint` (`lobby.cairo:255`, `:415`), which `Daily` calls. So the seed needs
  **no call to `Collection`**: the token id is known in `spawn_with`, and `SeedSource::seed` already receives it
  (`game_id`, `seed.cairo:11`). With D-21 there is no `TUTORIAL_OFFSET` range to add.
- **The new source.** `TokenSeed`, `impl TokenSeedImpl of SeedSource<TokenSeed>`: Poseidon(salt, token id), with
  the token id the game id. `SeedSource` stays (`seed.cairo:10-13`), so a VRF can replace `TokenSeed` without
  touching the game. `Mode::seed` stops reading the day.
- **The day id stays**, without the seed: `compute_id(time, 86400)` still gives `GameSpawned.tournament_id`,
  `GameOver.tournament_id` and `GameView.tournament_id` (D-20), which the indexer's per-day leaderboard groups on
  (ruling 3), and `Economy` keeps its own day (`economy/economy.cairo:37`, `:602`). Neither depends on the seed.
- **The goldens.** Their draws come from the day seed (the real-deck cases `daily_real_deck_discards` and
  `daily_full_deck`, and the `drawn` plan of every forced move). Proposed: the harness spawns through `spawn_with` with
  a test source that gives the old day seed (the pattern of `tests/seed.cairo:8-16`), so every expected value stays
  identical, and a new test pins `TokenSeed` itself. Otherwise the goldens are regenerated, which P0 forbids without a
  rule change.
- **E-1 goes.** E-1 is the replay of the shared day deck (`economy.md`, risk E-1, `:751`): the "replayer" strategy of
  the Monte-Carlo, `scripts/montecarlo/sim.py:52-55` (`draw_score` takes the day's best known line), `:87`, `:196`
  (always stake 10), `:377-378`, `:407-408`, and its rows in `scripts/montecarlo/output.md:55-56`, `:84-85`. No Cairo
  test exercises it (`tests/seed.cairo:31-52` tests the source, not a replay). With a seed per token id there is no
  day deck to replay; the simulation task (ruling 4) removes the strategy.
- **The new risk.** The next token id is `game_count + 1`, public before a purchase, and the salt is 0, so anyone can
  compute the next game's deck and buy only good ones: the selective buyer's edge, measured by the separate
  simulation task (P-50 ruling 4).

## As built: D-24, Lobby's cold paths and a quest system

D-24 and P-51 (`docs/programme/DECISIONS.md`, 2026-10-13): the `Lobby` library class stops existing as such, its cold
paths go back into Challenge, the quests and achievements move to a separate system that mode contracts report to,
and the name Lobby is kept for the multiplayer mode (no Lobby contract before that mode is planned; the D-19 seat
stays). **Built by step D**, as `Setup` (D-25's name). The inventory and the design below were read from main at
`7d04872d`; the built code follows them, but for "Spec corrections (D-21 and D-24)" at the end.

**As built, in short.**

- `Daily` runs `spawn` (with the purchase and the mint), `discard`, `surrender` and `build` in its own code; the
  game-over finish (`Daily::InternalImpl::finish`, `systems/daily.cairo`) makes one external call,
  `Setup.report(player_id, quest_entries(tally), achievement_entries(tally))`, then `Economy.record(game_id, score)`.
  `player_id` is `get_caller_address()`, the caller of the move that ended the game, who is the game's player:
  `PlayableComponent::discard`, `surrender` and `build` (`components/playable.cairo`) take `builder_of(caller)` and
  `assert_exists` it before any effect, `'Builder: does not exist'` otherwise.
- The constructor is `(owner, account_address, token_address, setup_address)` (`setup_address` non-zero, `'Daily:
  setup is zero'`). `Daily` keeps `Setup`'s address in a new storage field, `setup`, and the owner may change it with
  `set_setup(setup)` (`IDailySetup`, never zero, emits `SetupSet { setup }`; `setup()` reads it). Step E's single
  registry can keep that field as the one address `Daily` reads its wiring from, replacing the `Account` reads of the
  economy and the collection.
- `set_lobby_class`, `ILobbyClass`, `LobbyClassSet`, the library-call wrappers and `IDailyQuests` are gone;
  `systems/lobby.cairo` is deleted. `lobby_class` and the flat `quest` and `achievement` substorage stay declared in
  `Daily`, dead, pinned by name (`upgrades.md`, "Dead slots since D-21 and D-24").
- `Setup` (`systems/setup.cairo`): `quests.md`, "As built: D-21 and D-24". Its CASM is 13,449 felts; `Daily`'s is
  60,560, 12,387 under the P-44 cap (`class-headroom.md`, "After D-21 and D-24"): no fallback library was needed.

### Every path of today's `Lobby`, and where it goes

| Entry point or path (`systems/lobby.cairo`) | Lines | Goes |
|---|---|---|
| `spawn(mode, stake, referrer, min_out)`: `hostable.spawn`, then `purchase` and `mint` | `:23-29`, `:241-258` | **back to Challenge** (its Daily branch; the Tutorial branch goes with D-21) |
| `purchase` (USDC to `Economy`, `Economy.purchase`), `mint` (`Collection.mint`), `economy()`, `collection()` | `:423-448`, `:409-416`, `:384-390`, `:394-400` | **back to Challenge** |
| `discard(game_id)`, `surrender(game_id)` (`PlayableComponent`), then `finish` | `:32-33`, `:282-292` | **back to Challenge** |
| `report(game_id, over)` (the game over of a `build`), `finish`: the quest and achievement progress, then `Economy.record` | `:36-37`, `:306-308`, `:454-462` | split: the progress becomes **one call to the quest system**; `Economy.record` (`:460`) **stays in Challenge** |
| `claim(tournament_id, rank)` (rank 0: reclaim), `sponsor(amount)`, event `Reclaimed` | `:30-31`, `:260-280`, `:215-227` | **gone** (D-20) |
| `tutorial_discard`, `tutorial_surrender`, `tutorial_report`, `finish_tutorial`, `TutoriableComponent` | `:34-39`, `:294-312`, `:464-470`, `:126-127` | **gone** (D-21); the task 10 progress becomes the tutorial claim of the quest system |
| `define_quest` (owner, UTC-day alignment, `assert_tasks`), `retire_quest`, `define_achievement`, `retire_achievement`, `assert_tasks` | `:42-57`, `:314-362`, `:367-380` | **to the quest system** |
| `QuestHooks`, `AchievementHooks` (`authorize_admin` false: the external layer is not embedded) | `:139-174` | **to the quest system**, with `authorize_admin` = its owner |
| errors | `:106-114` | split: `NO_ECONOMY`, `NO_COLLECTION`, `PAY_FAILED` to Challenge; the three quest errors to the quest system; `NOT_DEPLOYABLE` gone |
| the reverting constructor | `:231-235` | gone with the class |
| `ILobbyClass.set_lobby_class`, event `LobbyClassSet` | `:62-72` | gone (below) |

### How `Daily` and `Tutorial` reach `Lobby`, and what stays dead

Each cold entry point of `Daily` is a wrapper, `ILobbyLibraryDispatcher { class_hash: self.lobby_class.read() }`,
that is a `library_call_syscall` of the class in `lobby_class` (`systems/daily.cairo:186-187`, `:192-193`, `:198`,
`:203`, `:208`, `:216-217`, `:231-252`); `build` itself runs in `Daily` and calls `report` only when the game ends
(`:211-219`). The class hash is the storage field `lobby_class` (`:126-127`), written by the constructor (`:164`,
`:169`, `:173`) and by the owner's `set_lobby_class` (`:265-275`, P-42), which emits `LobbyClassSet` (`:153`).
`Tutorial` has the same (`systems/tutorial.cairo:75-76`, `:108-115`, `:124-147`, `:162-171`).

Once the cold paths are Challenge's own code: the wrappers become the code, `set_lobby_class`, `ILobbyClass` and
`LobbyClassSet` leave the ABI, and the constructor loses its `lobby_class` argument (new deploys only). **The
`lobby_class` slot stays declared, never read or written again, never reused** (P-42); so do the substorage members
`Lobby` used that leave (the dead `sponsorships` of D-20, the empty `tutoriable`). `Tutorial`'s `lobby_class` stays
as it is, in a contract nobody uses.

### Challenge's CASM after the move back: a projection

Not measured; the implementation measures (ruling 4). From `class-headroom.md`:

- **Start**: `Daily` 53,418 after D-18, about 58,300 with D-19b.
- **Comes back** (estimates from the per-module and per-function figures of main before the split, P7 and
  pre-D-18, which are upper bounds since D-18 shrank the engine): `HostableComponent::spawn` 1,590, the purchase,
  the mint and the two registry reads (no figure; of the order of 1,000 to 2,000), `PlayableComponent::discard` 3,972
  (it inlines the draw and the game over), `surrender` 517, the game-over finish with `Economy.record` and the call
  to the quest system (of the order of 1,000). About **7,000 to 9,000**.
- **Leaves `Daily`**: with D-20, `models::tournament` 1,131, `leaderboard` 1,410 (if the ranking goes), the
  `tournament` view and the `claim` and `sponsor` wrappers; with D-24, the `IDailyQuests` wrappers and the quest
  declarations (part of the +1,577 of report wrappers measured in P7), `set_lobby_class` 325 and the library-call
  wrappers. About **4,000 to 5,000**. D-21 removes nothing from `Daily` (the tutorial is `Tutorial`'s and `Lobby`'s).
- **Projection: about 61,000 to 64,000 CASM felts**, against the P-44 cap of 72,947: some 9,000 to 12,000 of margin.
- **Cross-check**: before the split, main's `Daily` with everything in it (P7) was 91,570; D-18 removed 19,529 from
  `Daily`, so "everything in `Daily`" after D-18 is about 72,000; D-19b adds about 4,900, and D-20 and D-24 remove the
  prize (about 3,000 to 4,500 with the ranking) and quiver (6,491 measured in P7) with the definitions. That gives
  about 64,000 to 66,000: the same answer from the other side.

So **`spawn`, `discard` and `surrender` are likely to fit in Challenge**, with no library under another name. If the
measurement passes the cap, the fallback is ruling 1's: a library class under another name for `spawn` and the
purchase (the biggest piece that is not on the move path), with the same flat-storage rules as `Lobby` had.

### The quest and achievement code today

- **Components.** `Daily` declares quiver's `QuestComponent` and `AchievementComponent` (`systems/daily.cairo:107-108`,
  storage `quest` and `achievement` `:122-125`, events `:147-150`) and runs them in `Lobby`
  (`lobby.cairo:131-136`): the internal layer only, event mode, `TrackAll`, no view. `Tutorial` declares the
  achievement component to report task 10 (`systems/tutorial.cairo:61`). Their storage is the flat `Quest_*` and
  `Achievement_*` members (listed in `tests/e2e/lobby_audit.cairo:48-51` and pinned at `:121-135`: `Quest_definitions`,
  `Quest_tasks`, `Quest_conditions`, `Achievement_definitions`, `Achievement_extra_tasks`).
- **Definitions.** `IDailyQuests` (`systems/daily.cairo:28-46`, `:221-254`): `define_quest`, `retire_quest`,
  `define_achievement`, `retire_achievement`, owner-only, checked in `Lobby` (`lobby.cairo:314-362`).
- **Events.** `QuestDefined`, `QuestProgressed`, `QuestRetired`, `AchievementDefined`, `AchievementProgressed`,
  `AchievementRetired` emitted; `QuestCompleted`, `QuestClaimed`, `QuestReporterSet`, `AchievementReporterSet`
  declared, never emitted (`Daily.json`; `indexer.md`).
- **Where the progress is computed.** Not by a call on every move. A move updates the four game counters
  (`GameImpl::count_structure`, `count_forest`, `count_wonder`, `models/game.cairo:216-241`), packed in
  `GameState` with the game. Only a move that ends the game returns a non-zero tally (`quests::encode`,
  `quests.cairo:37-46`; `playable.cairo:115-130`, `:159-173`, `:262-277`), and `Daily.build` then makes **one**
  library call, `Lobby.report(game_id, over)` (`systems/daily.cairo:211-219`); `discard` and `surrender` already run
  in `Lobby` and finish there. `finish` decodes the tally (`quests::decode`) and makes two internal calls,
  `quest.progress_many` (tasks 1 to 4, at most 4 entries) and `achievement.progress_many` (tasks 1, 4 to 7 and 9, at
  most 6 entries), then `Economy.record` (`lobby.cairo:454-462`). So: **zero calls on a move that does not end the
  game, one at game over.**

### The quest system's design (recommended)

- **One system, not two.** One contract, **`Setup`** (the D-24 system, named Setup by D-25, which also gives it the configuration and the
  wiring; the rest of D-25 is planned in `glitchbomb-gap.md`), holding both quiver components. Clarity: one
  address for the indexer, one owner, one reporter allowlist, one place for the tutorial claim. CASM: quiver's two
  internal layers measured 6,491 felts together in `Daily` (P7), plus the external definitions, `Ownable`,
  `Upgradeable`, the allowlist and the claim: an estimate of 12,000 to 16,000, far under any cap, so CASM does not
  push for a split. Two systems would duplicate the owner, the upgrade and the allowlist, and double the calls of a
  game over.
- **The reporting interface.** `report(player_id: felt252, quests: Span<TaskProgress>, achievements:
  Span<TaskProgress>)`, with quiver's `TaskProgress { task_id: u32, count: u32 }`: one call per game over, which runs
  `progress_many` on each component (quests in `Mode::Event`). It emits quiver's own events, `QuestProgressed
  { #[key] player_id, #[key] task_id, count }` and `AchievementProgressed { #[key] player_id, #[key] task_id, count }`,
  one per entry. The tally's encoding (which counters make which task) stays in Challenge (`quests.cairo`): the system
  knows tasks, not games, so a multiplayer mode later reports its own entries through the same call.
- **The allowlist.** `set_reporter(reporter: ContractAddress, allowed: bool)`, owner-only. It sets the reporter in
  both components (quiver's `set_reporter`, which emits `QuestReporterSet` and `AchievementReporterSet`), and
  `report` reverts for a caller that is not a reporter (quiver's `assert_reporter`, `'Quest: not reporter'`).
- **Who may report for whom (the audit's question, ruling 6).** The system **cannot** know a game's player: it
  would have to call back the reporter's `game` view for a game id, which costs a call per game over and ties the
  system to one mode's views. So it **trusts the reporter for whom**: an allowlisted contract may report for any
  player. The guarantee is Challenge's code: it reports only for the caller of the move that ended the game
  (`player_id = get_caller_address()`, `lobby.cairo:456`), and that caller must be the game's player, or the move
  reverts (`builder_of(player_id)` then `assert_exists`, the "not the player" checks of `PlayableComponent`). The
  audit checks that path, the owner-only allowlist, and that no other path of a reporter calls `report`. The
  exposure of a wrong report is bounded by P-22: progress carries no reward in v1.
- **The tutorial claim.** `claim_tutorial()`, called by the player (`player_id` = the caller), no argument. It reads
  `tutorial_claims[player_id]`; when set it returns without effect (idempotent, no revert, no event); otherwise it
  sets it and runs `achievement.progress(player_id, TASK_TUTORIAL_FINISHED = 10, 1)`, which emits
  `AchievementProgressed { player_id, task_id: 10, count: 1 }` and credits First Stone (achievement 1). No check of
  the tutorial (by design), no registration check, no token or value. The flag is `tutorial_claims: Map<felt252,
  bool>` in the new contract's own storage (one slot per player).
- **The definitions.** `define_quest`, `retire_quest`, `define_achievement`, `retire_achievement`, owner-only, with
  today's checks (a recurring quest starts at 00:00 UTC, every task total positive, no task id twice).
- **The cost on a Challenge move.** Batched at game end, as today: **no call on a move that does not end the game**;
  one external call at game over, carrying the player and at most 10 entries, instead of today's library call to
  `Lobby` (about 118,650 L2 gas in release for the call itself, `class-headroom.md`). An external call costs the same
  order. A call per move is refused: every move would pay it, for nothing the game over cannot carry.
- **Training reports nothing**: it is off chain (D-22) and no contract of it is a reporter.
- **Storage.** Fresh in `Setup`. `Daily`'s (Challenge's) `Quest_*` and `Achievement_*` members are left dead, never
  read or written, never reused (P-42); `Tutorial`'s achievement storage stays in the unused contract. Past progress
  is not migrated (ruling 5).
- **Events the indexer follows.**

| Event | Before: emitter | After: emitter | Layout |
|---|---|---|---|
| `QuestDefined`, `QuestRetired`, `QuestProgressed` | `Daily` | `Setup` | unchanged (quiver 0.2.0) |
| `AchievementDefined`, `AchievementRetired` | `Daily` | `Setup` | unchanged |
| `AchievementProgressed` | `Daily` (tasks 1 to 9), `Tutorial` (task 10) | `Setup` (task 10 from `claim_tutorial`) | unchanged: keys `player_id`, `task_id`; data `count` |
| `QuestReporterSet`, `AchievementReporterSet` | declared, never emitted | `Setup`, at each `set_reporter` | keys `reporter`; data `allowed` |
| `QuestCompleted`, `QuestClaimed` | declared, never emitted | declared, never emitted (event mode) | unchanged |

Past events from `Daily` and `Tutorial` stay in history; the indexer follows `Setup` from its deployment block in
CLIENT's W1 (ruling 5).

### Sepolia

The later upgrade (ruling 5, with D-19 to D-23): deploy `Setup` (deployer account), set Challenge as its reporter,
define the quests and achievements there again (the definition script runs against `Setup`), upgrade `Daily` to the
Challenge class. No migration of past progress. `Tutorial` and the declared `Lobby` class are left alone.

### Spec corrections (D-21 and D-24)

- `Mode::Tutorial` and `Deck::Tutorial` went as planned, but the codes are kept by the `_` arms, not by an explicit
  `3 => None` arm; `Deck` 1 (Base) is reserved the same way. The comments say so.
- `Collection.tutorial()` goes too (PM's addendum to step D: it is the Tutorial NFT path); the plan kept it. Its slot
  stays, read by `uri` for Sepolia's Tutorial tokens.
- `contracts/abis/Tutorial.json` is removed with `Lobby.json` (the brief), not kept frozen as `public-interface.md`
  planned; it stays in git history (38f1c959).
- `Daily` keeps the `quest` and `achievement` storage as substorage without declaring the components, so the quiver
  events leave its ABI (the plan left that open).
- The definition errors are `Setup`'s: `'Setup: quest not on UTC day'`, `'Setup: task total is zero'`, `'Setup: task
  id repeated'` (were `'Daily: ...'`). The cold paths' errors are `'Daily: economy not set'` and `'Daily: collection
  not set'` (were `'Lobby: ...'`); `'ERC20: pay failed'` is unchanged.
- `Setup.report` checks one allowlist, the quests' (the plan said quiver's `assert_reporter`, which is per component):
  `set_reporter` writes both together, and the second read cost 50,530 L2 gas on every game over.
- The game over costs more than "the same order" the plan expected: +171,000 to +287,000 L2 gas (`baseline.md`,
  "After D-21/24"), and scenario i passed its ceiling: raised to measured + 5 %, 2,847,987 (CORE's decision).
- No script defined the quests or achievements against `Daily` (they were defined by hand): nothing to move.

## What Paved needs from a leaderboard package

This is the request that decision O-1 sends to the Overseer, for Grim World's track ARC (never a PR of ours). It describes what Paved's `Daily` contract calls today, so that the package published from the port of cartridge-gg/arcade's leaderboard can replace it without a change to the game flow, the public views or the events. Paved decides on the swap by measured numbers once a version is published; the numbers it will compare are in "Limits".

**Interface.** Paved calls the package from its own game contract, in the same transaction, so the package must be usable as internal code on the contract's own storage: no external entry point of the package may appear in the ABI of `Daily` (a new entry point changes `contracts/abis/Daily.json`, which the client reads). It must be reachable the way Paved's `Store` is, from a storage node or path (`#[starknet::storage_node]`), not only from a component state taken by `ref self`; if it is only a component, say so and Paved will adapt its three call sites, at the cost of a signature change in the game flow.

```cairo
/// What a game contract submits when a game ends.
struct Submission { player_id: felt252, game_id: u32, score: u32, time: u64 }
/// What Paved reads back for a rank. Zero player and zero score mean an empty rank.
struct Ranked { player_id: felt252, score: u32 }
struct Top3 { first: Ranked, second: Ranked, third: Ranked }

fn submit(tournament_id: u64, submission: Submission) -> u8;   // rank taken 1..=3, 0 if not placed
fn ranked(tournament_id: u64, rank: u8) -> Ranked;             // rank 1..=3; any other rank answers an empty Ranked
fn top(tournament_id: u64) -> Top3;
```

- **Key**: `tournament_id: u64`, any value (0 included, no assumption that ids are contiguous or start at 0; today they are `timestamp / 86400`, at most `213503982334600`).
- **Rule, as `Tournament::score` in `contracts/src/models/tournament.cairo` today**: a higher score ranks higher; a submission whose score is equal to the score of a rank does not displace it (equal scores keep the earlier submission, by order of calls, never by `time`); a placed submission shifts the lower ranks down by one; a score of 0 never ranks (an empty rank has score 0); the board ranks games, not players, so one player may hold two or three ranks (no per-player de-duplication; `game_id` is data, not a key). `time` is data too: the package must not read the block timestamp or compare submissions by `time`.
- **Never reverts on a valid game end**: a score of 0, a `player_id` of 0 or a score below rank 3 returns 0 and writes nothing. A closing move must not fail because of the leaderboard.
- **Top-N**: N = 3 on chain (the prize ranks). Everything below rank 3 is not stored on chain: it comes from the events through Paved's indexer (`docs/architecture/indexer.md`). The package need not hold more, and must not make a larger N cost more at N = 3.
- **No prize, no claims**: the prize pool, its split and the claimed flags stay in Paved. The package holds only the ranking.

**Access control.** Only the registered game contract submits. As internal code, `submit` has no external entry point at all. If it is a separate contract, one game address is set at construction (or by an owner-only `register_game`), `submit` reverts for any other caller, and no other write exists. Reads are open to all. No other admin, no upgrade authority of its own beyond what the deploying contract has.

**Limits.**

- *Gas, measured* (stage A, `docs/measures/baseline.md` "Leaderboard behind an interface"). Method of Grim World's table: a bench test that calls the operation against a baseline test that only primes the tournament, whole-test snforge L2 gas, difference, minus the cost of the `interact_with_state` wrapper that the bench pays and an internal call does not (517,560 on the Mac). The figures are those of the Mac and of Linux alike: the `Test game` job of the PR (run 37652684501, Linux) gives the same L2 gas, to the unit, for each of the 22 bench cases and for scenarios a0 to j (the gas of a test does not depend on the machine), so one column serves both.

| Operation (full board 30, 20, 10 unless said) | Today's `Tournament` update (main) | Native implementation behind the interface | Grim World package |
|---|---|---|---|
| submit placing at rank 1 (two ranks shifted) | 632,778 | 424,079 | 427,420 |
| submit placing at rank 2 | 632,778 | 333,669 | 313,540 |
| submit placing at rank 3 | 632,778 | 240,519 | 198,050 |
| submit not placing | 632,778 | 86,579 | 47,920 |
| submit, score 0 | 632,778 | 15,580 | 0 |
| submit, player 0 | 230,778 (main places it) | 16,780 | 0 |
| top 3 read (full board) | 231,508 (the five-slot read) | 182,689 | 163,910 |
| one rank read, full board | 231,508 (same read) | 116,749 | 83,450 |
| one rank read, empty tournament | 231,808 (same read) | 88,759 | 44,530 |
| 1st submission of a tournament (slot creation) | 1,437,078 | 1,228,379 | 1,005,030 |
| 2nd submission | 1,034,978 | 735,869 | 602,200 |
| 3rd submission | 1,034,778 | 642,519 | 599,750 |

  Main's update reads the five slots and writes them back whether it ranks or not, so its cost is one figure; it has no cheaper `ranked`. The player-0 figure of main is lower than the others for a reason that was not found (main places the submission). That submission cannot happen in the game flow: see "Can player 0 reach the top 3?" below. After 10, 100 and 1,000 prior submissions no figure changes by more than 200 L2 gas, for main and for the native implementation (rank 1, not placing and top 3 measured at each size): nothing depends on the number of submissions.

  At the contract level (the cost of a whole closing move, `contracts/tests/gas.cairo` g to j) the ranking update was 714,458 L2 gas on main whatever happened; it is now 515,989 when it ranks (rank 1, two shifts) and 178,489 when it does not (these include the game-end slot write that both versions pay). The `tournament` view costs 17 % more (+53,710), two storage entries instead of one.
- *Ceiling the package must meet*: the closing move of a game that ranks at rank 1 with a full board costs at most 1,296,739 L2 gas (`CEILING_CLOSING_PLACES`, native + 5 %), one that does not rank at most 942,364 (`CEILING_CLOSING_NOT_PLACED`), the `tournament` view at most 388,740 (`CEILING_VIEW`), and none of them depends on the number of submissions already made (no loop over submissions). In bench terms, the table above: a package is accepted when its closing moves meet these ceilings, whatever the split between `submit`, `top` and `ranked`. The swap is refused when a closing move that places costs more than before the swap.
- *Storage per tournament*: today 5 slots (`Slots5`: the prize, 3 player ids, and one word with 3 scores and 3 claim bits). The package side is 4 of them (3 player ids, one word of scores). Ceiling: 4 slots if the package stores only player and score, 6 if it also stores game id and time (packed: one slot per rank for score, game id and time, one for the player id). A submit writes the slots that changed, with one accepted exception (Grim World's D-232, accepted by the project manager in Paved's name): the package rewrites player slot 3 on a placement that reaches it even when it is unchanged, about 72k in that rare case.
- *Events*: `GameOver` stays Paved's, with its keys (`game_id`, `player_id`, `tournament_id`) and data (`mode`, `score`, `start_time`, `end_time`) unchanged: the indexer reads it and halts on an undecodable event from the game contract's address. The package emits **no** event from that address, or only behind a switch that is off by default.

**Cairo and Scarb.** Scarb 2.20.1, snforge 0.64.0, `starknet` 2.20.x, edition `2023_11` (as `contracts/Scarb.toml`). `snforge_std` and `snforge_scarb_plugin` only in `[dev-dependencies]`.

**Dependency rule.** Published version on scarbs.xyz only, pinned exactly in `contracts/Scarb.toml` (`=x.y.z`), never a git or path dependency (O-1). O-1 names `quiver_quest` and `quiver_achievement`; the same rule is asked for this package (for the Overseer to confirm). A breaking release is announced by Grim World to the Overseer, who tells Paved.

**Licence.** Apache-2.0 compatible (Paved is Apache-2.0), declared in the package manifest; the licence of cartridge-gg/arcade, from which it is ported, named in the package with the headers of the ported code.

**What Paved will run to accept it** (so the package can run the same): a table test of the rule above (ties, shift, score 0, one player on three ranks, ids 0 and `213503982334600`), a property test against a reference model of `Tournament::score`, and the gas deltas above.
