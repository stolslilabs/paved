# Village rewards and tiers: 3 tiles, place, merge or Cobbles; tier-gated skins (#642, design)

Track CORE's design for #642, part of the PvP plan #637, after the VRF draws (#638, `vrf-draws.md`) and the village
territory (#640, `village-territory.md`). The owner's decisions of 2026-10-20 bind:

- **After a game, a reward comes at once** (no timer), with a daily cap.
- **A reward offers 3 tiles; choosing one is placing it**, in one transaction. A "take Cobbles" option is always there.
- **Tiers**: two of a tier make one of the next (1, 2, 4, 8, 16 copies; more tiers may come).
- **Skins reserved to a tier.**
- **No random merge.**

Section 7 holds the open points for the owner. The code follows the ruling; each value is a named constant or an
owner-set parameter. Everything else is a proposal the team may improve.

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
- **Tier-gated skins**: a skin's price gains a minimum tier (`set_skin_price(theme, plan, cobbles, min_tier)` in
  `Setup`); `buy_skin` reads the player's tier of that plan from `Rewards` only when the skin has one.

## 2. Storage (`Rewards`)

All names are new; `Rewards` is upgradable (OpenZeppelin's `upgrade`, the repository's `OwnableComponent`), and a pin
test reads each variable at the raw address of its name (`upgrades.md`).

| Variable | Key | Value |
|---|---|---|
| `setup`, `village` | | the `Setup` that grants and pays, the `Village` placed into (owner) |
| `granters` | address | allowed to grant (owner, `set_granter`): `Setup` |
| `daily_cap` | | the rewards one account may be granted per chain day (owner, `set_daily_cap`, 1 to `MAX_DAILY_CAP`) |
| `grants` | `player_id` | `day` [0, 64) · `today` [64, 80) (granted that day) · `pending` [80, 112) · `opened` [112, 144) (the draw index) |
| `offers` | `player_id` | the open offer: `plan_1`, `plan_2`, `plan_3` (5 bits each, 0: no offer) · `index` (the reward's number) |
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
- **`Setup`**: `skin_tiers: Map<(u8, u8), u8>` appended (P-42), written by `set_skin_price`, which gains `min_tier`;
  `SkinPriced` gains `min_tier`; `buy_skin` refuses `'Setup: tier too low'` when `min_tier > 0` and
  `Rewards.tier(player, plan)` is lower. A skin with no minimum tier reads nothing more. `cobbles-v1.md` part 3 is
  updated with it.

## 6. Size, gas, client

- **CASM**: `Rewards` new (estimate 12,000 to 18,000 felts with the component); `Setup` grows by the grant calls, the
  tier check and `credit_reward` (estimate +1,500 from 47,384, 57.8 % today). Measured in the PR with
  `scripts/class-sizes.sh`, recorded in `class-headroom.md`.
- **Gas**: `grant` (within a Challenge game over and alone), `open_reward`, each choice of `claim_reward`, a gated
  `buy_skin`, in `contracts/tests/gas.cairo`.
- **Client**: `@paved/chain` gains the `Rewards` reads and the writes (`openReward`, with its VRF request first, and
  `claimReward`), and `setSkinPrice`'s new argument. The indexer decodes `CobblesClaimed` kind 6 in the Cobble ledger
  (or `Setup`'s indexing halts, as kinds 4 and 5 would have, #644), and `SkinPriced`'s new field. The tables of
  `Rewards`' own events wait for its deployment, as `Village`'s do (a follow-up the PR names).

## 7. Open points for the owner

| # | Point | Proposal | Alternatives |
|---|---|---|---|
| A | Which games grant a reward, and the daily cap (#637 point 3) | Every Challenge game over, every Story run that gains a star, every PvP attack settled; **10 per day**, owner-set | PvP only; every mode with another cap |
| B | The Cobbles of "take Cobbles" (#637 point 8) | **5 Cobbles** (a daily quest's minimum): at the cap, 50 a day, half of a top skin | 3; 10 |
| C | Where a tier lives (#637 point 5) | **Per plan, for the account** (19 counters): skins are owned and active per plan, and a tier shows in every mode | Per placed tile (a copy merges into one tile; demolition loses it) |
| D | Does a placed tile count as a copy? | **Yes**: every tile taken, placed or merged, adds a copy; the first curve placed is the curve's first copy (tier 0), the second taken makes tier 1 | No: only merges count, so placing and merging are a true choice between the village and the tier |
| E | Must a merge be dropped on a placed tile of its plan, on chain? | **No**: the account's tier does not depend on a tile, so the chain does not check it; the client's gesture drops it on a tile of its plan, or on the tier bar when none is placed | Yes: a merge needs a placed tile of that plan (one more read; a plan never placed can only be placed or sold) |
