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

A closing move that ranks costs 14.3 % less (1,440,588 to 1,234,989), one that does not rank 37.7 % less (to 897,489): the ranking is four slots instead of five, a submission that cannot rank reads one slot and writes nothing, and one that ranks writes only the slots that change. `spawn` and `sponsor` handle the two-slot prize record instead of five. The `tournament` view costs 17 % more. Figures and method: `docs/measures/baseline.md`. The first version of this document estimated the update at 0.5M without a rank and 1.15M with one, from unit costs; the measure gives 0.71M for main whatever happened.

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
- *Storage per tournament*: today 5 slots (`Slots5`: the prize, 3 player ids, and one word with 3 scores and 3 claim bits). The package side is 4 of them (3 player ids, one word of scores). Ceiling: 4 slots if the package stores only player and score, 6 if it also stores game id and time (packed: one slot per rank for score, game id and time, one for the player id). A submit writes only the slots that changed.
- *Events*: `GameOver` stays Paved's, with its keys (`game_id`, `player_id`, `tournament_id`) and data (`mode`, `score`, `start_time`, `end_time`) unchanged: the indexer reads it and halts on an undecodable event from the game contract's address. The package emits **no** event from that address, or only behind a switch that is off by default.

**Cairo and Scarb.** Scarb 2.20.1, snforge 0.64.0, `starknet` 2.20.x, edition `2023_11` (as `contracts/Scarb.toml`). `snforge_std` and `snforge_scarb_plugin` only in `[dev-dependencies]`.

**Dependency rule.** Published version on scarbs.xyz only, pinned exactly in `contracts/Scarb.toml` (`=x.y.z`), never a git or path dependency (O-1). O-1 names `quiver_quest` and `quiver_achievement`; the same rule is asked for this package (for the Overseer to confirm). A breaking release is announced by Grim World to the Overseer, who tells Paved.

**Licence.** Apache-2.0 compatible (Paved is Apache-2.0), declared in the package manifest; the licence of cartridge-gg/arcade, from which it is ported, named in the package with the headers of the ported code.

**What Paved will run to accept it** (so the package can run the same): a table test of the rule above (ties, shift, score 0, one player on three ranks, ids 0 and `213503982334600`), a property test against a reference model of `Tournament::score`, and the gas deltas above.
