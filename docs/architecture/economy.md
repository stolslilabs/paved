# Economy (P8, design for ruling)

Design of Paved's economy: the paid Daily game in USDC, the PAVED token, the burn, the reward curve with its cliff,
the moving mean, the Vault, the swap and the LP. Documents only: no contract changes in this PR. The prototypes that
gave the measured figures live outside it (section 6, "How it was measured"). The Monte-Carlo script and its
input are committed under `scripts/montecarlo/`.

The owner's decisions (D-10, 2026-10-09, relayed by the PM) are fixed here and not re-opened:

| Fixed by the owner (D-10) | Value |
|---|---|
| Token | "Paved Token", symbol `PAVED`, 18 decimals; initial supply 1,000,000 PAVED (as Nums); **minting restricted to the game**; the supply is read from the token's real `total_supply`, never from a mirror |
| Entry | paid in USDC at Nums' price, **2 USDC per stake unit**; on each purchase **70 % of the price is swapped to PAVED and burned** (Nums' rate) |
| Margin | configurable (Nums: what remains after the burn), **entirely to the Vault's beneficiaries (stakers)**; no team share |
| LP fee | **5 %** (Nums' pool fee) |
| Multiplier | bought as in Glitchbomb: **price = stake x base price**, reward boost linear in the stake; no Nums-style discount |
| Referrals | **5 % of the purchase price**, kept |
| Cliff | below the profitability-shifted mean, **the whole stake is lost** (Nums returns part of it) |

**Nothing is deployed beyond devnet.** Deploying PAVED on a public network, creating the PAVED/USDC pool, funding
the LP and choosing who holds the LP position are **the owner's acts** (reserved list: production networks,
money). This design and its PRs stop at devnet, with a mock router and a mock USDC.

Sources read: `docs/programme/{PLAN,OPERATIONS,DECISIONS,RISKS}.md`;
`docs/architecture/{class-headroom,leaderboard,quests,native-storage,public-interface,indexer}.md`;
`docs/history/p1-removed.md`; `docs/measures/golden-games.md`; `contracts/src/` (systems `daily`, `lobby`, `tutorial`;
components `hostable`, `payable`, `playable`; `models/{game,tournament}`, `types/mode`, `events`, `constants`,
`tests/golden/full_deck`); Nums (`/home/claude/projects/nums`, commit `4f8f405`, read only: `components/purchase`,
`helpers/rewarder`, `models/config`, `systems/{setup,token,vault,treasury}`, `components/{playable,rewardable}`,
`dojo_mainnet.toml`, the docs pages on the token); Glitchbomb (`/home/claude/projects/glitchbomb`, read only:
`components/purchase`, `helpers/rewarder`, `models/{config,game}`, `systems/{setup,play,token}`,
`dojo_mainnet.toml`, `docs/pages/game-rules/rewards.mdx`, `docs/pages/referral-program.mdx`). The referral split of
both games lives in Cartridge's `arcade` bundle component (pinned there at `cartridge-gg/arcade` rev `fc2e81c`); it was
read from a local checkout that may differ from that revision.

## Summary

- **Where the money goes.** For a purchase of stake `k`, the price is `P = 2k` USDC.
  - 70 % (`0.7 P`) is swapped to PAVED through Ekubo and burned.
  - The rest goes to the Vault in USDC: 30 %, or 25 % when the player came with a referrer, who gets 5 %.
    **Recommended: the referral comes out of the margin**, so the 70 % burn of D-10 holds on every purchase.
  - The pool keeps its 5 % fee on the swapped USDC.
  - At settlement the game **mints** PAVED to the player: `R x h(score / mean)`. Here `R` is the PAVED burned for
    that game, times the stake boost `1 + k/100` (Glitchbomb), times Nums' supply factor `F = 2 - S/T`.
- **The curve.** `h` is 0 below the threshold `(1 + sigma) x mean`, where the whole stake is lost. Above it, `h` is
  linear in the score, `c x score / threshold`, capped at `H`.
  - Proposed: `sigma = 0`, so the threshold is the mean.
  - `c` is calibrated so that `E[h] = rho = 0.9` on the score sample. That gives `c = {{SLOPE}}` today.
  - Proposed cap: `H = 5`.
- **The mean.** Nums' weighted mean: weight = stake, scores under 100 left out, cumulative up to a weight of 1,000,
  then an EMA. Two additions: a clamp at 4x the mean, and the initial mean taken from the calibration.
  - **Recommended (option B): each game is settled against the mean of its own day**, blended with the EMA as a
    prior of weight 100. Settlement is one permissionless transaction once the day is over. The reason: every player
    of a day plays the same deck, and the day's deck moves the mean score by **{{CV}}** from one day to the next
    (measured).
  - The fallback (option A, Nums) freezes the EMA at the purchase and mints at game over. It is simpler, but on
    hard days everyone loses: up to 100 % of the games of a day in the simulation.
