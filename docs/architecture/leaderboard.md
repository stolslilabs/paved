# Leaderboard behind an interface (P6, design)

Design of the on-chain leaderboard of the Daily tournaments as an interface that the game flow calls, so that the
current implementation can be replaced by a published package without a change to the game flow, the public views
or the events. Documents only: no code exists for it yet; a later code PR implements part 1.

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
| `contracts/src/leaderboard.cairo` (new), `lib.cairo` | The trait, the three types, and the native implementation: the logic of `Tournament::score`, storage in the node of `Store` (four slots: three player ids, one word of three scores) |
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

### Expected effect on gas (estimates)

From the unit costs of `docs/measures/baseline.md` (a storage read about 0.1M L2 gas, a write about 0.13M): `spawn`
and `sponsor` read and write the tournament and would handle two slots instead of five, about 0.7M less each
(estimate); a closing move keeps the same reads and writes of the ranking (four slots instead of five, the claim
flags no longer rewritten with the scores). These are estimates until the stage A measure.

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
- **The tournament update has no measure today**; the figures in part 2 are estimates from unit costs until the
  stage A measure replaces them.

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

- *Gas, today*: the tournament update in a closing move has not been measured on its own (`docs/measures/baseline.md` gives `Daily.build` totals only). What baseline.md measures is a storage read at about 0.1M L2 gas and a write at about 0.13M (P5-6, `cairo-profiler`, key hashing included). The update is one read of the five slots of the tournament, the comparison, and (when the score ranks) one write of the five slots: about 0.5M without a rank and about 1.15M with one. **These two figures are estimates from the unit costs, not measures**; the code PR of the interface measures the real delta first and replaces them.
- *Ceiling the package must meet*: `submit` costs at most 1.3M L2 gas when it places (worst case: rank 1, two ranks shifted) and at most 0.6M when it does not, `top` at most 0.6M, `ranked` at most 0.3M; none of them depends on the number of submissions already made (no loop over submissions). Paved fixes the final ceilings as measured + 5 %, like the other ceilings of `contracts/tests/gas.cairo`, and the swap is refused when a closing move that places costs more than before the swap.
- *Storage per tournament*: today 5 slots (`Slots5`: the prize, 3 player ids, and one word with 3 scores and 3 claim bits). The package side is 4 of them (3 player ids, one word of scores). Ceiling: 4 slots if the package stores only player and score, 6 if it also stores game id and time (packed: one slot per rank for score, game id and time, one for the player id). A submit writes only the slots that changed.
- *Events*: `GameOver` stays Paved's, with its keys (`game_id`, `player_id`, `tournament_id`) and data (`mode`, `score`, `start_time`, `end_time`) unchanged: the indexer reads it and halts on an undecodable event from the game contract's address. The package emits **no** event from that address, or only behind a switch that is off by default.

**Cairo and Scarb.** Scarb 2.20.1, snforge 0.64.0, `starknet` 2.20.x, edition `2023_11` (as `contracts/Scarb.toml`). `snforge_std` and `snforge_scarb_plugin` only in `[dev-dependencies]`.

**Dependency rule.** Published version on scarbs.xyz only, pinned exactly in `contracts/Scarb.toml` (`=x.y.z`), never a git or path dependency (O-1). O-1 names `quiver_quest` and `quiver_achievement`; the same rule is asked for this package (for the Overseer to confirm). A breaking release is announced by Grim World to the Overseer, who tells Paved.

**Licence.** Apache-2.0 compatible (Paved is Apache-2.0), declared in the package manifest; the licence of cartridge-gg/arcade, from which it is ported, named in the package with the headers of the ported code.

**What Paved will run to accept it** (so the package can run the same): a table test of the rule above (ties, shift, score 0, one player on three ranks, ids 0 and `213503982334600`), a property test against a reference model of `Tournament::score`, and the gas deltas above.
