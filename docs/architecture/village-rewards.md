# Village rewards and tiers: 3 tiles, place, merge or Cobbles; tier-gated skins (#642, design)

Track CORE's design for #642, part of the PvP plan #637, after the VRF draws (#638, `vrf-draws.md`) and the village
territory (#640, `village-territory.md`). The owner's decisions of 2026-10-20 bind:

- **After a game, a reward comes at once** (no timer), with a daily cap.
- **A reward offers 3 tiles; choosing one is placing it**, in one transaction. A "take Cobbles" option is always there.
- **Tiers**: two of a tier make one of the next (1, 2, 4, 8, 16 copies; more tiers may come).
- **Skins reserved to a tier.**
- **No random merge.**

Section 7 holds the points put to the owner. **The owner validated rules A to E as proposed on 2026-10-23**. Each rule is a
named constant of `contracts/src/systems/rewards.cairo` (section 7), so a later change is a one-line change. Everything else is a proposal the team may improve. Section 8 is as built.

## 1. Summary

- **A new system, `Rewards`** (`contracts/src/systems/rewards.cairo`). `Village` (70.4 % of the cap) and `Challenge`
  (4.7 % under the P-44 cap) are not made bigger. `Rewards` embeds `DrawableComponent` (#638) and is one of `Village`'s
  placers (#640's `set_placer`): it places the chosen tile with `Village.place`, which keeps every territory and fit rule.
- **The grant goes through `Setup`**, which already hears the end of every game that may grant (section 3). `Challenge`,
  `Story` and `Matchmaker` are unchanged, and **#643 needs nothing**: its settlement already calls
  `Matchmaker.settle`, which calls `Setup.report_pvp`.
- **Three steps, two transactions after the game**:
  1. *grant* (inside the game's own transaction): `Setup` calls `Rewards.grant(player_id, source)`; under the daily cap,
     the player's pending rewards grow by one. No random, so it never conflicts with the game's own VRF draw.
  2. *open* (`open_reward()`, the player): the VRF draws the offer's 3 tiles from the base deck's distribution and stores
     them. One draw, so one transaction (the provider fulfils one seed per transaction, `vrf-draws.md`, section 3).
  3. *claim* (`claim_reward(choice, slot, orientation, x, y)`, the player, one entry point): place tile `slot` at
     `(x, y)` turned to `orientation`, or add it as a copy of its plan, or take the Cobbles. One gesture, one
     transaction; the offer is then gone.
- **Copies and tiers per plan, for the account** (open point C): 19 counters in `Rewards`; the tier is
  `floor(log2(copies))`, computed, never stored, so a new tier needs no migration.
- **Tier-gated skins**: a skin gains a minimum tier (`set_skin_tier(theme, plan, min_tier)` in `Setup`, beside
  `set_skin_price`: section 8); `buy_skin` reads the player's tier of that plan from `Rewards` only when the skin has one.

## 2. Storage (`Rewards`)

All names are new; `Rewards` is upgradable (OpenZeppelin's `upgrade`, the repository's `OwnableComponent`), and a pin
test reads each variable at the raw address of its name (`upgrades.md`).

| Variable | Key | Value |
|---|---|---|
| `setup`, `village` | | the `Setup` that grants and pays, the `Village` placed into (owner) |
| `granters` | address | allowed to grant (owner, `set_granter`): `Setup` |
| `daily_cap` | | the rewards one account may be granted per chain day (owner, `set_daily_cap`, 1 to `MAX_DAILY_CAP`) |
| `grants` | `player_id` | `day` [0, 32) · `today` [32, 48) (granted that day) · `pending` [48, 80) · `opened` [80, 112) (the draw index) |
| `offers` | `player_id` | the open offer: `plan_1` [0, 8) · `plan_2` [8, 16) · `plan_3` [16, 24) (0: no offer) · `index` [24, 56) (the reward's number) |
| `copies` | `(player_id, plan)` | the copies of a plan (`u32`), 0 never received |
| vrf (component) | | `vrf_provider`, `vrf_last_draw_tx` |

The day is the quests' clock, `block_time / 86400` (`Setup`'s `DAY`); a `grants` word of an earlier day reads as 0
granted today, so the reset costs no write.

## 3. The grant (open point A)

Proposed: **every game that ends with an effort the player cannot replay for free grants one reward**, capped per day:

| Mode | Where `Setup` hears it | Source |
|---|---|---|
| Challenge, paid or free | `report` (every game over, `Challenge.finish`) | `REWARD_CHALLENGE` |
| Story | `credit_story` (a run that gains a star: a run can be resubmitted for nothing, so a run with no new star grants nothing) | `REWARD_STORY` |
| PvP attack | `report_pvp` (`Matchmaker.settle`, an NPC attack included, as the missions) | `REWARD_PVP` |

- **The daily cap**: proposed **10 rewards per account and chain day**, an owner-set parameter (`set_daily_cap`). A
  grant over the cap returns `false` and does nothing: a game over is never reverted by a reward.
- **Pending rewards accumulate** (a counter): a player who plays three games and opens the village later finds three.
  It is not an inventory of tiles: a reward has no tiles until it is opened, and an open offer must be claimed before the
  next one opens.
- **The wiring**: `Setup` gains `rewards` (owner, `set_rewards`; zero: no grant, as before). The owner allows `Setup`
  as a granter on `Rewards` first; with a `rewards` set and `Setup` not allowed, a game over would revert, so the
  deployment script sets both in that order and its smoke checks it.
- **For #643**: nothing to add. If the attack system ever reports elsewhere than `Setup.report_pvp`, it becomes a
  granter of its own with `set_granter` and calls `grant(player_id, REWARD_PVP)`.

## 4. The offer and the claim

- **The draw**: `draw_random('REWARD', player_id, opened)`, then three independent draws from the base deck's
  distribution (`BaseDeck::plan(lane % 72)`, three 64-bit lanes of the random): a curve (9 of 72) is in about 1 reward
  in 3, the full city (1 of 72) in about 4 %. Two slots may hold the same plan. The salt does not depend on anything
  the player chooses, so a reverted `open_reward` draws the same offer again.
- **`claim_reward(choice, slot, orientation, x, y)`**, the caller's open offer (`'Rewards: no offer'`):
  - `PLACE` (1): `Village.place(caller, plan, orientation, x, y)`, with all of #640's checks (founded, cell owned,
    free, fits); the plan gains one copy (open point D).
  - `MERGE` (2): the plan gains one copy; the village is not touched, so this works with a full territory or no village.
  - `COBBLES` (3): `REWARD_COBBLES` credited on `Setup`'s ledger (open point B); `slot` is ignored.
  - The offer is cleared in every case. Emits `RewardClaimed { player_id, index, choice, plan, copies, tier, cobbles }`.
- **A tile that fits nowhere** (#640, decision 4): the place reverts; the merge and the Cobbles stay open.
- **The Cobbles** are credited by `Setup.credit_reward(player_id, index, cobbles)`, a reporter's call like
  `credit_league`, with a new claim kind `CLAIM_REWARD` (6) in `CobblesClaimed` (`id` 0, `period` the reward's index), so
  the indexer's ledger stays once per player, kind, id and period. `Rewards` is an allowlisted reporter.

## 5. Tiers and tier-gated skins

- **The tier** of a plan: 0 under 2 copies (the base, "dirt"), then `floor(log2(copies))`: 2 copies tier 1, 4 tier 2,
  8 tier 3, 16 tier 4. Their names (dirt, silver, gold, diamond...) are the client's. A tier above 4 needs no change.
- **Views**: `copies(player_id) -> Array<u32>` (19 counters), `tier(player_id, plan) -> u8`, `grants(player_id)`
  (today's count, the cap, pending), `offer(player_id)`.
- **Events**: `RewardGranted { player_id, source, day, today, pending }`, `RewardOpened { player_id, index, plans }`,
  `RewardClaimed` (section 4).
- **`Setup`**: `skin_tiers: Map<(u8, u8), u8>` appended (P-42), written by `set_skin_tier(theme, plan, min_tier)` (built
  as a setter of its own, not a fourth argument of `set_skin_price`: section 8); `buy_skin` refuses `'Setup: tier too low'`
  when `min_tier > 0` and `Rewards.tier(player, plan)` is lower. A skin with no minimum tier reads one slot more.
  `cobbles-v1.md` part 3 is updated with it.

## 6. Size, gas, client

- **CASM**: `Rewards` new (estimate 12,000 to 18,000 felts with the component); `Setup` grows by the grant calls, the
  tier check and `credit_reward` (estimate +1,500 from 47,384, 57.8 % today). Measured in the PR with
  `scripts/class-sizes.sh`, recorded in `class-headroom.md`.
- **Gas**: `grant` (within a Challenge game over and alone), `open_reward`, each choice of `claim_reward`, a gated
  `buy_skin` (in `src/tests/rewards.cairo`, and the shift of the existing calls in `contracts/tests/gas.cairo`: section 8).
- **Client**: `@paved/chain` gains the `Rewards` reads and the writes (`openReward`, with its VRF request first, and
  `claimReward`), and the skin refusal of a tier too low. The indexer decodes `CobblesClaimed` kind 6 in the Cobble ledger
  (or `Setup`'s indexing halts, as kinds 4 and 5 would have, #644), and knows `RewardsSet` and `SkinTierSet` by name. The
  shop's reading of `skin_tier` comes with the village screen's wiring (#646). The tables of
  `Rewards`' own events wait for its deployment, as `Village`'s do (a follow-up the PR names).

## 7. Points for the owner (validated as proposed, 2026-10-23)

| # | Point | Proposal | Alternatives |
|---|---|---|---|
| A | Which games grant a reward, and the daily cap (#637 point 3) | Every Challenge game over, every Story run that gains a star, every PvP attack settled; **10 per day**, owner-set | PvP only; every mode with another cap |
| B | The Cobbles of "take Cobbles" (#637 point 8) | **5 Cobbles** (a daily quest's minimum): at the cap, 50 a day, half of a top skin | 3; 10 |
| C | Where a tier lives (#637 point 5) | **Per plan, for the account** (19 counters): skins are owned and active per plan, and a tier shows in every mode | Per placed tile (a copy merges into one tile; demolition loses it) |
| D | Does a placed tile count as a copy? | **Yes**: every tile taken, placed or merged, adds a copy; the first curve placed is the curve's first copy (tier 0), the second taken makes tier 1 | No: only merges count, so placing and merging are a true choice between the village and the tier |
| E | Must a merge be dropped on a placed tile of its plan, on chain? | **No**: the account's tier does not depend on a tile, so the chain does not check it; the client's gesture drops it on a tile of its plan, or on the tier bar when none is placed | Yes: a merge needs a placed tile of that plan (one more read; a plan never placed can only be placed or sold) |

Each rule is a constant of `paved::systems::rewards` (an amendment changes its line and the tests that pin its value):

| Rule | Constants | Value as built |
|---|---|---|
| A, the modes | `GRANTS_CHALLENGE`, `GRANTS_STORY`, `GRANTS_PVP` (read by `Setup` before it grants) | `true`, `true`, `true` |
| A, the cap | `DAILY_CAP` (the constructor's value; the owner's `set_daily_cap` changes it on chain, 1 to `MAX_DAILY_CAP` = 1,000) | 10 |
| B | `REWARD_COBBLES` | 5 |
| C | none: the copies are keyed by `(player_id, plan)` (`copies`); a tier per placed tile would be another storage and another design | per plan, for the account |
| D | `PLACE_COUNTS_COPY` | `true` |
| E | `MERGE_NEEDS_TILE` (when `true`, a merge reads `Village.tiles` and refuses `'Rewards: no tile of plan'`) | `false` |

## 8. As built

Code:

- `contracts/src/systems/rewards.cairo`: `Rewards` (`IRewards`, `IRewardsAdmin`), `tier_of`, `offer_plans`.
- `contracts/src/systems/setup.cairo`: `ISetupRewards` (`set_rewards`, `rewards`, `credit_reward`), `CLAIM_REWARD` (6), the
  grant in `report`, `credit_story` and `report_pvp`, `set_skin_tier` and `skin_tier` in `ISetupSkins`, the check in
  `buy_skin`; `rewards` and `skin_tiers` appended to the storage. Events `RewardsSet`, `SkinTierSet`.
- Tests: `contracts/src/tests/rewards.cairo` (coverage group `tests-rewards`).
- Client: `packages/chain/src/rewards.ts` (the views' decoders, `tierOf`, `openRewardCalls` with its VRF request,
  `claimRewardCall`), the skin refusal `tier-too-low` in `packages/chain/src/writer.ts`; the indexer decodes `CobblesClaimed`
  kind 6 in the Cobble ledger and knows `RewardsSet` and `SkinTierSet` by name.

Departures from sections 1 to 6:

- **`set_skin_tier` is a setter of its own**, not a fourth argument of `set_skin_price`. Extending `set_skin_price` and
  `SkinPriced` would change a live entry point (the deployment script, `@paved/chain`, the app's shop) and the shape of an
  event the indexer already holds on Sepolia; a separate setter changes neither.
- **The `grants` word** keeps the day in 32 bits (enough for 11 million years of days), so the four fields fit one `u128`.
- **The gas of `Rewards`' calls is measured in `src/tests/rewards.cairo`** (`test_rewards_gas_*`, as `Village`'s are in
  `src/tests/village.cairo`): the measures use the module's world and offers. `tests/gas.cairo` holds the shift of the existing
  calls.
- **`grant` returns `false` at the cap**, and also when the pending count would pass `u32` (never reached). It reverts only for
  a caller that is not a granter: `Setup` must be allowed before `set_rewards` points at `Rewards`, or a game over reverts.
- **The deployment** waits for `Village`'s (neither is in `scripts/deploy.sh` yet). Its order: `Rewards(owner, setup, village,
  provider, DAILY_CAP)`, `Rewards.set_granter(Setup)`, `Setup.set_reporter(Rewards)` (for `credit_reward`),
  `Village.set_placer(Rewards)`, then `Setup.set_rewards(Rewards)` last.

**Gas** (L2, test profile, snforge 0.64.0, VPS; the ceilings are these + 5 %):

| Call | Scenario | L2 gas |
|---|---|---:|
| `grant` | by `Setup`, a second grant of the day | 464,062 |
| `Setup.report` | a free game's game over with its grant | 830,032 |
| `open_reward` | the second offer of a player (one VRF draw over the mock) | 1,363,613 |
| `claim_reward` | Cobbles (`Setup.credit_reward`) | 898,620 |
| `claim_reward` | merge | 536,852 |
| `claim_reward` | place, a tile that closes nothing (`Village.place`) | 4,727,618 |
| `set_skin_tier` | | 293,750 |
| `buy_skin` | a skin reserved to tier 1, the tier read on `Rewards` | 998,114 |

The existing calls, against main measured the same way: every game over reads `Setup.rewards` (+48,580 on g, i and k, +48,980
on x, none set), and `buy_skin` reads the skin's minimum tier (z11, +66,430). Their ceilings in `tests/gas.cairo` are reset to
measured + 5 %.

**CASM** (`scripts/class-sizes.sh`, release, VPS): `Rewards` 4,357 Sierra, 10,771 CASM felts (13.1 % of the cap); `Setup`
49,984 (61.0 %, +2,600). Every other class is unchanged (`class-headroom.md`, "After VILLAGE-REWARDS").

**Tests.** `paved::tests::rewards`, 43 tests: the tier table; the offer against the base deck's 72 tiles, its three
independent lanes, and a fuzz that every lane is a plan 1 to 19; the grant from each mode through `Setup` and its events; the
daily cap, its reset the next day and the owner's cap; a non-granter refused; no `rewards` set grants nothing; the open (the
VRF's value for the reward's salt, one offer at a time, one draw per transaction, a salt per offer); each claim and its
events and refusals (no offer, claimed twice, an unknown choice, a fourth slot, the territory's rule, no village); the skins
reserved to a tier (refused under it, sold at it, refused with no `Rewards`); access (owner-only setters, reporter-only
`credit_reward`); the storage pins of both contracts; the gas; and a fuzz of the ledger's invariants (granted = pending +
opened, the day's grants within the cap, every opened offer claimed at most once, copies and Cobbles equal to the claims).

**The audit lens (value and access).** Cobbles move in one place: `claim_reward`'s Cobbles choice credits `REWARD_COBBLES`
through `Setup.credit_reward`, a reporter-only call (`Rewards` the reporter), once per opened offer: the offer is cleared
before the call, and an offer is opened only from a pending reward, which only an allowed granter (`Setup`) adds, under the
daily cap. A reverted claim reverts the clearing with it. The tiers gate a purchase and never pay anything; copies only grow.
The draw cannot be rerolled: its salt is the player and the reward's index, and an `open_reward` that reverts draws the same
offer again (#638's rules: one draw per transaction, the draw the first consume).

**Run on the VPS.** The whole test build of `contracts/` does not fit the machine's 8 GB scope for a Cairo run (it was killed
by the OOM killer, as #638 and #640 found). The tests ran on scoped copies of the package that compile only the test modules
of a run and their helpers (the branch's own sources, built outside the repository), so that every module of `src/tests` and
`tests/gas.cairo` ran at least once, in nine runs, each under 7.5 GB peak RSS: 2,830 passed (the helpers' modules, `setup` first, in several runs), 0 failed, 9 ignored (as on main).
Two tests needed a change for this branch: `matchmaker_system`'s second-attacker test set two villages above the pool's cap
of 5,000 crowns, in one bucket, so its draw followed the matchmaker's address (which follows `Setup`'s class); its crowns now
keep each village in its own bucket. `cobbles_ledger`'s report test had a gas budget for three reports, now measured + 5 %.
The whole suite runs in CI.
