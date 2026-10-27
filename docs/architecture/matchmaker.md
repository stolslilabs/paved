# The matchmaker: crowns and shields (#639, design)

Track CORE's design for #639, part of the PvP plan #637; #643 (the attacks) and #644 (leagues and seasons) build on it.
The owner's decisions of 2026-10-20 bind:

- port the owner's POC, [bal7hazar/matchmaker](https://github.com/bal7hazar/matchmaker) at `8639f232` (Dojo, 2024), to
  pure Cairo, with no Dojo;
- crowns as in Clash of Clans instead of ELO: the rating is the crown count;
- an attacked village gets an 8-hour shield, and attacking before it ends drops it.

The open points of section 8 were posted for the owner on #639 (2026-10-20) and decided on 2026-10-21 (the owner's
comment on #639): the crown constants reverse-engineered from Clash of Clans (section 6), "Next" at 1 Cobble, the
shields and the NPC villages as proposed, and the matchmaker as composable components with small scopes (section 11).

## 1. Summary

- **Composable pieces** (since MATCHMAKER-CROWNS, section 11): three components with their own storage and events,
  crowns, buckets and shields, embedded by `Matchmaker`; the paragraph below is the first shape (#663).
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

As built in #663. Since MATCHMAKER-CROWNS the storage is split by component (section 11.2); the rules below hold for the
pieces.

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

## 6. Crowns (reverse-engineered from Clash of Clans, owner decision of 2026-10-21)

The owner's decision 1 on #639: the constants are not invented; they reproduce what Clash of Clans (CoC) does with
trophies, scaled to crowns. A crown is a trophy: both start at 0, never go negative and are the only rating, so the scale
is 1 to 1 and the curves below are CoC's own, gap for gap.

### 6.1 Sources

| # | Source | What it gives |
|---|---|---|
| S1 | Clash of Clans Wiki, "Trophies", revision 607892 (2024-11-15), the last before the 2025 changes (read through the wiki's `api.php`, `action=parse&oldid=607892`) | Even trophies: 30 to win, 20 lost on a failed attack. Defender about 600 higher: 58 to win, 1 lost. At most 59 won (from a gap of about 750) and 39 lost. Minimum offer 1 at low trophies since the December 2015 update (6 in Legend League), so a 1-star on a 1-trophy offer still wins 1. Below 1,000 trophies losses are smaller than gains (trophy inflation) |
| S2 | Clash of Clans Wiki, "Multiplayer Battles", revision 609038 (2024-12-03) | "For each star that you earn, you receive one-third of the available Trophies"; 0 stars is a loss |
| S3 | Supercell forum, "TROPHY OFFERS: Formulas discovered!!" (thread 342724, `forum.supercell.com/showthread.php/342724`), a fit to several hundred observed offers, "never off by more than 1 trophy". The forum is offline now; the equations are quoted from a search engine's copy of the thread | Win `Y = -0.63599 + 60.07066 / (1 + 0.991798 e^(0.00576 x))`; loss `Y = 39.0907 - 39.0619 / (1 + 0.993 e^(0.0059 x))`, `x` the attacker's trophies minus the defender's; offers from 0 to 59 |
| S4 | Supercell, "Welcome to the Clash Anytime update" release notes (2025-03-24) and the wiki's current "Trophies" page | A flatter curve from March 2025: at most 44 won; even trophies 22 to win and 7 lost; at most 14 lost on a failed attack; a 2-star worth 1/3 |
| S5 | Supercell support, "Ranked Battles & Trophy Calculation", and the wiki's "Ranked Battles" (October 2025) | Since October 2025, no gap at all: up to 40 per attack by stars and destruction; the defender gets the rest |

**Which curve.** The owner asked for the offer and the loss by trophy gap, so S5 (no gap) is out. S1, S2 and S3 describe
the curve CoC ran from 2013 to March 2025. S4 is the same shape with smaller constants, a 2025 change made because the
update removed training times and attacks became more frequent; it is another era, not a disagreement. Paved takes the
2013 to 2025 curve, whose star split (1/3 per star, S2) is the one the matchmaker
already used. The 2025 constants (44 and 14) are the alternative if the owner wants fewer crowns per attack.

**Where the sources disagree: the 0-star cost at an even gap.** The sources do not agree on this number, and the curve
here follows a choice between two readings:

- **S3's loss fit gives 19** at an even gap (19.49, rounded), and S3 itself admits an error of one trophy.
- **S1 (wiki revision 607892) states 20**: equal trophies, a failed attack loses 20.

The offer agrees with S1 at every anchor (30 even, 58 at +600, 59 from about +750), and the cost agrees elsewhere (1 at
+600, 39 at most). Two integer curves fit the sources, and they differ by one crown on 264 of the 2,001 gaps from -1,000
to +1,000:

- **A, S3's fit as written**: 19 at an even gap, one crown off S1 there.
- **B, the Elo form both fits approximate**, `round(39 x E)`: every number S1 states is exact (20 even, 1 at +600, 39 at
  most); one crown off S3's fit on those 264 gaps (for example 35 instead of 36 at -400, 12 instead of 11 at +150, 1
  instead of 0 at +750).

**The choice is B** (the Overseer's provisional ruling of 2026-10-22, on the owner's question; the owner rules on the PR).
Why: S1 states its numbers outright, while S3 is a model of observations that admits a one-trophy error, so where the two
disagree the stated number wins; and B is the Elo shape both fits approximate (below), so it departs from S3 only by
rounding. A is one constant away: the cost's breakpoints in `contracts/src/matchmaker/crowns.cairo` (`COST_STEPS`, A's
list kept below), the pinned rows of `paved::tests::matchmaker`, and this note's table.

