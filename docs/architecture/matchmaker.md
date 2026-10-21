# The matchmaker: crowns and shields (#639, design)

Track CORE's design for #639, part of the PvP plan #637; #643 (the attacks) and #644 (leagues and seasons) build on it.
The owner's decisions of 2026-10-20 bind:

- port the owner's POC, [bal7hazar/matchmaker](https://github.com/bal7hazar/matchmaker) at `8639f232` (Dojo, 2024), to
  pure Cairo, with no Dojo;
- crowns as in Clash of Clans instead of ELO: the rating is the crown count;
- an attacked village gets an 8-hour shield, and attacking before it ends drops it.

Everything else is a proposal. The open points of section 8 were posted for the owner on #639 (2026-10-20); the code
builds on the proposals until the owner answers there, and follows the answers when they come.

## 1. Summary

- **A pure library and its own system.** `paved::matchmaker` holds the rules (crowns, buckets, the pool, the shield
  queues) over a small storage trait, so the rules are unit- and fuzz-tested without a contract. A new upgradable
  system, `Matchmaker`, implements that trait on its storage, draws opponents from Cartridge's VRF (#638's
  `DrawableComponent`), and exposes the calls of the player, of the systems that will drive it (#640 creates villages,
  #643 runs attacks) and of the owner.
- **The pool is asynchronous.** A village joins once, when it is created, and stays. Its bucket moves with its crowns.
  It leaves the pool only while shielded.
- **Buckets of 100 crowns, up to 251**, with a one-felt bitmap of the non-empty ones. The search takes the nearest
  non-empty bucket (`Bitmap::nearest_significant_bit`, kept from the POC), so someone is always found.
- **Shields are two FIFO queues**, one per duration (8 hours after an attack, 3 days for a new player). Each queue is
  in arrival order, so it is also in expiry order. Every attack start puts back at most 2 expired villages, with no
  keeper.
- **The draw comes from the VRF**, never from `transaction_hash`. "Next" draws again for Cobbles.
- **Crowns move only at the attack's settlement**, from the offer fixed at the draw.

## 2. The source and its licence

- Ported from `bal7hazar/matchmaker` at `8639f232091381ac58264024ab9d9476056171c6` (2024-04-20), `contracts/src`:
  `models/{registry,league,slot,player}.cairo`, `store.cairo` (`remove_player_slot`), `systems/maker.cairo`.
- The POC's contracts carry no licence file. Its `app/` carries Dojo's MIT template. The POC is the owner's own work,
  ported here by the owner's decision; the PR says so.
- `helpers/bitmap.cairo` is not ported again: Paved already has the same helper (`paved::helpers::bitmap`), with a
  `priority` argument on `nearest_significant_bit` that the POC lacks.

| POC | Here | Why |
|---|---|---|
| `Registry.leagues` (bitmap felt), rewritten at every call | `registry` (one felt) | Written only when a bit flips |
| `League { size }` per league | `bucket_sizes: Map<u8, u32>` | Same |
| `Slot { player_id }` per `(league, index)` | `slots: Map<(u8, u32), ContractAddress>` | Same |
| `Player { name, league_id, index, rating }`, four fields | `villages: Map<ContractAddress, felt252>`, one packed slot | Gas: one read, one write |
| `remove_player_slot`: swap with the last, nullify | Same | O(1) removal |
| `fight` removes both players, re-subscribes them | Join once; only the bucket moves | Asynchronous attacks |
| `seed = transaction_hash` | Cartridge's VRF (`Salt`) | A resent transaction rerolled the opponent |
| ELO (`origami`, K = 20), `seed % 3` outcome | Crowns, settled from the attack's stars (#643) | Owner decision |
| 17 leagues of 20 points from 1,000 | Up to 251 buckets of 100 crowns from 0 | Crowns start at 0 |
| `create`, `subscribe`, `unsubscribe` | `join` only (no leaving) | A village always exists |

## 3. Storage

New contract, new names only (`docs/architecture/upgrades.md`, "Storage layout discipline"). Components flat:
`ownable`, `upgradeable`, `drawable`.

| Variable | Type | Role |
|---|---|---|
| `registry` | `felt252` | Bit `b` set iff bucket `b` is non-empty (bits 0 to 250) |
| `bucket_sizes` | `Map<u8, u32>` | The number of villages in bucket `b` |
| `slots` | `Map<(u8, u32), ContractAddress>` | The village at index `i` of bucket `b`, for `i < size` |
| `villages` | `Map<ContractAddress, Village>` | One packed slot per village (below; `StorePacking` into a felt) |
| `queues` | `Map<u8, Queue>` | Shield queue `q`: `head` [0, 64), `tail` [64, 128) |
| `queue_entries` | `Map<(u8, u64), ContractAddress>` | Queue `q`'s entry at sequence `n`, for `head <= n < tail` |
| `match_opponents` | `Map<ContractAddress, ContractAddress>` | The attacker's drawn opponent (zero: none) |
| `match_states` | `Map<ContractAddress, u16>` | Its offer [0, 8) and whether the attack started [8] |
| `operators` | `Map<ContractAddress, bool>` | The systems allowed to create villages and run attacks |
| `setup` | `ContractAddress` | `Setup`, where "Next" spends Cobbles |

**The village slot**, one felt (as built: no field crosses the two 128-bit halves):

| Bits | Field |
|---|---|
| 0..32 | `crowns` (u32) |
| 32..40 | `bucket` (u8): meaningful in the pool |
| 40..72 | `index` (u32): the slot in the bucket, in the pool |
| 72..80 | `status` (u8): 0 none, 1 in the pool, 2 shielded |
| 80..88 | `queue` (u8): the shield queue, when shielded |
| 88..120 | `draws` (u32): the VRF draw counter of this attacker |
| 120 | `npc` (bool) |
| 128..192 | `seq` (u64): the entry's sequence in that queue |
| 192..248 | `shield_until`: the shield's end, a block timestamp below 2^56 |

Bits 121..128 and 248..251 are free. A zero slot is a village that never joined.

**The match**: the opponent's address does not fit beside other fields, so it takes two maps, `match_opponents`
(the opponent, zero for none) and `match_states` (`offer` [0, 8), `started` [8]).

## 4. The pool

**Invariants** (fuzzed, section 7):

1. Every village that joined is either in exactly one bucket slot (status 1) or in exactly one live entry of one shield
   queue (status 2).
2. `slots[(b, i)]` is a village whose slot says bucket `b`, index `i`, for every `i < bucket_sizes[b]`.
3. Bit `b` of `registry` is set iff `bucket_sizes[b] > 0`.
4. A pool village's bucket is `bucket_of(crowns)`.

**Bucket of a crown count**: `min(crowns / 100, 250)`. 251 buckets fit a felt's 251 bits. The top bucket holds every
count from 25,000.

**Insert**: append at `size`, write the slot, bump the size; set the bit if the size was 0.

**Remove** (the POC's `remove_player_slot`): move the last slot into the removed index, update the moved village's
index, shrink the size; clear the bit if the size reaches 0. The emptied slot is not cleared (it is past `size`, never
read): one write saved.

**Move** (crowns changed): if the bucket of the new count differs, remove, then insert. Otherwise only the crowns are
written.

**The registry** is read once per call and written only when a bit flips (POC: rewritten at every call).

## 5. The draw

`search()` and `next()`, called by the player:

1. The attacker must have joined (any status) and must not be in a started attack.
2. The random is `DrawableComponent::draw_random('MATCH', attacker, draws)`, then `draws` is incremented. The client
   puts `request_random(Matchmaker, Salt(vrfSalt('MATCH', attacker, draws)))` first in the multicall. A reverted and
   resent transaction draws the same opponent.
3. **No self-match**, without removing the attacker. If the attacker is in the pool and alone in its bucket, its bit is
   masked out of the search. If it shares its bucket, the slot is drawn among `size - 1` and an index at or past the
   attacker's own is shifted by one.
4. The bucket is the nearest non-empty one to the attacker's (`nearest_significant_bit`); a tie between below and above
   is broken by one bit of the random. The slot is the random modulo the bucket's size. An empty pool (no one else)
   fails: `'Matchmaker: no opponent'`.
5. The offer is computed now, from the crown gap, and stored with the opponent (section 6). The event carries both.

`search()` is free when the attacker has no drawn opponent, or when that opponent is no longer in the pool (shielded by
someone else's attack). Otherwise it fails and the player calls `next()`, which first spends `NEXT_PRICE` Cobbles
through `Setup.spend_cobbles` (a new call, gated by an allowlist of spenders that the owner sets).

A drawn opponent stays in the pool until the attack starts: two attackers may draw the same village; the first to
start shields it, and the second's start fails (`'Matchmaker: opponent shielded'`), after which its `search()` is free.

## 6. Crowns

| Constant | Proposed | Role |
|---|---|---|
| `OFFER_BASE` | 25 | The offer at an even gap |
| `OFFER_DIVISOR` | 20 | One crown of offer per 20 crowns of gap |
| `OFFER_MIN`, `OFFER_MAX` | 10, 40 | The offer's bounds |
| `LOSS_DIVISOR`, `LOSS_MIN`, `LOSS_MAX` | 4, 2, 10 | The 0-star cost: `offer / 4`, bounded 2 to 10 |
| `NEXT_PRICE` | 1 Cobble | Each re-draw |
| `ATTACK_SHIELD` | 8 hours | Owner decision |
| `INITIAL_SHIELD` | 3 days | As in Clash of Clans |
| `BUCKET_WIDTH`, `BUCKET_COUNT` | 100, 251 | |
| `RELEASES_PER_ATTACK` | 2 | Expired shields put back at each attack start |

- **Offer** `= clamp(25 + (defender - attacker) / 20, 10, 40)`: a stronger defender is worth more.
- **Win** (1 to 3 stars): the attacker gains `offer × stars / 3`, taken from the defender, at most the defender's
  crowns. Crowns are conserved between players.
- **Loss** (0 stars): the attacker loses `clamp(offer / 4, 2, 10)`, at most its crowns, given to the defender.
- **Crowns are never negative**; a new village starts at 0.
- **The season reset** (crowns above a threshold brought down) is #644's: the library exposes `set_crowns` for it.

## 7. Shields

- **Two queues**: 0 for the 8-hour attack shield, 1 for the 3-day initial shield. In each, entries arrive in time order
  with one duration, so the head expires first.
- **Shielding** a village removes it from its bucket and appends it to a queue with `shield_until = now + duration`.
- **Attack start** (`start_attack`, by an operator, #643):
  1. puts back at most `RELEASES_PER_ATTACK` expired villages, from the queue whose head expires first;
  2. if the attacker is shielded, drops its shield: it goes back to the pool at once, and its queue entry turns stale;
  3. checks the drawn opponent is still in the pool, then shields it (queue 0), unless it is an NPC;
  4. marks the match started, freezing the offer.
- **Stale entries**: a dropped shield leaves its entry in the queue (no removal from the middle). The village's slot
  says which queue and sequence are live, so a popped entry whose village has moved on is discarded. Discarding costs no
  release budget but is bounded per call (`2 × RELEASES_PER_ATTACK` pops at most).
- **`release_shields(max)`** is also public, for anyone (at most 16 per call): the queues drain with no keeper, but a
  backlog can be cleared.
- **Settlement** (`settle(attacker, stars)`, by an operator, #643) moves the crowns. A shielded defender keeps its queue
  place; only its crowns change, and its bucket is computed when it comes back.

## 8. Open points (posted on #639 for the owner)

1. **Crown constants**: the offer `25 + gap / 20` bounded 10 to 40; the 0-star cost `offer / 4` bounded 2 to 10, given
   to the defender.
2. **"Next" price**: 1 Cobble per re-draw. It needs a new `Setup.spend_cobbles(player_id, amount)` for allowlisted
   spenders: Cobbles are spent only in `Setup` today.
3. **Shields**: 8 hours from the attack's start; a 3-day initial shield for new players, in a second queue.
4. **NPC villages for the cold start**: the Story levels, placed by the owner at 0 to 290 crowns (buckets 0 to 2). An NPC
   stays in the pool, is never shielded, and its crowns never change: a win against one mints the attacker's crowns, a
   loss burns the attacker's cost. The NPC's address is its id (1, 2, …): no account can be deployed at such an address.
   The owner removes them when the pool is large enough. #643 maps an NPC id to its Story level.
5. **Shape**: its own system (proposed), not a component of #643's attack system. The attack system (an operator) calls
   it; the size of #643's system stays its own.

## 9. Size, cost and the client

- **CASM** of `Matchmaker` against the cap (P-44, `scripts/class-sizes.sh`): a new class, so no other system grows,
  except `Setup` by `spend_cobbles` and its allowlist.
- **Gas** in `contracts/tests/gas.cairo`: `join`, `search`, `next`, `start_attack` (with releases), `settle`.
- **Events**: `VillageJoined`, `OpponentDrawn`, `AttackStarted`, `ShieldRaised`, `ShieldDropped`, `ShieldReleased`,
  `CrownsSettled`, `OperatorSet`, `NpcSet`.
- **Client**: the `@paved/chain` views and writes and the indexer's tables (`pvp_villages`, `pvp_matches`,
  `pvp_shields`) go in this PR when they fit, or in the follow-up that the PR names.

## 10. As built

Code:

- `contracts/src/matchmaker/{crowns,village,pool}.cairo`: the library. `pool.cairo` holds the `PoolStore` trait and
  `Pool`, its rules: `insert`, `remove`, `move_crowns`, `shield`, `release`, `draw`, and the calls `join`, `set_npc`,
  `remove_npc`, `set_crowns`, `start`, `settle`.
- `contracts/src/systems/matchmaker.cairo`: `Matchmaker`, which implements `PoolStore` on its storage, with the
  interfaces `IMatchmaker` (player, operators, anyone, views) and `IMatchmakerAdmin` (owner).
- `contracts/src/systems/setup.cairo`: `ISetupSpend` (`set_spender`, `is_spender`, `spend_cobbles`), the storage member
  `spenders` (appended), and the events `SpenderSet` and `CobblesSpent`.
- Tests:
  - `contracts/src/tests/matchmaker.cairo` is the library over a memory store: unit tests, fuzz tests of the offer, the
    settlement's conservation, the packings, the draw's no-self-match, and random sequences of calls that check the pool's
    invariants after every call (section 4).
  - `contracts/src/tests/matchmaker_system.cairo` is the system over the VRF mock and a real `Setup`: callers, draws,
    "Next", attacks, shields, NPCs, and the storage pinned by name (`spenders` of `Setup` included).
  - Coverage group `tests-matchmaker`. Gas: z16 to z21 in `contracts/tests/gas.cairo`.
- `@paved/indexer`: `CobblesSpent` enters the running cobble ledger (table `cobble_spends`, schema 17). Without it the
  first "Next" would halt the indexer, whose ledger checks every balance. `SpenderSet` is ignored by name.

Departures from the sections above:

- The village slot's layout (section 3) keeps every field inside one 128-bit half.
- `join` refuses the zero address: a zero opponent means "none" in a match.

**CASM** (release, `scripts/class-sizes.sh`, VPS, 2026-10-21, under `prlimit --as=12884901888`):

| Class | Sierra | CASM | Of the cap |
|---|---:|---:|---:|
| `Matchmaker` (new) | 9,616 | 24,473 | 29.9 % |
| `Setup`, merge base `b6b4ee1a` | 18,024 | 39,861 | 48.7 % |
| `Setup`, this branch | 18,563 | 41,179 | 50.3 % (+1,318) |

No other class changes.

**Gas** (L2 gas of the call alone, test profile, snforge 0.64.0, VPS; ceilings at measured + 5 %):

| Test | Call | L2 gas |
|---|---|---:|
| z16 | `join` (a village behind its initial shield) | 862,337 |
| z17 | `search`, free (the VRF draw, the nearest bucket, the offer) | 2,381,575 |
| z18 | `next` (one Cobble spent in `Setup`, then a draw) | 2,927,813 |
| z19 | `start_attack`, the worst case: 2 shields released, the attacker's dropped, the defender's raised | 3,900,612 |
| z20 | `settle` (3 stars, both villages written) | 975,721 |
| z21 | `release_shields(2)` | 1,765,814 |

The draw costs about 1.4M above the VRF draw alone (z15, 986,461): the bitmap search computes powers of two through
`Math::pow` (`paved::helpers::bitmap`, kept as it is). A table of the 251 powers would cut that if #643's attack budget
needs it.

**Local runs.** The full `contracts/` test build peaks above the VPS's 8 GB Cairo scope (`vrf-draws.md`, section 8). So
the matchmaker's modules and the gas tests ran locally in a scratch copy of the crate that keeps every source but only the
test modules named: 73 tests of `paved::tests::matchmaker*` pass (peak RSS 4.5 GB), and the 21 `test_gas_z*` pass (peak RSS
4.5 GB, z15 equal to its committed figure). CI runs the whole suite.

**Audit, value and access** (Cobbles and crowns move):

- **Cobbles.**
  - `spend_cobbles` only lowers a balance. Only a spender the owner allows may call it, and it refuses 0 and a short
    balance. It trusts the spender for whom, as `credit_story` trusts the reporter.
  - The matchmaker spends only for the caller of `next`, before the draw, in the same transaction: a draw that fails
    reverts the spend.
- **Crowns.**
  - They move only through operators: `settle` (an attack started, 0 to 3 stars, at the offer fixed at the draw) and
    `set_crowns` (#644). Both are trusted, like `Setup`'s reporters.
  - Between players, crowns are conserved and never negative (fuzzed). Against an NPC, a win mints the attacker's gain:
    a cold-start trade-off, bounded by the owner removing the NPCs (open point 4).
  - A high player draws an NPC only if no player sits in a nearer bucket.
- **The draw.**
  - The salt is fixed by the attacker and its draw counter, which only a landed draw advances. A reverted or resent
    transaction draws the same opponent; a free re-draw needs the drawn opponent to have left the pool.
  - The attacker never draws itself (fuzzed). A drawn opponent shielded in the meantime fails the start, and then the
    search is free.
- **Liveness.**
  - Every attack start puts back at most 2 expired shields, and pops at most 4 entries in all, stale ones included. One
    attack adds at most one live entry and one stale one, so the queues drain with no keeper. `release_shields` (anyone, at
    most 16) clears a backlog.
- **Owner.** It sets the operators, `Setup`, the VRF provider and the NPCs, and upgrades. No owner call moves a player's
  crowns or Cobbles.

**Follow-ups this PR names** (the client side, allowed by #639's constraints):

- The deployment of `Matchmaker` (`scripts/deploy.sh`, the deployment files): the operators, `Setup.set_spender` and the
  NPC villages, in the fresh path.
- `@paved/chain`: the views (`village`, `current_match`, `offer`, the queues) and the writes `search` and `next`, each
  behind `withVrfRequest` with `vrfSalt('MATCH', attacker, draws)`.
- `@paved/indexer`: the matchmaker's events and their tables (`pvp_villages`, `pvp_matches`, `pvp_shields`), once
  `Matchmaker` is in a deployment file.