- **What the Monte-Carlo shows.** It ran on {{N}} whole Daily games played by bots on the contracts. Real players
  are not in it: these are the limits of the sample.
  - **In steady state the supply factor drives the mint to equal the burn**: mint / burn is {{MINTBURN}}. The house
    edge is then structural: `1 - 0.7 x 0.95^2 = 36.8 %` (30 % margin, plus the pool fee on the buy and on the
    player's sale), measured {{EDGE}}.
  - Of `sigma`, `rho` and `H`, none moves the edge. They only decide **who** loses and where the supply settles:
    `S* = T (2 - 1/rho_eff)`.
- **Contracts.** The paying logic lives in its own contracts: `PavedToken`, `Economy` (purchase split, swap, burn,
  terms, mean, settlement, mint) and `Vault` (stake PAVED, earn USDC; **simpler than Nums' ERC4626**, recommended).
  - Devnet only: `MockUSDC` and `MockRouter`.
  - `Lobby` gains a few lines: one `transferFrom` and one call to `Economy` at spawn, one call at game over.
  - **`Daily` grows by 183 CASM felts** (measured on a prototype): the three new arguments of `spawn` and the game id
    passed to `Lobby.report`. It goes from 72,424 to 72,607 (88.6 % of the cap), and nothing in the move code
    changes. That growth goes back to the PM under P-27.
- **For the owner** (D-3, their decision): **the predictable daily seed makes a paid Daily exploitable.**
  - The day's deck is public, so a player can find the day's best line offline and replay it at stake 10.
  - Measured in the simulation: such "replayers" get back {{REPLAY}} of what they pay, while everyone else drops to
    about half.
  - Recommendation: a seed that nobody knows before the purchase (a VRF) before any paid game goes beyond devnet.

## 1. The flows of one paid game

### Units

| Quantity | Unit on chain | Notes |
|---|---|---|
| USDC amounts | base units, 6 decimals (`1 USDC = 1_000_000`) | Starknet USDC; on devnet a `MockUSDC` with 6 decimals |
| PAVED amounts | base units, 18 decimals | `PavedToken` |
| Shares and rates | basis points (`bps`, `10_000 = 100 %`) | as `#181`'s split |
| Scores | points (`u32`), as `Game.score` | |
| Mean | points x 1,000 (`u64`), as Nums' `EMA_SCORE_PRECISION` | |
| Stake `k` | `u8`, 1 to 10 | Glitchbomb's 10 bundles |

Constants: base price `p0 = 2_000_000` (2 USDC, the `Mode::Daily` price, which replaces today's 1e18 test token
price); `BURN_BPS = 7_000` (configurable, section 6); `REFERRAL_BPS = 500`; Ekubo fee `0.05 x 2^128`.

### Purchase (`Daily.spawn(stake, referrer, min_out)`)

The player approves `Daily` for `P` USDC, then calls `spawn`. `Daily` runs `Lobby.spawn` by library call (as today), which:

1. spawns the game (`HostableComponent.spawn`, unchanged, except that the entry no longer feeds the tournament's
   prize: section 6);
2. pulls `P = k x p0` USDC from the player straight to `Economy` (`transferFrom(player, Economy, P)`, made by
   `Daily`, so the approval target stays `Daily`);
3. calls `Economy.purchase(game_id, player, day, k, P, referrer, min_out)`. Only `Daily` may call it.

`Economy.purchase`, in one transaction:

| Step | Formula | Goes to |
|---|---|---|
| Referral | `ref = P x 500 / 10_000` if `referrer` is non-zero and is not the player, else 0 | the referrer, in USDC |
| Burn share | `q = P x BURN_BPS / 10_000` (70 %: `q = 0.7 P`) | the Ekubo router, swapped USDC -> PAVED |
| LP fee | `0.05 q`, taken by the pool from the input | the pool's liquidity (the LP position holder: the owner's act) |
| PAVED bought | `b`, the router's output, at least `min_out` (`clear_minimum(PAVED, min_out)`): about `0.95 q / price` minus price impact | `Economy`, then **burned** (`PavedToken.burn(b)`) |
| Margin | `m = P - q - ref` (30 %, or 25 % with a referrer) | the `Vault`, in USDC (a plain transfer) |
| Supply | `S = PavedToken.total_supply()`, read **after** the burn | |
| Supply factor | `F = clamp((2T - S) x 10_000 / T, 0, 20_000)` bps (Nums) | |
| Reference reward | `R = b' x (10_000 + 100 k) / 10_000 x F / 10_000`, with `b' = min(b, q x rate x 1.10)` (price guard, section 5) | stored with the game |

`Economy` holds no balance after a purchase: every USDC and PAVED unit that came in left in the same transaction
(asserted). Nothing can accrue there for anyone to take.

### Game over

The three ways a Daily game ends already pass through `Lobby`: `discard` and `surrender` run there, and a `build`
that ends the game calls `Lobby.report`. `Lobby` calls `Economy.record(game_id, score, in_day)`, where `in_day`
means the game ended within the day it was bought in, the same rule as the leaderboard (`end_in_tournament`).
`record` stores the score. If `score >= MIN_SCORE` and `in_day`, it also adds the game to the day's accumulator
(`sum k x min(score, 4 x prior)`, `sum k`).

`Lobby.report` today carries only the tally, so the game id is added as an argument (one felt in `Daily.build`,
measured: +1 CASM felt). A game that never ends is never settled: its stake is lost, and its burn has already
happened.

### Settlement and mint

**Option B (recommended).** Once the day is over (`now >= (day + 1) x 86400`), anyone calls
`Economy.settle(game_ids)`. For each game that is recorded and not yet settled:

1. On the day's first settlement, its mean is fixed:
   `mean_d = (W_p x prior_d + sum k x s') / (W_p + sum k)`.
   - `prior_d` is the EMA as of the day's first purchase, stored then.
   - `W_p = 100`.
   - The day is folded into the EMA once, as one push of `(sum k x s' / sum k, sum k)`.
2. `payout = R x h(score / mean_d)` (section 2).
3. If it is non-zero, it is minted: `PavedToken.mint(player, payout)`. Only `Economy` is a minter.
4. `Settled` is emitted.

The indexer, a keeper or the client can batch every game of a day. The player's own claim is the fallback.

**Option A (fallback, Nums).** `purchase` also freezes `mean` (the EMA at that moment) into the game's terms.
`record` computes the payout against it, mints at once, and pushes the score into the EMA. There is no settle
transaction and no day state, but the closing move pays the mint.

### Where the referral 5 % comes from

| | From the margin (recommended) | From the burn |
|---|---|---|
| Burn of a referred purchase | 70 % (D-10 holds on every purchase) | 65 % |
| Vault income of a referred purchase | 25 % instead of 30 % (stakers' yield -16.7 % on that purchase) | 30 % |
| Reward of a referred game | the same as any game: `R` follows the 70 % burn | 7.1 % lower (`R` follows a 65 % burn) |
| Self-referral (a second address) | a 5 % rebate taken from the stakers | about neutral for the player: +5 % in USDC, -4.5 % of expected reward value (`0.05 x 0.95^2`) |
| Calibration | one curve for every game | the same curve, a smaller `R` |
| Nums, Glitchbomb | the same (the bundle pays the referrer before the game gets the funds) | |

The recommendation is the margin. It keeps D-10's "70 % of the price swapped and burned on each purchase" to the
letter, the reward of a game does not depend on who referred it, and it is what Nums and Glitchbomb do. Its cost is
on the stakers: 5 points of price on every referred purchase. A player who refers themself from a second address
takes those 5 points. A referrer must be a registered Paved player (`Account`) other than the payer, which stops the
trivial case only.

Taking the referral from the burn would make self-referral pointless and keep the stakers whole, but it changes the
burn rate D-10 fixed. It is the PM's ruling, and the owner's if the 70 % is to read "70 % minus referrals".

## 2. The reward curve, the supply factor, the stake and the mean

### The curve with its cliff

With `x = score / mean`:

```
h(x) = 0                                  if x < 1 + sigma        (the whole stake is lost)
h(x) = min(c x x / (1 + sigma), H)        otherwise
payout = R x h(x)                          (PAVED base units)
```

- `sigma` (bps on chain) is the **profitability shift** of the threshold: the cliff is at `(1 + sigma) x mean`.
- `c` is the slope. At the threshold the player gets `c x R`, and at twice the threshold `2c x R`.
- `H` caps the reward of one game at `H x R`, which bounds the mint per game whatever the score. The cap is a safety
  net and rarely binds: the 99th percentile of `h` is about {{P99H}}.

On chain, with integers: `threshold = mean x (10_000 + sigma_bps) / 10_000 / 1_000` (points, rounded down);
`payout = min(R x c_bps x score / (threshold x 10_000), R x H)`; 0 if `score < threshold`. `R` fits in a `u128`
(1e6 PAVED is 1e24 base units). The product `R x c_bps x score` is computed in `u256`.

The linear shape is a choice. Nums' curve is convex for an 18-slot game. Paved's scores are sums of closed
structures, already spread out (section 3). A convex curve on top would put most of the mint into a few games and
hurt the median player, whose return is already 0 below the mean. It would also make `E[h]` depend on the tail of
the distribution, which is where the sample is thinnest. Nums' Jensen trap applies too: its curve mints about 1.6x
the burn at the mean on its own legacy distribution.

### What "profitability-shifted" means here

D-10 asks for a threshold shifted from the mean by profitability. The Monte-Carlo shows that **the house's
profitability does not depend on the shift**. In steady state the supply factor brings the mint back to the burn,
and the player's expected return is `burn x (1 - fee)^2 = 0.7 x 0.95^2 = 63.2 %` of the price, whatever `sigma`,
`c` or `H` are (section 3). The shift decides how many games lose everything, and `c` how much the others get.
Proposed values:

- `sigma = 0`: the threshold is the mean. {{BELOW0}} of the sampled games are below it. Negative shifts (a
  threshold under the mean) lose fewer games and pay them less; positive shifts the reverse. Table in section 3.
- `rho = E[h] = 0.9` on the sample, which gives `c = {{SLOPE}}`. `rho` sets where the supply settles, not the edge:
  `S* = T x (2 - 1/rho_eff)`, with `rho_eff = rho x E[k(1+k/100)] / E[k]`. That is about {{SSTAR}} with the stake
  mix of the simulation, a mild deflation from the initial 1,000,000.
- `H = 5`.

### The supply factor (Nums, #181's curve)

`F = (2T - S) / T`, clamped to `[0, 2]`, in bps:

- 2x when the supply is 0;
- 1x at the target `T`;
- 0 at `2T` and above.

`S` is `PavedToken.total_supply()` read at the purchase after the burn. `F` is frozen into `R`, so a game keeps the
terms it was bought under (#181's "multiplier fixed at spawn"). Proposed `T = 1,000,000 PAVED`, the initial supply,
as in Nums.

This is the only feedback that holds the token supply. The simulation keeps it bounded in every scenario. A target
of 500k shows what a lower target does: the supply settles near 470k and the price climbs faster.

### The stake (Glitchbomb)

`P = k x 2 USDC` for `k` in 1..10, fixed at the purchase, with no discount. The reward is linear in the stake twice
over:

- through the burn: `k` units of price buy about `k` times the PAVED;
- through Glitchbomb's boost `1 + k/100` on `R`, which its own docs give as "tier 3 plays at 3.09x, tier 10 at 11x".

Glitchbomb computes the boost as `burn x price / base_price / 100` (`components/purchase.cairo:240-247`). That is the
same thing when `price / base_price = k` exactly, which holds here since there is no discount.

Glitchbomb's README describes a discounted price. Its code has none, and D-10 says no discount.

The boost adds up to 10 % to the mint of a stake-10 game. The supply factor absorbs it, at a slightly higher
equilibrium supply. If the PM reads "linear in the stake" as `R` proportional to the burn only, the boost is
removed: one constant, no other change.

### The mean (Nums' weighted EMA)

| Parameter | Nums | Proposed | Why |
|---|---|---|---|
| Weight of a game | `multiplier / 1e6`, truncated (a paid game under 1x counts 0) | the stake `k` (1 to 10) | the same intent, without the truncation |
| Initial mean | 10 (mainnet) | the calibration mean of the sample, {{MEAN}} points, set at deploy | an initial mean far off only costs the first days (the cumulative phase converges) |
| Initial weight | 100 | 100 | |
| Max weight | 1,000 | 1,000 | an EMA step of `k / 1,000` |
| Min score | 5 | 100 | a game abandoned or surrendered at 0 does not pull the mean down |
| Clamp | none | a score enters at most as `4 x mean` | one outlier (a bot, a bug) cannot move the mean by more than `4k/1,000` |
| Min time between updates | 1 s, but `last_updated` is never written (a Nums bug) | none | every update is paid for; a time guard adds nothing |
| Admin override | `set_average_score` | none | a setter on the mean is a lever on every payout |

Update, as Nums (`models/config.cairo:257-287`):

- While the total weight `W < 1,000`: `sum += s x w'` and `W += w'`, with `w' = min(w, 1,000 - W)`.
- Then: `sum += w x s - w x sum / W`.
- The mean is `sum / W`, stored x 1,000.

In option B the EMA moves once per day, by the day's own mean with the day's weight. It is the prior for the next
day, and the mean in option A.

## 3. Calibration: the Monte-Carlo

### The sample

**What it is.** {{N}} whole Daily games (38 tiles, real draws, real placements), played on the contracts by bots:

| Bot | What it does |
|---|---|
| greedy | the bot of the full-deck golden (P5-6): the legal position with the most neighbours, a character on the first area that takes one |
| noisy | the same, but a random choice among the positions with the most neighbours (two seeds a day) |
| novice | a random legal position, a character on half of the moves |
| bare | greedy, never a character (5 games, a check) |

The days are 11 to {{LASTDAY}}, each a different deck.

**How it was played.** A test placed outside this PR (`scripts/montecarlo/sampler.cairo`, a copy of the
`test_full_deck_generate` bot with these strategies) plays one game per `snforge` run, as `OPERATIONS.md` requires
for game generation. The run reads the day, the strategy and the seed from the environment. The greedy bot on day
10 reproduces the golden's 3,554 exactly, which validates the harness.

Each run measured about 20 s and 4.6 to 5.0 GB peak RSS on the VPS (scarb 2.20.1, snforge 0.64.0,
`RAYON_NUM_THREADS=1`, `prlimit --as=8589934592`, `--max-n-steps 200000000`).

The output is `scripts/montecarlo/scores.csv`.

**Its limits.** Say them before the figures:

- The players are bots, not people. The three kinds bracket a skill range (novice to greedy) but no human
  distribution. Real players may plan ahead, which none of the bots do.
- The goldens are not in the sample, except the full-deck one (3,554, reproduced). The other goldens are cut decks
  (5 to 11 tiles) with forced plans, and their scores say nothing about a whole game.
- No devnet games were played. The bots run the same contract code on snforge, which is what devnet would run, at
  a fraction of the cost.
- The sample is too small for the tail. With {{N}} games, the 99th percentile of the score rests on a handful of
  games, hence the cap `H`.
- The model has no outside trader. Every player sells their whole reward at once, and nobody else trades the pool,
  so the pool price drifts up (`price end / start` in the tables). This shows the buy pressure; it is not a forecast.
- Players are modelled as sequential and independent; a real day's games overlap.

**The calibration must be redone on real games before any non-local deploy.** The first devnet or testnet players
give the distribution, and `c`, `sigma` and `mean0` are re-derived with the same script (PR E4, section 8).

### Script and output

`python3 -I scripts/montecarlo/sim.py` (standard library only, fixed seeds, about 20 s). It prints the tables
below; `scripts/montecarlo/output.md` is its committed output for the sample.

What it models, per game:

- the purchase: stake drawn from the stake mix, referral with probability 0.5;
- the swap of `0.7 P` in a constant-product pool (initial 800,000 PAVED and 10,000 USDC, Nums' launch LP) with a
  5 % fee on the input;
- the burn, and the supply factor read after it;
- the game: a score drawn from the bot of that kind, on a day drawn from the sample;
- the reward minted and sold back to the pool;
- the mean (option A or B).

Each run is 365 days of 200 games. Population: 25 % greedy, 50 % noisy, 25 % novice. Stake mix: `P(k)` proportional
to `1/k`.

### Results

{{RESULTS}}

### What the figures say

{{READING}}

## 4. The Vault

**Recommended: a simple staking vault, not Nums' ERC4626.**

Nums' Vault (`systems/vault.cairo`, 445 lines plus 300 of components and models) is an OpenZeppelin ERC4626 over NUMS
with a transferable share token `vNUMS`, `Votes` for governance, and a USDC reward-per-share accumulator settled in
the ERC20 `before_update` hook. It also has roles (provider, collector, keeper, pauser, admin; the deployer keeps
`DEFAULT_ADMIN_ROLE` "for test purpose"), an exit fee, open/close and pause. Its mainnet `vault_percentage` is 0.

Paved needs none of the share-token features:

- no governance;
- D-10 gives the margin to the stakers, so nothing else reads the shares;
- no team share, so no admin to withdraw.

A transferable share also brings the share-inflation attack of a first depositor and transfer settlement into the
audit.

`Vault`:

| Entry | Who | What |
|---|---|---|
| `stake(amount)` | anyone | pulls PAVED (`transferFrom`), settles the caller's pending USDC first, adds to their stake |
| `unstake(amount)` | the staker | settles, returns PAVED |
| `claim()` | the staker | pays the caller's pending USDC |
| `pending(account)`, `staked(account)`, `total_staked()` | view | |

USDC dividends work as follows:

- `acc` is a reward per staked unit, scaled by 1e36 as in Nums.
- Before any action, the Vault **syncs**: `new = USDC.balance_of(this) - accounted`. If `total_staked > 0`, then
  `acc += new x 1e36 / total_staked` and `accounted += new`.
- A staker's pending amount is `stake x (acc - acc_at_last_settle) / 1e36`.

**There is no `pay` entry point and no role.** `Economy` just transfers the margin to the Vault, and anyone may add
USDC the same way, which is a donation. This avoids Nums' `pay` revert on an empty vault (`rewardable.cairo:142`),
which would block every purchase. USDC that arrives while nobody stakes waits in the balance for the first staker;
the owner can avoid that by staking at launch (the owner's act, as Nums' 200k locked).

The Vault has no owner, no setter, no pause and no upgrade. Its only parameters are the two token addresses, set in
the constructor. Lockup and exit fee: none. Dividends arrive per purchase, a few USDC at a time, so staking just
before a purchase earns only that purchase's pro-rata share; a lockup would buy nothing.

What reverses the recommendation: the owner wants a transferable or tradable share (an LP of vPAVED, governance).
Then Nums' ERC4626 is ported, with its roles cut to none and its accumulator kept.

## 5. Swap and LP

**Mainnet: Ekubo**, as Nums. `Economy` calls the Ekubo router as Nums' `purchase.cairo:139-176` does:

1. transfer `q` USDC to the router;
2. `swap(RouteNode { pool_key, sqrt_ratio_limit, skip_ahead: 0 }, TokenAmount { token: USDC, amount: i129 { mag: q, sign: false } })`;
3. `clear_minimum(PAVED, min_out)` (the PAVED comes back to `Economy`, at least `min_out` or the call reverts);
4. `clear(USDC)` (any unswapped USDC comes back and joins the margin).

The interfaces are declared locally in `contracts/src/economy/ekubo.cairo`, ABI-compatible (`PoolKey { token0,
token1, fee: u128, tick_spacing: u128, extension }`, `i129 { mag: u128, sign: bool }`, `RouteNode`, `TokenAmount`,
`Delta`, `IRouter.swap`, `IClear.{clear, clear_minimum}`). This takes no git dependency on Ekubo, in the spirit of
O-1. Check Ekubo's licence on the declarations before the PR.

- Router address, pool key (PAVED/USDC, fee `0.05 x 2^128` = `0xccccccccccccccccccccccccccccccc`, Nums' tick
  spacing `0x56a4c` for that fee, extension 0 unless the owner picks one) and `sqrt_ratio_limit` (the extreme bound
  for the swap direction) are constructor arguments of `Economy`. A setter for the pool is in section 6.
- **Slippage.** Nums and Glitchbomb pass a minimum of 0 and an extreme price limit: their swap is sandwichable.
  Here the player passes `min_out`. The client quotes the pool and sends `quote x (1 - 1 %)`. The player is the one
  who loses from a bad price, since their `R` follows `b`.
- **Price guard (self-sandwich).** A player can push the PAVED price down before their own purchase, by selling
  PAVED into the pool. Their burn then buys more PAVED, so their `R` and their reward grow. They buy back
  afterwards. Their cost is the pool fee on both legs.
  - In a constant-product pool with `U` USDC of depth, halving the price costs about `0.1 x 0.29 U` in fees. It
    doubles `R`.
  - At stake 10 and the cap `H = 5`, the gain is at most about 63 USDC. The attack pays when `U < ~2,200 USDC`.
  - The guard: `Economy` keeps an EMA of the swap rate (PAVED per USDC, weight 1/32 per purchase), and the `R` of a
    purchase counts at most `q x rate x 1.10` PAVED. One manipulated purchase gains at most 10 %, and moving the EMA
    takes many purchases, each paying the fee. With a launch LP like Nums' (10,000 USDC) the attack does not pay even
    without the guard. The guard covers a thinner pool.
- **LP fee.** 5 % of every swap's input stays in the pool, for the LP position's holder. That is the owner's choice
  (D-10 gives the margin to the stakers; the LP fee is not margin). Nums sends its LP fees to its treasury.

**Devnet: a mock, never a real router.** `MockRouter` (test and devnet only, like the `Token` mock, O-22) implements
the same three entry points over its own constant-product reserves with the 5 % fee. `scripts/deploy.sh devnet`
seeds it with 800,000 PAVED from the initial supply and 10,000 MockUSDC (6 decimals, faucet). The deploy script
refuses `MockRouter` and `MockUSDC` on any non-local network, as it refuses the mock `Token` today.

## 6. Contracts and class headroom

### Contracts

| Contract | Holds | Deployed? | Size (CASM felts, release) |
|---|---|---|---|
| `Daily` | the game; `spawn(stake, referrer, min_out)`; storage gains the `Economy` address (constructor) | yes | **72,607, measured** on a prototype (main 72,424, +183; 88.6 %; margin to 90 %: 1,121) |
| `Tutorial` | unchanged behaviour (free); its call to `Lobby.spawn` passes zeros | yes | 66,704, measured (+15) |
| `Lobby` | spawn: one `transferFrom`, one call to `Economy.purchase`; game over: one call to `Economy.record`; stops feeding the prize from entries | declared | 58,636 on main; about +1,000 (estimate; a prototype with heavier stubs measured +2,353) |
| `Economy` (new) | the split, the swap, the burn, the terms per game, the mean and the days, settlement and mint, the configuration, the views | yes | estimate 15,000 to 30,000 (20 to 37 %), measured in its PR |
| `PavedToken` (new) | OpenZeppelin ERC20, `mint` by `Economy` only, `burn` of one's own balance | yes | estimate 5,000 to 8,000 |
| `Vault` (new) | stakes in PAVED, dividends in USDC (section 4) | yes | estimate 5,000 to 8,000 |
| `MockRouter`, `MockUSDC` (new) | devnet and tests only | devnet only | estimate under 6,000 each |

Rule P-27 holds: **nothing is added to the move code of `Daily`**, and its paying path is outside the class.

`Daily` grows by 183 felts, measured:

| Part | Felts |
|---|---:|
| the three arguments of `spawn` (`u8`, `ContractAddress`, `u256`) through to `Lobby` | 182 |
| the game id passed to `Lobby.report` in `build` | 1 |

That growth goes back to the PM (P-27). Two variants were measured and rejected:

- the economy's configuration and views as `Daily` entry points: +1,253 felts, 89.9 %, a margin of 51;
- the economy's events in Paved's shared event enum: +1,409 felts, 90.1 %, above the line. Every contract that
  emits a Paved event pays for each new variant (`Account` +140).

Hence the events are `Economy`'s own, and the configuration and views live on `Economy`.

**How it was measured.** Main `f6545ba`, exported with `git archive` to a scratch folder outside the worktree.
Prototypes: `IDaily.spawn` with the three arguments, `ILobby.spawn` and `report` extended, stub event and
configuration code in `Lobby`. Built with `scripts/class-sizes.sh` (`scarb --release build`, `RAYON_NUM_THREADS=1`)
under `prlimit --as=8589934592`, peak RSS 1.5 GB. Nothing of the prototypes is committed.

### Access control

| Action | Who | Bounds |
|---|---|---|
| `PavedToken.mint` | `Economy` only | set once by the token's deployer (`set_minter`, one shot, then no admin remains); no upgrade |
| `PavedToken.burn` | any holder, of their own balance | |
| `Economy.purchase`, `Economy.record` | `Daily` only (its address, set once by the owner, `set_game`, one shot) | |
| `Economy.settle` | anyone | mints only to the game's player, once per game, after its day |
| `Economy.configure` | `Economy`'s owner (the programme's owner) | `BURN_BPS` 5,000 to 9,000; `sigma` -3,000 to +5,000 bps; `c` 0.1x to 5x; `H` 1 to 20; `T` 100,000 to 10,000,000 PAVED; applies to the next purchase only (terms are frozen); `EconomyConfigured` event |
| `Economy.set_pool` | owner | a pool key on the same two tokens only; event |
| The mean | nobody | no setter (Nums' `set_average_score` is dropped) |
| `Vault` | nobody | no owner |
| Margin | `BURN_BPS` decides it: the margin is the rest, all to the Vault | no team address exists anywhere |

The owner's setters on `Economy` do not add a new class of trust. The owner can already upgrade `Daily`. They are
bounded and evented so that a mistake is visible and limited.

#181's flaws (R-5), and what each becomes here:

| #181's flaw | Here |
|---|---|
| open configuration | owner-only, bounded configuration |
| open mint | one minter, set once |
| first-caller admin | owner from the constructor; `set_game` and `set_minter` are one shot by the deployer |
| supply mirror | the real `total_supply` |
| locked stakes | `Economy` holds nothing between transactions |
| prize theft by id collision | terms keyed by `Daily`'s game id, written once by `purchase` |

### Events

`Economy` emits its own events, from its own address:

| Event | Keys | Data |
|---|---|---|
| `Purchased` | `game_id`, `player_id` | `day`, `stake`, `price`, `referrer`, `referral`, `burned_quote` (`q`), `burned` (`b`), `margin`, `supply`, `factor`, `reference` (`R`) |
| `Recorded` | `game_id` | `score`, `in_day` |
| `DayClosed` | `day` | `mean`, `weight`, `prior`, `ema_after` |
| `Settled` | `game_id`, `player_id` | `day`, `score`, `threshold`, `reward` |
| `EconomyConfigured` | | every parameter |
| `PoolSet`, `GameSet` | | |

`Daily`'s events are unchanged. `GameSpawned.price` stays the mode's base price. The paid price, stake and referral
are in `Purchased`, joined by `game_id`.

The indexer reads three contracts today and halts on an unknown selector from them. `Economy` is a fourth address,
so the indexer change (decode `Purchased`, `Settled`, `DayClosed`; per-player rewards in API v1) **comes in the same
lot as the contract**, per O-39's lesson.

### Effect on CLIENT

| Thing | After P8 |
|---|---|
| Entry | the player approves **`Daily`** on **USDC** for `k x entry_price().amount`, then `Daily.spawn(stake, referrer, min_out)`. The approval target is unchanged; the token is USDC (6 decimals) instead of the test token |
| `entry_price()` | same view, `token` = USDC, `amount` = the price of **one stake unit** (2,000,000). A meaning change for `amount` ("per stake unit"), written under "Changes since publication" in `public-interface.md` |
| Quote | `Economy.quote(stake) -> Quote { price, burn_quote, referral, margin, min_out_hint, factor, mean, threshold, slope, cap }` (a view on `Economy`, not `Daily`) |
| Running day | `Economy.day(day) -> DayView { prior, sum, weight, mean (if closed), closed }` |
| A game's terms | `Economy.terms(game_id) -> TermsView { stake, reference, day, score, settled, reward }` |
| Settlement | `Economy.settle(game_ids)`; the client offers it after the day, and the indexer lists the unsettled games |
| Prize | the daily top-3 prize no longer grows with entries (section 7): sponsor-only |
| Deployments | `contracts/deployments/<network>.json` gains `Economy`, `PavedToken`, `Vault` (and `MockRouter`, `MockUSDC` on devnet); `token` becomes USDC; ABIs `Economy.json`, `PavedToken.json`, `Vault.json` |

## 7. What #181 left, reused and avoided

From `docs/history/p1-removed.md` (recover with `git show 4778e18:<path>`):

| Piece | Reused? |
|---|---|
| `helpers/economy_curve.cairo`: `compute_multiplier_fp(supply, target)`, 2x at 0, 1x at target, 0 at 2x, reverts on target 0, with unit tests | **Yes**, as `F`, in bps instead of `FP = 1e6`, with its tests |
| Multiplier fixed at spawn (`entry_multiplier_fp`, `entry_supply_snapshot`, `entry_target_snapshot` stored with the game) | **The idea, yes**: the terms of a game (`R`, stake, day) are frozen at purchase, in `Economy`, not in `Game` (no growth of `Game` or of `Daily`) |
| `config_validation.cairo` (bounded runtime config, error codes, pure functions) | **The pattern**: `Economy.configure` validates its bounds in a pure function with unit tests |
| `models/economy.cairo`: `split_entry` (bps split team/burn), `target_at` (affine target in time) | `split_entry`'s arithmetic, without the team share; `target_at` is not needed (`T` constant) |
| `PayableComponent::{pay_split, burn_from_contract, mint}` | **No**: the split goes to three recipients through a swap; `Economy` does it |
| Token mock `mint_to`, `burn`, `record_mint`, `record_burn` | **No**: the supply mirror is the flaw D-10 forbids |
| `EntrySettlement` per game | The idea, as `Economy`'s terms |

Flaws avoided: the table in section 6. Also: #181 wrote the economy models from inside Daily's and Tutorial's spawn.
The P1 removal alone cut a Daily build by 2.7 % to 12.1 % (`baseline.md`). Here the move path does not touch the
economy at all.

## 8. Risks, audits and the PR plan

### Risks

| # | Risk | Mitigation |
|---|---|---|
| E-1 | **Predictable daily seed** (D-3, R-4): the day's deck is public, so the best line can be searched offline and replayed at stake 10. Measured: replayers get {{REPLAY}} of their price; at 10 % of the games the others drop to about half | **The owner's decision**: a seed nobody knows before the purchase (Cartridge VRF on mainnet, a mock on devnet) before a paid game leaves devnet. Option B already blends the replayers into the day's mean, which limits them as their share grows |
| E-2 | **Day effect**: one deck per day; the mean score moves {{CV}} from day to day | Option B (the day's own mean). With option A, the share of a day's games lost spans {{LOSTA}} |
| E-3 | Bot sample, not players | Recalibrate on the first real games (PR E4); `c`, `sigma`, `H`, `T` are configurable within bounds |
| E-4 | Thin pool or self-sandwich | `min_out` from the player; the rate guard (+10 %); a launch LP of at least ~10,000 USDC (the owner's act) |
| E-5 | `Daily` at 88.6 % after P8 (1,121 felts to 90 %) | P8 adds nothing more to `Daily`; growth of the move code goes to the PM (P-27); fallbacks (a) or (c2) of `class-headroom.md` |
| E-6 | Self-referral through a second address takes 5 % from the stakers | Accepted with the margin option; the burn option removes it (section 1) |
| E-7 | USDC that arrives while nobody stakes goes to the first staker | The owner stakes at launch |
| E-8 | New dependency: an OpenZeppelin ERC20 (`openzeppelin_token`, pinned to a published version that builds with Scarb 2.20.1) | The PM decides; the alternative is our own ERC20, as the mock's |
| E-9 | Ekubo interface drift | Local ABI-compatible declarations; a fork test against the mainnet router before the owner's mainnet go |
| E-10 | A paid game of skill with token rewards may be regulated in places | Out of this track's scope; for the owner |

### Audits (OPERATIONS)

"Any change that mints, burns, holds or pays tokens" (P8) calls for **security and economy lenses**. Each PR below
says which.

- **Security** points:
  - mint authority (one minter, set once);
  - `Economy`'s caller check (`Daily` only, set once);
  - nothing held between transactions;
  - reentrancy across `transferFrom`, the router and the token;
  - the library-call context of `Lobby` (caller and contract address);
  - the Vault accumulator (rounding, the first staker, a sync before every action);
  - the bounds of `configure`;
  - the deploy script's refusal of the mocks.
- **Economy** points:
  - the curve and its calibration against the committed sample;
  - the equilibrium of the supply factor;
  - the price guard and the self-sandwich cost;
  - the referral source;
  - option A versus B and its fairness by day;
  - the replay exposure (E-1).

### PR plan

Not stacked: each one branches from main and targets main.

**E1. `PavedToken`, `Vault` and the devnet mocks.**
- Goal: the token, the vault, `MockUSDC` (6 decimals, faucet) and `MockRouter` (constant product, 5 % fee, Ekubo's
  three entry points), with unit tests. No game change.
- Allowlist:
  - `contracts/src/economy/{token,vault,ekubo}.cairo` and `contracts/src/mocks/{usdc,router}.cairo` (new);
  - `contracts/src/lib.cairo`; `contracts/Scarb.toml` (OpenZeppelin, if ruled), `contracts/Scarb.lock`;
  - their tests under `contracts/src/tests/`;
  - `contracts/abis/{PavedToken,Vault}.json` and `scripts/abis.sh`.
- Acceptance:
  - `PavedToken` name, symbol and decimals, and the initial 1,000,000 to the recipient;
  - `mint` reverts for anyone but the minter, and `set_minter` reverts a second time;
  - Vault: dividends pro rata over several stakers in sequence (an exact table), the sync before stake and unstake,
    no loss of dust above `1e-36` per unit;
  - `MockRouter` matches the constant-product formula with the fee;
  - class sizes printed.
- Audit: security and economy (token, vault).

**E2. `Economy` alone.**
- Goal: the purchase split, the swap through the Ekubo interface, burn, `R`, the price guard, record, the day
  accumulator, settle and mint, the EMA, configure, the views and the events. It is tested against `MockRouter`, with
  a test double standing in for `Daily`.
- Allowlist:
  - `contracts/src/economy/{economy,curve,mean}.cairo` (new) and their tests;
  - `contracts/abis/Economy.json`, `scripts/abis.sh`.
- Acceptance:
  - unit tests of `h` against the formulas above, of `F` (#181's table), of the EMA (Nums' update, with the clamp and
    the min score) and of the day mean;
  - a purchase's split adds up to `P` exactly, and `Economy`'s balance is 0 after every call;
  - `settle` is once per game, only after the day, and only for recorded games;
  - an end-to-end check of the Monte-Carlo's formulas: the same inputs give the same `R` and payout as
    `scripts/montecarlo/sim.py` (a fixture table).
- Audit: security and economy.

**E3. Wiring: `Daily`, `Lobby`, deploy, indexer.**
- Goal:
  - `Daily.spawn(stake, referrer, min_out)` and `Lobby.report(game_id, over)`;
  - `Lobby` calls `Economy`;
  - the entry no longer feeds the prize;
  - `scripts/deploy.sh devnet` deploys and wires everything;
  - the indexer decodes the new events.
- Allowlist:
  - `contracts/src/systems/{daily,lobby,tutorial}.cairo`, `contracts/src/components/hostable.cairo`,
    `contracts/src/types/mode.cairo`, `contracts/src/constants.cairo`;
  - test setups and e2e tests, `contracts/tests/gas.cairo`;
  - `scripts/deploy.sh`, `contracts/deployments/{README.md,devnet.json}`, `contracts/abis/{Daily,Tutorial}.json`;
  - `packages/indexer/**` (the decoders and the API fields);
  - `docs/architecture/public-interface.md`, `docs/measures/baseline.md`.
  - The CLIENT files that read the entry (`packages/chain/src/...`) only if CLIENT agrees, as P-21.
- Acceptance:
  - goldens identical;
  - a0 to f within +0.1 % of main;
  - `Daily` at most 72,607 felts (the prototype);
  - every class at most 90 %;
  - gas of spawn and of the closing moves measured and reported, with the cause stated;
  - a devnet smoke check that buys, plays the Tutorial, and settles a paid game on a later day;
  - the indexer's devnet scenario passes with the new events.
- Audit: security and economy.

**E4. Calibration on real games.**
- Goal: refresh `scores.csv` with devnet or testnet games played by people; re-derive `c`, `sigma`, `mean0`; set
  them by `configure`.
- Allowlist: `scripts/montecarlo/**` and this document.
- Audit: economy.

**CLIENT** (their track, through the PM): the stake selector, the USDC approval, the quote, the settle button and the
Vault screens.

### Decided here, and what would reverse it

| Decision | Reverse |
|---|---|
| Referral from the margin | The PM rules the burn (section 1) |
| Option B (the day's mean, settle after the day) | The PM prefers Nums' immediate mint (option A, same contract minus the day state) |
| Glitchbomb's boost `1 + k/100` kept | The PM reads "linear" as the burn alone |
| A linear curve above the cliff, `sigma = 0`, `rho = 0.9`, `H = 5`, `T = 1,000,000` | E4's calibration, or the PM's ruling on the table of section 3 |
| A simple staking Vault | The owner wants a tradable share |
| Ekubo interfaces declared locally | A published Ekubo package by version, if allowed |
| Configuration and views on `Economy`, not `Daily` | None: the `Daily` variant was measured at 89.9 % |

### For the owner

- **D-3** (randomness, theirs): paid Daily games with the predictable daily seed are exploitable by replay (E-1).
  Recommendation: a seed revealed only after the purchase (VRF) before any paid game outside devnet.
- **The owner's acts**, unchanged by this design: deploying PAVED on a public network and distributing the initial
  1,000,000; creating the Ekubo pool and funding its LP (Nums: 800,000 PAVED and 10,000 USDC); who holds the LP
  position and its 5 % fees; staking at launch.