**The shape.** Both fits are Elo's logistic with Elo's 400-point scale: `0.00576` is `ln 10 / 400` (0.005756), and
`0.0059` is within the source's truncation of it. So the offer is about `60 x (1 - E)` and the 0-star cost about
`39 x E`, where `E = 1 / (1 + 10^((defender - attacker) / 400))` is the attacker's expected score. A stronger defender
offers more and costs less to fail.

### 6.2 The formulas

With `gap = defender's crowns - attacker's crowns`, both fixed at the draw:

- **Offer** (3 stars) `= clamp(round(-0.63599 + 60.07066 / (1 + 0.991798 e^(-0.00576 gap))), 1, 59)`: S3's win fit,
  bounded by S1 (59 at most; 1 at least, the low leagues' minimum: leagues are #644's, so the floor is the lowest league's).
- **Stars**: 1, 2 or 3 stars win `ceil(offer x stars / 3)` (S2: a third per star; rounded up, as S1's 1-star on a 1-trophy
  offer wins 1).
- **0-star cost** `= clamp(round(39 x E), 0, 39)`, `E = 1 / (1 + 10^(gap / 400))`: choice B of 6.1, Elo's form of S3's loss
  fit, exact on S1's anchors (20 at an even gap; 39 at most; 0 from a gap of +755).
- **Who pays**: a win's crowns come from the defender, a 0-star cost goes to the defender (S1).
- `round` is half up. Both curves are monotone in steps of exactly one crown, so the contract holds them as two tables of
  breakpoints (58 for the offer, 39 for the cost), each the first gap of a new value, with no floating point: the offer is
  1 plus the number of offer breakpoints at or below the gap, the cost 39 minus the number of cost breakpoints at or below
  it. The tests pin every row of 6.3 and every breakpoint.

**Not reproduced: CoC's inflation below 1,000 trophies** (S1: losses smaller than gains there, and a player at 0 losing
nothing while the attacker still wins). Paved keeps crowns conserved between players: a win takes at most what the
defender has, a cost at most what the attacker has (so a village at 0 loses nothing, as in CoC). Crowns enter only through
the NPC villages of the cold start (section 8, point 4). This is a property of the settlement, not of the curves.

Offer breakpoints (gap at which the offer becomes 2, 3, ..., 59):
-574, -504, -453, -412, -378, -349, -323, -299, -278, -258, -239, -222, -206, -190, -175, -160, -146, -133, -120, -107,
-94, -82, -70, -58, -46, -35, -23, -11, 0, 12, 23, 35, 47, 59, 71, 83, 95, 108, 121, 134, 147, 161, 176, 191, 207, 224,
241, 260, 280, 302, 326, 353, 383, 418, 461, 514, 590, 719.

Cost breakpoints, choice B (gap at which the cost becomes 38, 37, ..., 0):
-754, -559, -465, -402, -353, -313, -279, -249, -221, -196, -173, -151, -130, -110, -91, -72, -53, -35, -17, 1, 18, 36,
54, 73, 92, 111, 131, 152, 174, 197, 222, 250, 280, 314, 354, 403, 466, 560, 755.

Cost breakpoints of A, S3's fit (kept for the owner's ruling):
-709, -536, -449, -389, -342, -304, -271, -242, -215, -191, -168, -147, -127, -107, -88, -70, -52, -34, -17, 0, 18, 35,
53, 71, 89, 108, 128, 148, 170, 192, 217, 244, 273, 307, 346, 394, 456, 549, 746.

### 6.3 The table by crown gap

| Gap (defender - attacker) | Offer (3 stars) | 2 stars | 1 star | 0-star cost |
|---:|---:|---:|---:|---:|
| -1,000 or less | 1 | 1 | 1 | 39 |
| -750 | 1 | 1 | 1 | 38 |
| -600 | 1 | 1 | 1 | 38 |
| -500 | 3 | 2 | 1 | 37 |
| -400 | 5 | 4 | 2 | 35 |
| -300 | 8 | 6 | 3 | 33 |
| -200 | 14 | 10 | 5 | 30 |
| -150 | 17 | 12 | 6 | 27 |
| -100 | 21 | 14 | 7 | 25 |
| -50 | 25 | 17 | 9 | 22 |
| 0 | 30 | 20 | 10 | 20 |
| +50 | 34 | 23 | 12 | 17 |
| +100 | 38 | 26 | 13 | 14 |
| +150 | 42 | 28 | 14 | 12 |
| +200 | 45 | 30 | 15 | 9 |
| +300 | 50 | 34 | 17 | 6 |
| +400 | 54 | 36 | 18 | 4 |
| +500 | 56 | 38 | 19 | 2 |
| +600 | 58 | 39 | 20 | 1 |
| +750 | 59 | 40 | 20 | 1 |
| +1,000 or more | 59 | 40 | 20 | 0 |

Against S1's anchors: even gap 30 / 20 (S1: 30 / 20), +600 58 / 1 (S1: 58 / 1), 59 from +719 (S1: "750 or more", a round
figure), 39 at most (S1). The cost column is choice B (6.1); A, S3's fit, differs by one crown at -750 (39), -400 (36),
-150 (28), 0 (19), +150 (11), +400 (3) and +750 (0).

### 6.4 The settlement

- **Win** (1 to 3 stars): the attacker gains `ceil(offer x stars / 3)`, taken from the defender, at most the defender's
  crowns.
- **Loss** (0 stars): the attacker loses the cost fixed at the draw, at most its crowns, given to the defender.
- **Crowns are never negative and never overflow**: every amount is also at most what the receiver can still hold under
  `u32`'s bound. A new village starts at 0.
- **The season reset** (crowns above a threshold brought down) is #644's: built inside `Matchmaker` by the leagues'
  components, the village rolled into the new season before its crowns move (`docs/architecture/leagues.md`). Since
  then a village is listed at most at 5,000 crowns, so every Sovereign village shares bucket 50 and a reset never leaves
  a village in a stale bucket (`leagues.md`, section 5, "The pool at Sovereign").

| Constant | Value | Role |
|---|---|---|
| `OFFER_MIN`, `OFFER_MAX` | 1, 59 | The offer's bounds (S1) |
| `COST_MAX` | 39 | The 0-star cost's bound (S1); its floor is 0 (S3) |
| `NEXT_PRICE` | 1 Cobble | Each re-draw (owner decision 2) |
| `ATTACK_SHIELD` | 8 hours | Owner decisions of 2026-10-20 and 3 |
| `INITIAL_SHIELD` | 3 days | Owner decision 3 (as in CoC) |
| `BUCKET_WIDTH`, `BUCKET_COUNT` | 100, 251 | |
| `RELEASES_PER_ATTACK` | 2 | Expired shields put back at each attack start |

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

## 8. Open points (posted on #639 for the owner, decided on 2026-10-21)

1. **Crown constants**: decided on 2026-10-21: reverse-engineered from Clash of Clans (section 6).
2. **"Next" price**: decided: 1 Cobble per re-draw (it caps the attacks per day unless the player pays). It needs a new `Setup.spend_cobbles(player_id, amount)` for allowlisted
   spenders: Cobbles are spent only in `Setup` today.
3. **Shields**: decided as proposed: 8 hours from the attack's start; a 3-day initial shield for new players, in a second queue.
4. **NPC villages for the cold start**: decided as proposed: the Story levels, placed by the owner at 0 to 290 crowns (buckets 0 to 2). An NPC
   stays in the pool, is never shielded, and its crowns never change: a win against one mints the attacker's crowns, a
   loss burns the attacker's cost. The NPC's address is its id (1, 2, …): no account can be deployed at such an address.
   The owner removes them when the pool is large enough. #643 maps an NPC id to its Story level.
5. **Shape**: decided otherwise: more components with smaller scopes (crowns, shields, buckets), embedded by the
   systems that need them, rather than one large system (section 11).

## 9. Size, cost and the client

- **CASM** of `Matchmaker` against the cap (P-44, `scripts/class-sizes.sh`): a new class, so no other system grows,
  except `Setup` by `spend_cobbles` and its allowlist.
- **Gas** in `contracts/tests/gas.cairo`: `join`, `search`, `next`, `start_attack` (with releases), `settle`.
- **Events**: `VillageJoined`, `OpponentDrawn`, `AttackStarted`, `ShieldRaised`, `ShieldDropped`, `ShieldReleased`,
  `CrownsSettled`, `OperatorSet`, `NpcSet`.
- **Client**: the `@paved/chain` views and writes and the indexer's tables (`pvp_villages`, `pvp_matches`,
  `pvp_shields`) go in this PR when they fit, or in the follow-up that the PR names.

## 10. As built in #663

The first shape, a library over one storage trait. Section 11 replaces its code; its measures are kept as the base of
section 11's.

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
| z17 | `search`, free (the VRF draw, the nearest bucket, the offer) | 2,391,635 |
| z18 | `next` (one Cobble spent in `Setup`, then a draw) | 2,927,813 |
| z19 | `start_attack`, the worst case: 2 shields released, the attacker's dropped, the defender's raised | 3,900,612 |
| z20 | `settle`, player against player, the worst case: 3 stars, both villages in the pool, both change bucket | 2,683,181 |
| z21 | `release_shields(2)` | 1,765,814 |

The draw costs about 1.4M above the VRF draw alone (z15, 986,461): the bitmap search computes powers of two through
`Math::pow` (`paved::helpers::bitmap`, kept as it is). A table of the 251 powers would cut that if #643's attack budget
needs it.

**Local runs.** The full `contracts/` test build peaks above the VPS's 8 GB Cairo scope (`vrf-draws.md`, section 8). So
the matchmaker's modules and the gas tests ran locally in a scratch copy of the crate that keeps every source but only the
test modules named: 77 tests of `paved::tests::matchmaker*` pass (peak RSS 4.5 GB), and the 21 `test_gas_z*` pass (peak RSS
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
  - Between players, crowns are conserved and never negative at every `u32` count (fuzzed over the whole range and near
    the bound). Every amount is capped by what the receiver can still hold, so nothing saturates and the amount reported is
    the amount that moved. Against an NPC, a win mints the attacker's gain:
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

## 11. Composable pieces (MATCHMAKER-CROWNS, owner decisions of 2026-10-21)

Owner decision 5: more components with smaller scopes, each easier to maintain, embedded by the systems that need them,
rather than one large system. Owner decision 1: the crown curves of section 6.

### 11.1 The pieces

| Piece | File | Storage (flat, its own names) | Events | What it knows |
|---|---|---|---|---|
| `CrownableComponent` | `contracts/src/components/crownable.cairo` | `crown_counts` | `CrownsSettled`, `CrownsSet` | Crown counts; settles an attack through the pure `paved::matchmaker::crowns` |
| `BucketableComponent` | `contracts/src/components/bucketable.cairo` | `bucket_registry`, `bucket_sizes`, `bucket_slots`, `bucket_places` | `BucketEntered`, `BucketLeft` | Who is listed in which bucket; the draw of the nearest bucket |
| `ShieldableComponent` | `contracts/src/components/shieldable.cairo` | `shield_queues`, `shield_entries`, `shields` | `ShieldRaised`, `ShieldDropped`, `ShieldReleased` | Shields and their two queues; which expired |
| `Matchmaker` (the system) | `contracts/src/systems/matchmaker.cairo` | `villages`, `match_opponents`, `match_states`, `operators`, `setup` | `VillageJoined`, `NpcSet`, `NpcRemoved`, `OpponentDrawn`, `AttackStarted`, `OperatorSet`, `SetupSet` | Who joined (player or NPC) and its draws, the matches, the callers, "Next" |

- **No piece calls another.** The system composes them: a released shield is put back by `bucketable.insert` at
  `crownable.crowns_of`; a settlement's new counts are followed by `bucketable.follow`. So each piece is tested alone
  (`component_state_for_testing`, `paved::tests::matchmaker`) and the composition through the system
  (`paved::tests::matchmaker_system`, with the pool's invariants fuzzed over random sequences of calls).
- **Each piece exposes its own views**, embedded in `Matchmaker`'s ABI: `crowns(village)`; `registry()`,
  `bucket_size(bucket)`, `slot(bucket, index)`, `place(village)`; `shield(village)`, `queue(queue)`,
  `queue_entry(queue, seq)`.
- **`Setup.spend_cobbles` and its allowlist are unchanged.** "Next" still spends `NEXT_PRICE` (1 Cobble) there.
- **The shields and the NPC villages are unchanged** (owner decisions 3 and 4): 8 hours from the attack's start, 3 days
  for a new village, Story levels at 0 to 290 crowns. An NPC's address is 1 to 255; `join` refuses those addresses, so a
  removed NPC's address can never become a player's.

### 11.2 The records

| Record | Slot | Layout |
|---|---|---|
| `Village` (system) | `villages` | `status` [0, 8) (0 none, 1 player, 2 NPC) · `draws` [8, 40) |
| `Place` (buckets) | `bucket_places` | `bucket` [0, 8) · `index` [8, 40) · `listed` [40] |
| `Shield` (shields) | `shields` | `queue` [0, 8) · `up` [8] · `seq` [64, 128) · `until` [128, 192) |
| `Queue` (shields) | `shield_queues` | `head` [0, 64) · `tail` [64, 128) |
| match (system) | `match_states` | `offer` [0, 8) · `cost` [8, 16) · `started` [16] |

A player is listed or shielded, exactly one of the two (fuzzed). The 0-star cost is fixed at the draw with the offer,
as Clash of Clans shows both before the attack.

### 11.3 What moved, and why it is safe

The one packed `villages` slot of #663 (crowns, bucket, index, status, queue, draws, npc, seq, shield end) is split into
the four records above, and `registry`, `bucket_sizes`, `slots`, `queues` and `queue_entries` take the names of their
component. `villages` keeps its name with a new type, and `match_states` gains the cost.

This breaks no deployed layout: `Matchmaker` is in no deployment file (`contracts/deployments/`), and `scripts/deploy.sh`
does not declare it (its deployment is #663's named follow-up). No client or indexer reads its storage or its events yet.
`docs/architecture/upgrades.md`'s discipline applies from its first deployment on; the pins of
`test_storage_is_pinned_by_name` read every variable of every piece at the raw address of its name.

### 11.4 The interface (ABI)

`contracts/abis/Matchmaker.json` changes; no client imports it yet (`contracts/abis/README.md`):

- `village` returns the system's `Village { status, draws }`; a village's crowns, place and shield are the pieces'
  views (11.1).
- `offer(attacker, defender) -> u8` became `terms(attacker, defender) -> (offer, cost)`.
- `Match` gains `cost`; `OpponentDrawn` and `AttackStarted` gain `cost`; `CrownsSettled` gains `cost` and moves to
  `CrownableComponent` (same name, flat, so the same selector). The shield events move to `ShieldableComponent` (flat,
  same names); `BucketEntered` and `BucketLeft` are new.

### 11.5 Size and cost

**CASM** (`scripts/class-sizes.sh`, release, VPS, 2026-10-22, `class-headroom.md`, "After MATCHMAKER-CROWNS"):
`Matchmaker` 24,473 to 24,614 felts (+141), 30.0 % of the Starknet cap, 49,114 under P-44's. No other class changes.

**Gas** (L2 gas of the call alone, test profile, snforge 0.64.0, VPS, 2026-10-22; z15, the VRF draw alone, equal to its
committed 986,461; ceilings reset at measured + 5 %; z17 and z18 measured again after choice B of 6.1, under their
ceilings: the cost's binary search takes another path):

| Test | Call | #663 | Now | Change |
|---|---|---:|---:|---:|
| z16 | `join` | 862,337 | 864,882 | +0.3 % |
| z17 | `search`, free | 2,391,635 | 2,602,829 | +8.8 % |
| z18 | `next` | 2,927,813 | 3,169,327 | +8.2 % |
| z19 | `start_attack`, worst case | 3,900,612 | 4,421,401 | +13.4 % |
| z20 | `settle`, worst case (both change bucket) | 2,683,181 | 3,133,404 | +16.8 % |
| z21 | `release_shields(2)` | 1,765,814 | 1,992,340 | +12.8 % |

The price of the smaller scopes: a village's fields are in three slots instead of one, so a call that touches crowns,
place and shield reads and writes each, and every bucket move emits `BucketEntered` or `BucketLeft`. The curves' binary
searches cost little beside them. If #643's attack budget needs it back, dropping the two bucket events is the first
lever (the shield events already tell an indexer when a village leaves or returns to the pool).

**Local runs.** As in #663, the whole `contracts/` test build passes the VPS's 8 GB Cairo scope (a run of the full crate
was stopped by it). The modules ran in a scratch copy of the crate that keeps every source and only the test modules
named (`matchmaker`, `matchmaker_system`, `setup`): 84 tests of `paved::tests::matchmaker*` pass (peak RSS 6.0 GB under
`prlimit --as=16106127360`), and the gas tests `test_gas_z*` pass (31, peak RSS 4.1 GB). CI runs the whole suite.

### 11.6 Audit, correctness and security (crowns and Cobbles move)

- **Crowns.**
  - They move only in `CrownableComponent`'s `settle` (by an operator, an attack started, 0 to 3 stars, at the offer and
    cost fixed at the draw) and `set` (`set_crowns` by an operator, `set_npc` by the owner). Between players they are
    conserved, never negative and never overflow (fuzzed at every `u32` count and near the bound, and over random
    sequences through the system).
  - The terms are fixed at the draw: a player cannot raise its offer, or cut its cost, by moving crowns between the draw
    and the settlement (`test_failed_attack_gives_the_cost_to_the_defender`).
  - The offer is at least 1 and at most 59, the cost at most 39 (fuzzed). A 1-star on a 1-crown offer wins 1.
  - Against an NPC a win mints the attacker's gain (at most 59 per attack, the offer at a gap of +719 or more) and a loss
    burns its cost, as before: the cold-start trade-off of section 8, point 4, bounded by the owner removing the NPCs.
    Whether a defender is an NPC is read from its address (1 to 255), so an NPC removed mid-attack is still settled as
    one, never as a player.
- **The composition.** Each piece guards its own state (`Buckets: already listed`, `Buckets: not listed`,
  `Shields: already up`, `Shields: not up`), so a wrong composition reverts instead of corrupting the pool; the
  invariants (a player listed or shielded, exactly once; slots, places and the registry agreeing) are checked after every
  call of the fuzzed sequences.
- **Cobbles.** Unchanged: `next` spends `NEXT_PRICE` through `Setup.spend_cobbles` before its draw, in the same
  transaction; a draw that fails reverts the spend. The allowlist is the owner's.
- **The draw.** Unchanged: the VRF salt is the attacker's draw counter (the system's `Village.draws`), the attacker never
  draws itself (fuzzed in the buckets alone and in the system), and a drawn opponent shielded meanwhile fails the start.
- **Owner.** Sets the operators, `Setup`, the VRF provider and the NPCs, and upgrades; no owner call moves a player's
  crowns or Cobbles.

### 11.7 Follow-ups this PR names

As in #663 (allowed by #637's constraints), the client side follows `Matchmaker`'s deployment in one follow-up:
`scripts/deploy.sh` and the deployment files (operators, `Setup.set_spender`, the NPC villages); the `@paved/chain`
views (`village`, `crowns`, `place`, `shield`, `current_match`, `terms`) and the writes `search` and `next`, each behind
`withVrfRequest` with `vrfSalt('MATCH', attacker, draws)`; the indexer's tables (`pvp_villages`, `pvp_matches`,
`pvp_shields`) from the events of the three pieces and the system.
