# Economy (P8, design, ruled by the PM: P-31)

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

## Rulings (P-31, 2026-10-09)

The project manager ruled every open point of this design on 2026-10-09 (P-31). Each one below is **DECIDED**; the
sections that follow give the reasons and the figures.

| # | Point | DECIDED (P-31, 2026-10-09) | What would reverse it |
|---|---|---|---|
| 1 | Referral | The 5 % comes from the **margin**; the 70 % burn holds on every purchase (section 1) | The PM rules the burn |
| 2 | Curve | As proposed: `sigma = 0`, `rho = 0.9` (`c = 1.813` on today's sample), `H = 5`, `T = 1,000,000`, Nums' supply factor; Glitchbomb's boost `1 + k/100` **kept** (the owner asked for it, D-10) (section 2) | E4's recalibration on real games, or the PM |
| 3 | Mean | Weighted EMA: weight = stake, min score 100, max weight 1,000; 4x clamp; a push's weight capped at the max weight; no admin setter (section 2) | The PM |
| 4 | Settlement | **Option B**: after the day, against the day's mean blended with the EMA; option A stays documented as the fallback (section 1) | The owner wants the payout at game over (then option A) |
| 5 | Contracts | As proposed (section 6): `Economy`, `PavedToken` (minted by the game only, the real `total_supply`), a simple no-owner staking `Vault`, Ekubo interfaces declared locally, `MockRouter` and `MockUSDC` on devnet only, `Lobby` makes the calls. Entries no longer feed the daily top-3 prize, which is **sponsor-only**. **OpenZeppelin for `PavedToken`: yes, a published version pinned exactly** | The PM |
| 6 | Class headroom | `Daily` +183 felts (72,607, 88.6 %) with the move code unchanged: **OK under P-27** (section 6) | Any further growth of `Daily` goes back to the PM |
| 7 | NFTs | As proposed (section 9): soulbound `Collection`, mint at spawn from `Lobby`, JSON `token_uri`, transfers revert; spawn +838k (Daily) / +845k (Tutorial) **accepted**; wallet display checked at the first public deploy | The owner (D-11b) |
| 8 | PR plan | E1 to E5 (section 8), with the security and economy audits | The PM |

**The owner's answers** (2026-10-09) to the two questions P-31 recorded:

- **The structural house edge: accepted (D-12).** D-10's numbers (70 % burn, 5 % pool fee) give players back about
  63 % of what they pay in the long run, a house edge of about **37 %** (`1 - 0.7 x 0.95^2`, measured 37.0 % to
  37.3 %, section 3). The curve parameters do not change it. Only the burn share or the fee does. D-10's numbers
  stand.
- **The predictable seed with paid games: kept for now (D-13).** Replaying the day's best known line pays 1.31x to
  1.36x (section 3, E-1). The owner keeps the predictable daily seed, paid games included. A VRF may come back
  later, so E3 still puts the seed behind the `SeedSource` interface (section 8, "Seed source"). With it, a VRF or a
  seed revealed after the purchase can replace the daily seed without touching the move code.

D-13 lifts the seed gate on paid games leaving devnet. The other gates stay: see "Gates before a paid game leaves
devnet" in section 8.

## Summary

- **Where the money goes.** For a purchase of stake `k`, the price is `P = 2k` USDC.
  - 70 % (`0.7 P`) is swapped to PAVED through Ekubo and burned.
  - The rest goes to the Vault in USDC: 30 %, or 25 % when the player came with a referrer, who gets 5 %.
    **DECIDED (P-31): the referral comes out of the margin**, so the 70 % burn of D-10 holds on every purchase.
  - The pool keeps its 5 % fee on the swapped USDC.
  - At settlement the game **mints** PAVED to the player: `R x h(score / mean)`. Here `R` is the PAVED burned for
    that game, times the stake boost `1 + k/100` (Glitchbomb), times Nums' supply factor `F = 2 - S/T`.
- **The curve.** `h` is 0 below the threshold `(1 + sigma) x mean`, where the whole stake is lost. Above it, `h` is
  linear in the score, `c x score / threshold`, capped at `H`.
  - DECIDED (P-31): `sigma = 0`, so the threshold is the mean.
  - `c` is calibrated so that `E[h] = rho = 0.9` on the score sample. That gives `c = 1.813` today.
  - DECIDED (P-31): cap `H = 5`, `T = 1,000,000`, and Glitchbomb's boost `1 + k/100` kept.
- **The mean.** Nums' weighted mean: weight = stake, scores under 100 left out, cumulative up to a weight of 1,000,
  then an EMA. Two additions: a clamp at 4x the mean, and the initial mean taken from the calibration.
  - **DECIDED (P-31), option B: each game is settled against the mean of its own day**, blended with the EMA as a
    prior of weight 100. Settlement is one permissionless transaction once the day is over. The reason: every player
    of a day plays the same deck, and the day's deck moves the mean score by **50 to 55 %** from one day to the next
    (measured).
  - The fallback (option A, Nums) freezes the EMA at the purchase and mints at game over. It is simpler, but on
    hard days everyone loses: up to 100 % of the games of a day in the simulation.
- **What the Monte-Carlo shows.** It ran on 205 whole Daily games played by bots on the contracts. Real players
  are not in it: these are the limits of the sample.
  - **In steady state the supply factor drives the mint to equal the burn**: mint / burn is 0.99 in the base runs (0.95 to 1.02 across the runs). The house
    edge is then structural: `1 - 0.7 x 0.95^2 = 36.8 %` (30 % margin, plus the pool fee on the buy and on the
    player's sale), measured 37.0 % (option B) and 37.3 % (option A).
  - Of `sigma`, `rho` and `H`, none moves the edge. They only decide **who** loses and where the supply settles:
    `S* = T (2 - 1/rho_eff)`.
- **Contracts.** The paying logic lives in its own contracts: `PavedToken`, `Economy` (purchase split, swap, burn,
  terms, mean, settlement, mint) and `Vault` (stake PAVED, earn USDC; **simpler than Nums' ERC4626**; DECIDED, P-31).
  - Devnet only: `MockUSDC` and `MockRouter`.
  - `Lobby` gains a few lines: one `transferFrom` and one call to `Economy` at spawn, one call at game over.
  - **`Daily` grows by 183 CASM felts** (measured on a prototype): the three new arguments of `spawn` and the game id
    passed to `Lobby.report`. It goes from 72,424 to 72,607 (88.6 % of the cap), and nothing in the move code
    changes. That growth is accepted under P-27 (P-31).
- **Games as NFTs** (D-11, amended D-11b: every game NFT is soulbound). There is a separate `Collection`
  contract. It mints the game's token to the player at spawn, from `Lobby`, and serves on-chain JSON metadata. It
  refuses every transfer and approval. Measured on a prototype:
  - `Daily` and `Tutorial` are unchanged to the felt, and so is the gas of every move (a0 to l);
  - a spawn costs **+837,910 L2 gas** (Daily, +2.0 %) and +844,700 (Tutorial, +18.5 %);
  - `Collection` is 13,070 CASM felts (16 %).

  The player, the leaderboard, the quests and "my games" are unchanged. The indexer reads only the mints. Section 9.
- **The predictable daily seed makes a paid Daily exploitable.** The owner keeps it for now (D-13, 2026-10-09).
  - The day's deck is public, so a player can find the day's best line offline and replay it at stake 10.
  - Measured in the simulation: such "replayers" get back 1.31x to 1.36x of what they pay, while everyone else drops to
    about half.
  - The seed stays behind `SeedSource` (E3), so that a VRF can replace it later.

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
that ends the game calls `Lobby.report`. `Lobby` calls `Economy.record(game_id, score)`.

**A paid game expires 24 h after its purchase (P-34, PM, 2026-10-09; Nums' expiry).** The terms store the purchase
time.
- A `record` before `purchase_time + 86400` stores the score. If `score >= MIN_SCORE`, the game also enters the
  accumulator of its **purchase** day (`sum k x min(score, 4 x prior)`, `sum k`), even when it ends after
  midnight.
- A `record` at or after `purchase_time + 86400` records the game as **expired**: its reward is 0 (the stake is
  lost), and its score enters no mean.

The leaderboard keeps its own rule (`end_in_tournament`). The economy no longer depends on it, and `record` has no
`in_day` argument (P-34).

`Lobby.report` today carries only the tally, so the game id is added as an argument (one felt in `Daily.build`,
measured: +1 CASM felt). A game that never ends is never settled: its stake is lost, and its burn has already
happened.

### Settlement and mint

**Option B (DECIDED, P-31).** Day `D` settles only once every game of `D` has ended or expired (P-34). The last
purchase of `D` expires before `(D + 2) x 86400`, the end of `D + 1`. From that time, anyone calls
`Economy.settle(game_ids)`, and an earlier call reverts. For each game that is recorded and not yet settled:

1. On the day's first settlement, its mean is fixed:
   `mean_d = (W_p x prior_d + sum k x s') / (W_p + sum k)`.
   - `prior_d` is the EMA as of the day's first purchase, stored then.
   - `W_p = 100`.
   - The day is folded into the EMA once, as one push of `(sum k x s' / sum k, sum k)`.
2. `payout = R x h(score / mean_d)` (section 2), or 0 for an expired game.
3. If it is non-zero, it is minted: `PavedToken.mint(player, payout)`. Only `Economy` is a minter.
4. `Settled` is emitted.

The indexer, a keeper or the client can batch every game of a day. The player's own claim is the fallback. A
keeper should settle each day `D` just after `(D + 2) x 86400`: a day's prior is the EMA at its first purchase, and
day `D` enters the EMA only at its first settlement. So day `D + 2`'s prior includes day `D` only if `D` was
settled before `D + 2`'s first purchase. Day `D + 1`'s prior never includes day `D`, since `D + 1` starts before
`D` can close (E-2).

No view shows a day's sum, weight or mean before the day closes (P-34): `day()` returns them as 0 until then. The
prior, the running EMA and `quote`'s mean and threshold stay visible.

**Option A (fallback, Nums).** `purchase` also freezes `mean` (the EMA at that moment) into the game's terms.
`record` computes the payout against it, mints at once, and pushes the score into the EMA. There is no settle
transaction and no day state, but the closing move pays the mint.

### Where the referral 5 % comes from

| | From the margin (DECIDED, P-31) | From the burn |
|---|---|---|
| Burn of a referred purchase | 70 % (D-10 holds on every purchase) | 65 % |
| Vault income of a referred purchase | 25 % instead of 30 % (stakers' yield -16.7 % on that purchase) | 30 % |
| Reward of a referred game | the same as any game: `R` follows the 70 % burn | 7.1 % lower (`R` follows a 65 % burn) |
| Self-referral (a second address) | a 5 % rebate taken from the stakers | about neutral for the player: +5 % in USDC, -4.5 % of expected reward value (`0.05 x 0.95^2`) |
| Calibration | one curve for every game | the same curve, a smaller `R` |
| Nums, Glitchbomb | the same (the bundle pays the referrer before the game gets the funds) | |

The margin was recommended and is DECIDED (P-31). It keeps D-10's "70 % of the price swapped and burned on each purchase" to the
letter, the reward of a game does not depend on who referred it, and it is what Nums and Glitchbomb do. Its cost is
on the stakers: 5 points of price on every referred purchase. A player who refers themself from a second address
takes those 5 points. A referrer must be a registered Paved player (`Account`) other than the payer, which stops the
trivial case only.

Taking the referral from the burn would make self-referral pointless and keep the stakers whole, but it changes the
burn rate D-10 fixed. **DECIDED (P-31, 2026-10-09): the margin.**

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
  net and rarely binds: the 99th percentile of `h` is about 4.6 on the sample (0.0 % of the games reach the cap of 5).

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
Values, DECIDED (P-31, 2026-10-09):

- `sigma = 0`: the threshold is the mean. 69 % of the sampled games are below it. Negative shifts (a
  threshold under the mean) lose fewer games and pay them less; positive shifts the reverse. Table in section 3.
- `rho = E[h] = 0.9` on the sample, which gives `c = 1.813`. `rho` sets where the supply settles, not the edge:
  `S* = T x (2 - 1/rho_eff)`, with `rho_eff = rho x E[k(1+k/100)] / E[k]`. That is about 947,000 in the limit (`rho_eff` = 0.95; 901,000 after the simulated year) with the stake
  mix of the simulation, a mild deflation from the initial 1,000,000.
- `H = 5`.

### The supply factor (Nums, #181's curve)

`F = (2T - S) / T`, clamped to `[0, 2]`, in bps:

- 2x when the supply is 0;
- 1x at the target `T`;
- 0 at `2T` and above.

`S` is `PavedToken.total_supply()` read at the purchase after the burn. `F` is frozen into `R`, so a game keeps the
terms it was bought under (#181's "multiplier fixed at spawn"). DECIDED (P-31): `T = 1,000,000 PAVED`, the initial supply,
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
equilibrium supply. **DECIDED (P-31): the boost is kept**, as the owner asked (D-10). Removing it later is one
constant, no other change.

### The mean (Nums' weighted EMA)

| Parameter | Nums | DECIDED (P-31) | Why |
|---|---|---|---|
| Weight of a game | `multiplier / 1e6`, truncated (a paid game under 1x counts 0) | the stake `k` (1 to 10) | the same intent, without the truncation |
| Initial mean | 10 (mainnet) | the calibration mean of the sample, 3,353 points, set at deploy | an initial mean far off only costs the first days (the cumulative phase converges) |
| Initial weight | 100 | 100 | |
| Max weight | 1,000 | 1,000 | an EMA step of `k / 1,000` |
| Min score | 5 | 100 | a game abandoned or surrendered at 0 does not pull the mean down |
| Clamp | none | a score enters at most as `4 x mean` | one outlier (a bot, a bug) cannot move the mean by more than `4k/1,000` |
| Min time between updates | 1 s, but `last_updated` is never written (a Nums bug) | none | every update is paid for; a time guard adds nothing |
| Admin override | `set_average_score` | none | a setter on the mean is a lever on every payout |

Update, as Nums (`models/config.cairo:257-287`):

- While the total weight `W < 1,000`: `sum += s x w'` and `W += w'`, with `w' = min(w, 1,000 - W)`.
- Then: `sum += w x s - w x sum / W`, with `w` capped at the max weight (a step never weighs more than the whole
  mean; option B pushes a whole day at once, which can weigh more than 1,000, and without the cap the EMA diverges:
  the Monte-Carlo found it).
- The mean is `sum / W`, stored x 1,000.

In option B the EMA moves once per day, by the day's own mean with the day's weight. It is the prior for the next
day, and the mean in option A.

## 3. Calibration: the Monte-Carlo

### The sample

**What it is.** 205 whole Daily games (38 tiles, real draws, real placements), played on the contracts by bots:

| Bot | What it does |
|---|---|
| greedy | the bot of the full-deck golden (P5-6): the legal position with the most neighbours, a character on the first area that takes one |
| noisy | the same, but a random choice among the positions with the most neighbours (two seeds a day) |
| novice | a random legal position, a character on half of the moves |
| bare | greedy, never a character (5 games, a check) |

The days are 11 to 60, each a different deck.

**How it was played.** A test placed outside this PR (`scripts/montecarlo/sampler.cairo`, a copy of the
`test_full_deck_generate` bot with these strategies) plays one game per `snforge` run, as `OPERATIONS.md` requires
for game generation. The run reads the day, the strategy and the seed from the environment. The greedy bot on day
10 reproduces the golden's 3,554 exactly, which validates the harness.

Each run measured 13 to 40 s and 4.6 to 5.0 GB peak RSS (205 runs, none failed) on the VPS (scarb 2.20.1, snforge 0.64.0,
`RAYON_NUM_THREADS=1`, `prlimit --as=8589934592`, `--max-n-steps 200000000`).

The output is `scripts/montecarlo/scores.csv`.

**Its limits.** Say them before the figures:

- The players are bots, not people. The three kinds bracket a skill range (novice to greedy) but no human
  distribution. Real players may plan ahead, which none of the bots do.
- The goldens are not in the sample, except the full-deck one (3,554, reproduced). The other goldens are cut decks
  (5 to 11 tiles) with forced plans, and their scores say nothing about a whole game.
- No devnet games were played. The bots run the same contract code on snforge, which is what devnet would run, at
  a fraction of the cost.
- The sample is too small for the tail. With 205 games, the 99th percentile of the score rests on a handful of
  games, hence the cap `H`.
- The model has no outside trader. Every player sells their whole reward at once, and nobody else trades the pool,
  so the pool price drifts up (`price end / start` in the tables). This shows the buy pressure; it is not a forecast.
- Players are modelled as sequential and independent; a real day's games overlap.

**The calibration must be redone on real games before any non-local deploy.** The first devnet or testnet players
give the distribution, and `c`, `sigma` and `mean0` are re-derived with the same script (PR E4, section 8).

### Script and output

`python3 -I scripts/montecarlo/sim.py` (standard library only, fixed seeds, about 40 s; two runs give the same output byte for byte). It prints the tables
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

From `scripts/montecarlo/output.md` (the full output, every run of both options).

**The sample.**

| Bot | Games | Mean | Median | Min | Max | Zero scores |
|---|---:|---:|---:|---:|---:|---:|
| greedy | 50 | 3,640 | 3,446 | 0 | 8,074 | 2 |
| noisy | 100 | 2,965 | 2,443 | 0 | 9,062 | 14 |
| novice | 50 | 287 | 0 | 0 | 1,755 | 37 |
| bare (no character) | 5 | 0 | 0 | 0 | 0 | 5 |

The day effect: the mean of the greedy bot's day is 3,640 with a standard deviation of 1,992 over 50 days (55 %); for
the noisy bot, 2,965 and 1,495 (50 %). The same bot on the same rules scores twice as much on one day's deck as on
another's.

**Calibration** (`E[h] = rho` on the population 25 % greedy, 50 % noisy, 25 % novice; mean as the contract tracks it,
scores under 100 left out: 3,353; cap 5):

| sigma | games below the threshold | `c` for rho 0.8 | rho 0.9 | rho 1.0 |
|---:|---:|---:|---:|---:|
| -0.3 | 56 % | 0.921 | 1.036 | 1.151 |
| -0.2 | 62 % | 1.131 | 1.272 | 1.414 |
| -0.1 | 64 % | 1.312 | 1.476 | 1.640 |
| 0 | 69 % | 1.612 | **1.813** | 2.022 |
| +0.1 | 72 % | 1.916 | 2.159 | 2.429 |
| +0.2 | 74 % | 2.144 | 2.421 | 2.736 |
| +0.3 | 76 % | 2.497 | 2.843 | 3.276 |

At the decided point (`sigma` 0, `rho` 0.9, `c` 1.813), `h` has median 0, p90 3.16, p99 4.60, and no game of the
sample reaches the cap.

**Runs** (365 days x 200 games; "return" is what a player gets back in USDC per USDC paid, after selling the reward;
"lost per day" is the share of a day's games that pay nothing, p10 to p90 over the days):

| Run | mint / burn | house edge | games lost | lost per day | return p90 | p99 | supply after a year | greedy | noisy | novice | replayer |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A, base | 0.989 | 37.3 % | 69 % | 46-100 % | 2.13 | 3.08 | 905k | 0.99 | 0.75 | 0.00 | |
| **B, base** | 0.988 | 37.0 % | 66 % | 48-78 % | 2.00 | 2.58 | 901k | 1.05 | 0.73 | 0.00 | |
| B, sigma -0.2 | 0.996 | 36.7 % | 56 % | 26-76 % | 1.68 | 2.17 | 961k | 1.08 | 0.71 | 0.02 | |
| B, sigma +0.2 | 0.950 | 38.7 % | 76 % | 50-100 % | 2.53 | 3.27 | 706k | 0.93 | 0.76 | 0.00 | |
| B, rho 0.8 | 0.963 | 37.9 % | 66 % | 48-78 % | 1.98 | 2.55 | 762k | 1.04 | 0.72 | 0.00 | |
| B, rho 1.2 | 1.016 | 36.2 % | 66 % | 48-78 % | 2.04 | 2.64 | 1,217k | 1.06 | 0.74 | 0.00 | |
| B, cap 2 | 0.919 | 39.3 % | 66 % | 48-78 % | 1.81 | 1.93 | 621k | 1.05 | 0.68 | 0.00 | |
| B, stakes all 1 | 0.954 | 39.1 % | 68 % | 47-100 % | 2.07 | 2.67 | 823k | 0.96 | 0.73 | 0.00 | |
| B, stakes all 10 | 0.999 | 36.5 % | 64 % | 48-78 % | 2.00 | 2.68 | 988k | 1.09 | 0.72 | 0.00 | |
| B, pool depth x0.1 | 0.940 | 40.3 % | 66 % | 48-78 % | 1.90 | 2.60 | 956k | 0.99 | 0.69 | 0.00 | |
| B, players keep half their reward | 0.963 | 37.9 % | 66 % | 48-78 % | 1.97 | 2.50 | 948k | 1.04 | 0.72 | 0.00 | |
| B, all greedy | 0.943 | 38.0 % | 50 % | 0-100 % | 1.31 | 1.42 | 698k | 0.62 | | | |
| B, half novices | 0.984 | 37.3 % | 76 % | 62-87 % | 2.57 | 3.67 | 873k | 1.60 | 1.10 | 0.00 | |
| A, 10 % replayers | 1.008 | 36.6 % | 69 % | 42-100 % | 1.73 | 2.46 | 1,096k | 0.65 | 0.51 | 0.00 | 1.31 |
| B, 10 % replayers | 1.011 | 36.5 % | 64 % | 45-72 % | 1.48 | 1.81 | 1,145k | 0.62 | 0.50 | 0.00 | 1.36 |
| B, 30 % replayers | 1.016 | 36.8 % | 55 % | 42-61 % | 1.10 | 1.30 | 1,265k | 0.37 | 0.31 | 0.00 | 0.94 |
| B, target 500k | 0.785 | 41.8 % | 66 % | 48-78 % | 1.88 | 2.44 | 456k | 0.98 | 0.67 | 0.00 | |
| B, 20 games a day | 0.959 | 39.1 % | 67 % | 35-100 % | 2.03 | 2.79 | 920k | 0.99 | 0.70 | 0.00 | |
| B, prior weight 20 | 0.996 | 36.6 % | 64 % | 47-78 % | 1.93 | 2.49 | 965k | 1.09 | 0.72 | 0.00 | |
| B, prior weight 1,000 | 0.987 | 37.5 % | 68 % | 46-100 % | 2.08 | 2.93 | 887k | 1.00 | 0.74 | 0.00 | |

The initial mean (x0.5 or x2) and the max weight (100 instead of 1,000) change nothing visible after a year (rows in
the output). The median return is 0 in every run: more than half the games lose their stake, as D-10 asks.

### What the figures say

- **The house edge is structural.** In every run where the supply has time to settle, mint / burn is close to 1
  and the house edge is 36.2 % to 37.9 %. That is the analytic `1 - 0.7 x 0.95^2 = 36.8 %`: 30 points of margin (to
  the Vault and the referrers), 3.5 points of pool fee on the buy, 3.3 points of pool fee on the player's sale. The
  edge is higher only where the supply has not settled within the year: a low target (500k: 41.8 %), a thin pool
  (40.3 %), a low cap (39.3 %), or few games (20 a day: 39.1 %). In those runs the token is still deflating.
- **The supply factor is the regulator.** `rho` moves the supply after a year (762k at 0.8, 1,217k at 1.2), not
  the edge. Its value is a choice of where the supply sits, and 0.9 keeps it a little under the initial million.
- **`sigma` chooses who loses.** From -0.2 to +0.2, the share of games lost goes from 56 % to 76 % and the p99
  return from 2.17 to 3.27; the edge stays at 36.7 to 38.7 %. D-10 asks for a cliff at the profitability-shifted
  mean; 0 puts it at the mean. A negative shift is gentler on the median player at no cost to the house.
- **Skill pays, as it should.** The greedy bot gets back 1.05 per USDC (option B), the noisy bot 0.73, the novice
  nothing. With half the population novices, the greedy bot earns 1.60: a skilled player gains from weaker ones.
- **Option B is fairer by day.** With option A, on a hard deck every game of the day loses (p90 of 100 %); with B
  the share of a day's games lost stays between 48 % and 78 %, and the p99 return falls from 3.08 to 2.58. The cost
  is the settlement after the day. With few games a day (20), B's day mean is noisy; a prior weight of 100 (about 30
  games at the mean stake) is the decided compromise (P-31).
- **Replay is the hole (E-1).** A player who replays the best known line of the day at stake 10 gets back 1.31x to
  1.36x what they pay with 10 % of the games theirs, and drags everyone else to about half. At 30 % they fall back
  under 1 (0.94) because the mean adapts, but the others then get 0.31 to 0.37.

## 4. The Vault

**DECIDED (P-31): a simple staking vault, not Nums' ERC4626.**

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

What reverses the decision: the owner wants a transferable or tradable share (an LP of vPAVED, governance).
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
O-1. Ekubo's interfaces are public, and declaring them locally is fine (D-14, owner, 2026-10-09).

- Router address, pool key (PAVED/USDC, fee `0.05 x 2^128` = `0xccccccccccccccccccccccccccccccc`, Nums' tick
  spacing `0x56a4c` for that fee, extension 0 unless the owner picks one) and `sqrt_ratio_limit` (the extreme bound
  for the swap direction) are constructor arguments of `Economy`. A setter for the pool is in section 6.
- **Slippage.** Nums and Glitchbomb pass a minimum of 0 and an extreme price limit: their swap is sandwichable.
  Here the player passes `min_out`, and the player is the one who loses from a bad price, since their `R` follows
  `b`.
  - **The client's slippage (P-35, approved by the PM):** 1 % by default, shown to the player, and capped at 5 %.
    The client sends `min_out = pool quote x (1 - slippage)`.
  - **The pool quote.** On devnet it is `Economy.quote_swap(usdc_in) -> PAVED out` (pool fee included), which
    forwards to `MockRouter.quote`. The client never calls the router itself. On mainnet, see "Quoting on
    mainnet" below.
  - **`Quote.min_out_hint` is never sent as `min_out`.** It is only an estimate, 99 % of the burn quote at the
    guard's rate, and it lags the pool.
- **Quoting on mainnet (P-35).** What was checked, on 2026-10-09:
  - Ekubo's router source (`EkuboProtocol/starknet-contracts`, `src/router.cairo` on `main`) has a view
    `quote_swap(node: RouteNode, token_amount: TokenAmount) -> Delta`, along with `quote_multihop_swap` and
    `quote_multi_multihop_swap`. It runs the swap inside core's `lock` with a callback that reverts on purpose
    (`FUNCTION_DID_NOT_ERROR_FLAG`), then decodes the result from the revert data and returns it as a `Delta`.
  - Its shape is not `MockRouter.quote(token_in, amount_in) -> u128`, so `Economy.quote_swap` serves **devnet
    only**: on mainnet its call to the router fails.
  - Nums' client quotes through Ekubo's public quoter API instead (`https://prod-api-quoter.ekubo.org/<chain
    id>/<amount>/<token>/<quote token>`, in `client/src/api/ekubo.ts` and `client/src/config.ts` of Nums at
    `4f8f405`).
  - **Unverified:** whether the router deployed at the mainnet address has `quote_swap`, and whether a contract
    can call it on chain (the result rides on a caught revert). On mainnet the client uses Ekubo's public quote API
    until a fork test (E-9) shows the router's `quote_swap` works. `Economy.quote_swap` can then move to that
    interface, with the mock implementing it too.
- **Price guard (self-sandwich).** A player can push the PAVED price down before their own purchase, by selling
  PAVED into the pool. Their burn then buys more PAVED, so their `R` and their reward grow. They buy back
  afterwards. Their cost is the pool fee on both legs.
  - In a constant-product pool with `U` USDC of depth, halving the price costs about `0.1 x 0.29 U` in fees. It
    doubles `R`.
  - At stake 10 and the cap `H = 5`, the gain is at most about 63 USDC. The attack pays when `U < ~2,200 USDC`.
  - The guard: `Economy` keeps an EMA of the swap rate (PAVED per USDC, weight 1/32 per purchase), and the `R` of a
    purchase counts at most `q x rate x 1.10` PAVED. One manipulated purchase gains at most 10 %. Each purchase's
    observed rate is clamped to `[rate x 10/11, rate x 11/10]`, so one purchase moves the EMA by at most
    `1/32 x 10 %`, about 0.31 %, up or down. Moving it by 10 % therefore takes at least about 31 purchases, each
    paying the fee and its price. With a launch LP like Nums' (10,000 USDC) the attack does not pay even without the
    guard. The guard covers a thinner pool.
  - The guard's rate starts at the launch rate **after the pool's fee**: 800,000 PAVED for 10,000 USDC is 8e31 PAVED
    base units per USDC base unit x 1e18 at the spot price, and a purchase gets about 0.95 x that, so the deploy
    passes **7.6e31**. E3's deploy applies it. The constructor refuses 0.
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
| `Daily` | the game; `spawn(stake, referrer, min_out)`; no constructor change: `Lobby` reads the `Economy` address from `Account`, as the `Collection`'s (section 9; a constructor argument would cost about 92 felts, measured there) | yes | **72,607, measured** on a prototype (main 72,424, +183; 88.6 %; margin to 90 %: 1,121) |
| `Tutorial` | unchanged behaviour (free); its call to `Lobby.spawn` passes zeros | yes | 66,704, measured (+15) |
| `Lobby` | spawn: one `transferFrom`, one call to `Economy.purchase`; game over: one call to `Economy.record`; stops feeding the prize from entries | declared | 58,636 on main; about +1,000 (estimate; a prototype with heavier stubs measured +2,353) |
| `Economy` (new) | the split, the swap, the burn, the terms per game, the mean and the days, settlement and mint, the configuration, the views | yes | estimate 15,000 to 30,000 (20 to 37 %), measured in its PR |
| `PavedToken` (new) | OpenZeppelin ERC20, `mint` by `Economy` only, `burn` of one's own balance | yes | estimate 5,000 to 8,000 |
| `Vault` (new) | stakes in PAVED, dividends in USDC (section 4) | yes | estimate 5,000 to 8,000 |
| `MockRouter`, `MockUSDC` (new) | devnet and tests only | devnet only | estimate under 6,000 each |
| `Collection` (new, D-11b) | the soulbound ERC721 of the games: mint at spawn, `token_uri` (section 9) | yes | **13,070, measured** (16.0 %) |
| `Account` | the registry of the addresses `Lobby` needs: the `Collection` (measured: 3,329, +450) and the `Economy` (the same shape, one more slot) | yes | 3,329 with the `Collection`, measured (+450) |

Rule P-27 holds: **nothing is added to the move code of `Daily`**, and its paying path is outside the class.

`Daily` grows by 183 felts, measured:

| Part | Felts |
|---|---:|
| the three arguments of `spawn` (`u8`, `ContractAddress`, `u256`) through to `Lobby` | 182 |
| the game id passed to `Lobby.report` in `build` | 1 |

That growth is **accepted under P-27 (P-31, 2026-10-09)**. Two variants were measured and rejected:

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
| `Economy.set_pool` | owner | a pool key on the same two tokens only; event. **Accepted trust:** the owner can point the swaps at any PAVED/USDC pool, including a thin one (E-4) |
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
| `Recorded` | `game_id` | `score`, `expired` (P-34) |
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
| Quote | `Economy.quote(stake) -> Quote { price, burn_quote, referral, margin, min_out_hint, factor, mean, threshold, slope, cap }` (a view on `Economy`, not `Daily`). `min_out_hint` is an estimate and is never sent as `min_out`. `min_out` comes from `Economy.quote_swap(burn_quote)` on devnet, or Ekubo's quote API on mainnet, minus the slippage (1 % by default, shown, at most 5 %; P-35) |
| Running day | `Economy.day(day) -> DayView { prior, sum, weight, mean, closed }`: sum, weight and mean are 0 until the day closes (P-34) |
| A game's terms | `Economy.terms(game_id) -> TermsView { stake, reference, day, score, settled, reward }` |
| Settlement | `Economy.settle(game_ids)`, from the end of the day after the purchase day (P-34); the client offers it then, and the indexer lists the unsettled games. A game recorded 24 h or more after its purchase is expired and earns nothing |
| Prize | the daily top-3 prize no longer grows with entries (section 7): sponsor-only |
| Deployments | `contracts/deployments/<network>.json` gains `Economy`, `PavedToken`, `Vault`, `Collection` (and `MockRouter`, `MockUSDC` on devnet); `token` becomes USDC; ABIs `Economy.json`, `PavedToken.json`, `Vault.json`, `Collection.json` |

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
| E-1 | **Predictable daily seed** (kept by the owner, D-13) (D-3, R-4): the day's deck is public, so the best line can be searched offline and replayed at stake 10. Measured: replayers get 1.31x to 1.36x of their price; at 10 % of the games the others drop to about half | **Accepted by the owner (D-13, 2026-10-09)**: the predictable seed stays for now, paid games included. The seed sits behind `SeedSource` (E3), so that a VRF (Cartridge VRF on mainnet, a mock on devnet) can replace it later. Option B already blends the replayers into the day's mean, which limits them as their share grows |
| E-2 | **Day effect**: one deck per day; the mean score moves 50 to 55 % from day to day. **Stale prior**: a day's prior is the EMA at its first purchase, and a day enters the EMA only at its first settlement, from `(D + 2) x 86400` (P-34). Day `D + 1`'s prior never includes day `D`; day `D + 2`'s includes it only if `D` was settled before `D + 2`'s first purchase | Option B (the day's own mean). With option A, the share of a day's games lost spans 46 % to 100 % (p10 to p90 over the days), against 48 % to 78 % with option B. A keeper settles each day just after `(D + 2) x 86400`, so that the prior lags by two days at most. The prior weighs 100 against the day's own games |
| E-3 | Bot sample, not players | Recalibrate on the first real games (PR E4); `c`, `sigma`, `H`, `T` are configurable within bounds |
| E-4 | Thin pool or self-sandwich; the owner repointing `set_pool` at a thin pool (accepted trust, section 6); a stale guard rate | `min_out` from the player (pool quote minus 1 % to 5 %, P-35); the rate guard (+10 %, observation clamped to 10 % per purchase); a launch LP of at least ~10,000 USDC (the owner's act). The guard's rate follows the swaps, not the day's settlement, so the stale prior (E-2) does not touch it |
| E-5 | `Daily` at 88.6 % after P8 (1,121 felts to 90 %) | P8 adds nothing more to `Daily`; growth of the move code goes to the PM (P-27); fallbacks (a) or (c2) of `class-headroom.md` |
| E-6 | Self-referral through a second address takes 5 % from the stakers | Accepted with the margin option; the burn option removes it (section 1) |
| E-7 | USDC that arrives while nobody stakes goes to the first staker | The owner stakes at launch |
| E-8 | New dependency: an OpenZeppelin ERC20 (`openzeppelin_token`) | DECIDED (P-31): OpenZeppelin for `PavedToken`, a published version that builds with Scarb 2.20.1, pinned exactly (`=x.y.z`) in E1 |
| E-9 | Ekubo interface drift | Local ABI-compatible declarations; a fork test against the mainnet router before the owner's mainnet go. It covers the price limit, a partial fill, and the router's `quote_swap` (P-35, section 5) |
| E-11 | A wallet or indexer does not show the games, or shows a transfer button that then fails | Standard ERC721 surface with SRC5 ids, the camelCase twins and the `Transfer` event at mint; no Starknet standard for "soulbound" exists (section 9) |
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
  - `contracts/src/lib.cairo`; `contracts/Scarb.toml` (OpenZeppelin, pinned exactly: P-31), `contracts/Scarb.lock`;
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
  - `settle` is once per game, only from the end of the next day (P-34), and only for recorded games;
  - an end-to-end check of the Monte-Carlo's formulas: the same inputs give the same `R` and payout as
    `scripts/montecarlo/sim.py` (a fixture table).
- Audit: security and economy.

**E3. Wiring: `Daily`, `Lobby`, deploy, indexer.**
- Goal:
  - `Daily.spawn(stake, referrer, min_out)` and `Lobby.report(game_id, over)`;
  - `Lobby` calls `Economy`;
  - the entry no longer feeds the prize (sponsor-only, P-31);
  - **Seed source (P-31):** the initial seed of a game is taken behind an interface, so that a VRF or a seed
    revealed after the purchase can replace it. Today `GameImpl::start` calls `Mode::seed(time, id, salt)` at spawn,
    which runs in `Lobby` (`HostableComponent::spawn`). E3 moves that call behind a `SeedSource` trait in
    `contracts/src/seed.cairo`, and `spawn` passes the seed in. Its only implementation in E3 is today's daily seed,
    so the goldens stay identical. The reseeds of `build` and `discard` derive from the initial seed and are not
    touched, so `Daily`'s move code does not change;
    - *As built (E3a, D-13):* `SeedSource<T>` and `DailySeed` are in `contracts/src/seed.cairo`;
      `HostableComponent::spawn` calls `spawn_with(mode, @DailySeed {})`, which takes the seed from the source and
      passes it to `GameImpl::start(time, seed)`. Goldens and the gas of moves a0 to l are identical to main, and
      `Daily` stays at 72,424 CASM felts;
  - `scripts/deploy.sh devnet` deploys and wires everything;
  - the indexer decodes the new events.
- Allowlist:
  - `contracts/src/systems/{daily,lobby,tutorial,account}.cairo`, `contracts/src/components/hostable.cairo`,
    `contracts/src/types/mode.cairo`, `contracts/src/constants.cairo`;
  - `contracts/src/seed.cairo` (new) and `GameImpl::start` in `contracts/src/models/game.cairo` (the seed is passed
    in);
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
  - the indexer's devnet scenario passes with the new events;
  - the seed comes only through `SeedSource`: a test with a stub implementation changes the draw, and the default
    gives the goldens;
  - **trust in `Daily`** (from E2's audit): `Economy.purchase` trusts its caller for the game id, the player, the
    stake and the price, and it only checks that its USDC balance covers the price. E3's `Lobby.spawn` pulls `P`
    from the player to `Economy` in the same call, just before `purchase`. Tests:
    - a spawn at stake `k` moves exactly `k x 2 USDC` from the player, and `Economy` holds 0 after it;
    - a spawn without the approval, or with a stake of 0 or 11, reverts and leaves no game and no terms;
    - the game id passed to `purchase` is the game's own id, and `record` reaches `Economy` for each way a Daily
      game ends (`build`, `discard`, `surrender`);
    - the referrer is a registered player (`Account`), not the payer;
    - a Tutorial spawn calls neither `purchase` nor `record`.
- Audit: security and economy.

**E4. Calibration on real games.**
- Goal: refresh `scores.csv` with devnet or testnet games played by people; re-derive `c`, `sigma`, `mean0`; set
  them by `configure`.
- Allowlist: `scripts/montecarlo/**` and this document.
- Audit: economy.

**E5. Games as NFTs (section 9).**
- Goal: `Collection`, the mint at spawn in `Lobby`, and `Account`'s registry of the collection address. It can
  land before or after E1 to E4, since it touches no paying path.
- Allowlist:
  - `contracts/src/systems/collection.cairo` (new);
  - `contracts/src/systems/{account,lobby}.cairo`, `contracts/src/store.cairo` (the `account()` accessor),
    `contracts/src/lib.cairo`;
  - test setups and the e2e and gas tests;
  - `scripts/deploy.sh`, `contracts/deployments/{README.md,devnet.json}`, `contracts/abis/{Collection,Account}.json`,
    `scripts/abis.sh`;
  - `packages/indexer/**` (the mint).
- Acceptance:
  - `Daily` and `Tutorial` class sizes identical to main;
  - a0 to l identical to main;
  - spawn gas reported (prototype: +837,910 Daily, +844,700 Tutorial, test profile);
  - `transfer_from`, `safe_transfer_from`, `approve` and `set_approval_for_all` revert for every token, minted or not;
  - `mint` reverts for anyone but `Daily` (Daily ids) and `Tutorial` (Tutorial ids);
  - `set_minters` and `set_collection` are one shot;
  - `token_uri` decodes to the JSON of section 9 for a running and a finished game;
  - `supports_interface` is true for SRC5, ERC721 and ERC721 metadata.
- Audit: security (minters, the one-shot setters, no transfer path, no receiver callback at mint).

**CLIENT** (their track, through the PM): the stake selector, the USDC approval, the quote, the settle button and the
Vault screens.

### Decided (P-31, 2026-10-09)

Every point of this design was ruled by the PM on 2026-10-09: the table at the top ("Rulings (P-31, 2026-10-09)")
says what was decided and what would reverse each decision. The choices made inside this design, and not listed
there, stand as written:

| Decision | Reverse |
|---|---|
| Ekubo interfaces declared locally | A published Ekubo package by version, if allowed |
| Configuration and views on `Economy`, not `Daily` | None: the `Daily` variant was measured at 89.9 % |
| Addresses (`Economy`, `Collection`) read from the `Account` registry, no constructor change of `Daily` | A constructor argument (about +92 felts in `Daily`) |

### For the owner

The two questions recorded by P-31 are answered (2026-10-09):

- **The structural house edge, about 37 %** (`1 - 0.7 x 0.95^2`, measured 37.0 % to 37.3 %), is **accepted (D-12)**.
  It follows from D-10's 70 % burn and 5 % pool fee, and D-10's numbers stand.
- **The predictable daily seed is kept for now, paid games included (D-13).** Paid games are exploitable by replay
  (E-1). A VRF may come back later. E3 keeps the seed behind `SeedSource`, so that a VRF would replace one
  implementation.
- **Ekubo's interfaces are public (D-14).** Declaring them locally in `economy/ekubo.cairo` is fine.

### Gates before a paid game leaves devnet

D-13 lifts the seed gate. These gates stay:

- **The owner's acts**, unchanged by this design: deploying PAVED on a public network and distributing the initial
  1,000,000; creating the Ekubo pool and funding its LP (Nums: 800,000 PAVED and 10,000 USDC); who holds the LP
  position and its 5 % fees; staking at launch.
- **The mock-router gate** (from E1's audit): the mainnet price limit and partial fills are untested until a fork
  test against the mainnet router covers them (see "As built: E2" below).

### As built: E2 (`Economy`)

`contracts/src/economy/{economy,curve,mean}.cairo`. `curve` and `mean` hold the arithmetic as pure functions,
unit tested against the formulas above. `Economy` holds the storage, the calls and the events. Where the code
differs from the text above, or the text left the choice open, it is written here.

- **Entry points.**
  - `purchase(game_id, player, day, stake, price, referrer, min_out) -> R` and `record(game_id, score)` (P-34: no
    `in_day`): the game only (`set_game`, one shot, by the owner).
  - `settle(game_ids) -> minted`: anyone, from `(D + 2) x 86400` for a game of day `D` (P-34).
  - `configure(config)` and `set_pool(pool_key, sqrt_ratio_limit)`: the owner. `set_pool` lets the owner point the
    swaps at any PAVED/USDC pool, which is accepted trust (section 6; no code change).
  - Views: `quote`, `quote_swap` (P-35, devnet only, section 5), `day` (sum, weight and mean are 0 until the day
    closes, P-34), `terms` (with the purchase time and `expired`), `config`, `ema`, `rate`, `pool`, `addresses`,
    `owner`.
- **Who may call `configure`, and its bounds.** The owner named in the constructor calls it. The bounds are those
  of section 6, checked by `validate`: `burn_bps` 5,000 to 9,000; `sigma_bps` -3,000 to +5,000; `slope_bps`
  (`c`) 1,000 to 50,000; `cap` (`H`) 1 to 20; `target` (`T`) 100,000 to 10,000,000 PAVED. The constructor's
  configuration passes the same check. The referral (500 bps), the base price (2 USDC), the stake range (1 to 10)
  and the parameters of the mean are constants. The mean has no setter.
- **The owner has no transfer and no upgrade.** The owner can configure and set the pool, and nothing else.
  `PavedToken`'s minter is set once, so **a fix of `Economy` after its deploy needs a new `PavedToken`**. Reverse:
  the PM wants an upgradeable `Economy`. That also makes its owner able to mint.
- **Frozen terms.** A purchase freezes `R`, its time and the curve then in force (`sigma`, `c`, `H`) into the
  game's terms. A `configure` therefore applies to the next purchase only, the curve included. The time is packed
  in 40 bits in the same slot, in place of the day, which is derived from it.
- **The day and the expiry (P-34).** `purchase` refuses any day other than `now / 86400`. A day's prior is the EMA
  at its first purchase.
  - A `record` before `purchase time + 86400` adds the game to its purchase day's accumulator (scores of 100 or
    more).
  - A `record` from then on marks the game expired: it enters no mean, and `settle` pays it 0.
  - A day closes at its first `settle`, which is allowed from `(D + 2) x 86400`, once every game of the day has
    ended or expired. The day's mean is then fixed, and the day's average is pushed into the EMA once, with the
    day's weight capped at the max weight.
  - Days can close in any order. A push is clamped at 4x the EMA at that moment, which binds only if an earlier
    day closed late and lowered the EMA.
  - The check that the day is not closed in `record` stays as a defence. With the expiry it cannot bind: a close
    comes after every game of the day has expired.
- **`settle`** reverts on an unknown game, a game not recorded, or a day that cannot close yet. **A game already
  settled is skipped** (no mint, no event), so that a batch cannot be blocked by someone settling one of its games
  first.
- **Nothing is left behind.** In one call, `purchase` pays the referrer, transfers the quote to the router,
  calls `swap`, then `clear_minimum(PAVED, min_out)` and `clear(USDC)`. It then burns **its whole PAVED
  balance** and sends **its whole USDC balance** to the Vault. Tests check that `Economy` holds 0 and the router
  exactly its reserves after every purchase. A donation to `Economy` or to the router leaves with the next
  purchase: its USDC goes to the Vault, its PAVED is burned. `Purchased.burned` is the whole amount burned,
  donations included. **`R` and the guard's rate follow only what the swap paid out**, which is the PAVED leg of
  the `Delta` that `swap` returns. `clear_minimum` returns the router's whole PAVED balance, and that amount is
  used only for the `min_out` check. No balance is re-read to assert 0.
- **The margin goes to the Vault on every purchase**, in the same call, and never in a batch. The referral is
  taken out of the margin, so the burn stays at `BURN_BPS` (70 %) on every purchase (P-31). A referrer that is
  the player gets nothing. Checking that a referrer is a registered player is `Lobby`'s job (E3).
- **The threshold is in milli-points** (`mean x (10_000 + sigma) / 10_000`, with the mean x 1,000). The text
  above rounds it down to whole points. Keeping the milli-points is closer to `sim.py`.
- **The price guard.** The guard's initial rate is a constructor argument, in PAVED base units per USDC base
  unit x 1e18, and the constructor refuses 0. The deploy passes the launch rate **after the pool's fee**: 8e31 x
  0.95 = **7.6e31** (section 5; E3's deploy applies it). Each purchase's observed rate is clamped to 10 % of the
  rate, in both directions, before the 1/32 step.
- **`min_out_hint`** keeps its name, because CLIENT's stub reads it. It is an estimate (99 % of the burn quote at
  the guard's rate) and is never sent as `min_out`. At the launch rate after the fee, it stays under the swap's
  output for every stake (a test checks it). `quote_swap` gives the pool's quote (P-35).
- **Storage.** Each game's terms take one slot and its outcome another; the player is a third. The
  configuration, the EMA and each day's accumulator take one packed slot each.
- **Size.** See the table in the PR (`scripts/class-sizes.sh`, release profile). `Daily`, `Tutorial` and `Lobby`
  are unchanged.
- **Indexer.** The indexer reads only `Daily`, `Tutorial` and `Account`, so `Economy`'s events need no
  `IGNORED` entry. E3 decodes them.

**Gate (before any paid game leaves devnet; it stands after D-13): the mainnet price limit and partial fills are
untested.**
`MockRouter` ignores `sqrt_ratio_limit` and always fills the whole input. On Ekubo, a swap that reaches the limit
fills only part of its input. `clear(USDC)` then returns the rest to `Economy`, which sends it to the Vault as
margin. The burn of that purchase then falls below 70 %, and its `R`, which follows the PAVED bought, is smaller.
`Economy` passes the constructor's `sqrt_ratio_limit` (meant as the extreme bound of the swap direction), so a
partial fill needs a drained pool. Before the owner's go for a non-local paid game, a fork test against the
mainnet router must cover the chosen limit and a partial fill (E-9). The mock was left unchanged.

**Gap: the mock's fee stays in its reserves.** `MockRouter` adds the whole input to its reserve, fee included,
as Uniswap v2 does. Ekubo and `sim.py` keep the fee out of the price curve. E4 recalibrates from real games'
scores, not from the mock's prices, so it does not need the mock changed. The difference is small: over the 9
purchases of the fixture, `sim.py`'s pool gives an `R` up to 230 ppm away from the mock's.

**Fixture against `sim.py`** (`test_fixture_matches_sim`). The inputs:
- the launch pool: 800,000 PAVED and 10,000 USDC, with the 1,000,000 initial supply;
- the decided configuration, the initial mean 3,353, and the guard's launch rate after the fee (7.6e31);
- two days of games, two days apart (P-34): the first is settled before the second's purchases, as `sim.py` does,
  and players keep their rewards (`sell = 0`).

The expected values are printed by `python3 -I -B scripts/montecarlo/fixture.py`. It imports `sim.py`'s
`payout_factor` and `Ema`, runs the purchase and day lines of `simulate`, and adds the price guard, which `sim.py`
does not model (E4 adds it there). The pool keeps its fee in its reserves, as the mock does; `--sim-pool` runs
`sim.py`'s pool instead, and measures the 230 ppm gap. The test's `expected()` table is the script's output. The
guard does not bind on this pool. The PAVED bought matches
to the base unit. `R` and the payout are within 120 ppm; the worst gap measured is 86 ppm. The gap comes from
`F`, which is in whole basis points: 1 bp of 1x is 100 ppm. The day means are 4,215.689 and 4,387.024 points
(sim: 4,215.690 and 4,387.025). The EMA after both days is 4,366.567 points.

| Game | Day | Stake | Referred | Score | `R`, sim (PAVED) | `R` gap | Payout, sim (PAVED) | Payout gap |
|---:|---:|---:|---|---:|---:|---:|---:|---:|
| 1 | 0 | 1 | no | 5,000 | 107.4611 | 6 ppm | 231.0738 | 6 ppm |
| 2 | 0 | 3 | yes | 2,000 | 328.6949 | 25 ppm | 0 | exact |
| 3 | 0 | 10 | no | 15,000 | 1,169.3069 | 86 ppm | 5,846.5346 (cap) | 86 ppm |
| 4 | 0 | 5 | yes | 50 | 557.2234 | 16 ppm | 0 | exact |
| 5 | 0 | 2 | no | 4,300 | 216.3582 | 28 ppm | 400.1023 | 27 ppm |
| 6 | 1 | 4 | no | 6,000 | 438.1808 | 73 ppm | 1,086.5064 | 73 ppm |
| 7 | 1 | 7 | yes | 9,000 | 788.3495 | 12 ppm | 2,932.1688 | 12 ppm |
| 8 | 1 | 1 | no | 4,300 | 106.1996 | 17 ppm | 0 | exact |
| 9 | 1 | 6 | no | 800 | 668.5417 | 50 ppm | 0 | exact |

## 9. Games as NFTs (D-11, amended D-11b)

The owner's decision, relayed by the PM: every game is an NFT of its own ERC721 contract, `Collection`, with token
id = game id, so that games are visible in a standard way in any wallet. One day the image will be the board itself
(an on-chain render, a later task). **D-11b makes every game NFT non-transferable (soulbound), paid games
included**, and drops D-11's owner checks, transfer-time payouts and Transfer indexing.

### Design

- **Who owns a game never changes.** The player bound at spawn (`game.player_id`, the caller of `spawn`, a
  registered `Account`) is the token's owner for the game's whole life. No action calls `owner_of`: `build`,
  `discard`, `surrender`, game over and claim keep checking the player as today. **`Daily`'s move code and gas are
  unchanged** (measured below), so P-27's margin is untouched.
- **Mint at spawn, from `Lobby`.**
  - `Lobby.spawn` runs as `Daily` or `Tutorial` (library call), so the `Collection` sees `Daily` or `Tutorial` as
    its caller, the two minters.
  - The token goes to the player. It is a plain mint, not a "safe" mint, so there is no `on_erc721_received` callback
    into the player's account during a spawn.
- **Token ids.** `Daily` and `Tutorial` each count their own game ids (`store.uuid()` in their own storage), so the
  same id exists twice. A Daily game's token id is its game id. A Tutorial game's token id is `2^32 + game id`
  (Glitchbomb reserves a range the same way, `REWARD_OFFSET`). The `Collection` routes `mint` and `token_uri` by that
  range.
- **Soulbound.**
  - `transfer_from`, `safe_transfer_from`, `approve` and `set_approval_for_all` revert (`Collection: soulbound`) for
    every token.
  - `get_approved` is always zero and `is_approved_for_all` always false.
  - There is no burn.
- **`token_uri` (and `tokenURI`).** It returns `data:application/json;base64,` + base64 of:
  ```json
  {"name":"Paved Games #<id>","description":"A game of Paved.","attributes":[
    {"trait_type":"Score","value":<score>},{"trait_type":"Over","value":<true|false>},
    {"trait_type":"Day","value":<start_time / 86400, the tournament day>}]}
  ```
  It reads the `game` view of `Daily` or `Tutorial` by the token's range. There is no `image` until the board
  render; wallets show their placeholder. The prototype's output decodes to exactly this JSON (test p below).
- **How `Lobby` finds the `Collection` without touching `Daily` or `Tutorial`.** Both already know the `Account`
  contract (`store.account`, read at every spawn).
  - `Account` gains the `Collection` address: `set_collection`, owner only, one shot, plus a `collection()` view.
  - `Lobby` reads it at spawn.
  - The alternative, a constructor argument of `Daily` and `Tutorial`, was measured at +92 felts in `Daily`.
- **Deploy.** `Account`, then `Collection(owner)`, then `Daily` and `Tutorial`. Then, as the owner:
  `Account.set_collection(collection)` and `Collection.set_minters(daily, tutorial)`, each one shot.

### Measured

Prototype on main `f6545ba` (exported with `git archive` outside the worktree, not committed):
- `contracts/src/systems/collection.cairo` as designed above: our own minimal ERC721, no OpenZeppelin dependency,
  SRC5 and the camelCase twins included;
- the `Account` registry and the mint in `Lobby.spawn`.

Sizes come from `scripts/class-sizes.sh` (release, `RAYON_NUM_THREADS=1`, `prlimit --as=8589934592`). Gas comes from
the gas suite in the test profile (the CI's): `snforge test gas:: --max-threads 1` under the same cap, peak RSS
5.2 GB. Three tests were added to both the prototype and a copy of main:
- n: a second Daily spawn;
- o: a Tutorial spawn;
- p: the token's owner, the soulbound reverts and `token_uri`.

| Class (CASM felts, release) | main | with NFTs | Change |
|---|---:|---:|---:|
| `Daily` | 72,424 | **72,424** | **0** |
| `Tutorial` | 66,689 | **66,689** | **0** |
| `Lobby` | 58,636 | 58,986 | +350 |
| `Account` | 2,879 | 3,329 | +450 |
| `Collection` (new) | | 13,070 (16.0 %) | |

| L2 gas (test profile) | main | with NFTs | Change |
|---|---:|---:|---:|
| a0, a, b, c, d, e, f (moves), l (game over on `build`) | 5,626,085 ... 6,111,335 | identical to the unit | 0 |
| g, h, i, k (closing moves by `surrender`), j (view) | 2,060,599 ... 370,628 | identical to the unit | 0 |
| n: Daily `spawn` | 40,983,345 | 41,821,255 | **+837,910 (+2.0 %)** |
| o: Tutorial `spawn` | 4,555,211 | 5,399,911 | **+844,700 (+18.5 %)** |
| p: `token_uri` (a view, free off chain) | | 22,359,558 | |

What the mint pays: one view call to `Account`, one call to the `Collection`, two new storage slots (owner, balance)
and the `Transfer` event. These parts were not measured one by one.

Test p also checks that `transfer_from` and `approve` revert for the owner's own token. The implementation tests
every entry point and every token (E5).

`token_uri` is heavy because of the base64 in Cairo. That matters only to a contract that calls it; wallets read it
off chain. A `data:application/json;utf8,` URI would skip the base64, but percent-escaping is then needed for the
quotes and braces, and support for it is less certain than for base64.

### What wallets need, and what was found where

- **ERC721 through SRC5, not EIP-165.** Starknet's ERC721 declares its interfaces with SRC5. The ids are
  OpenZeppelin's:
  - `ISRC5_ID = 0x3f918d17e5ee77373b56385708f855659a07f75997f365cf87748628532a055`;
  - `IERC721_ID = 0x33eb2f84c309543403fd69f0d0f363781ef06ef6faeb0131ff16ea3175bd943`;
  - `IERC721_METADATA_ID = 0xabbcd595a567dce909050a1038e055daccb3c42af06f0add544fa90ee91f25`.

  They come from `openzeppelin_interfaces` 2.2.0 (`src/introspection.cairo`, `src/token/erc721.cairo`, in the Scarb
  cache of the VPS) and OpenZeppelin's Cairo docs (https://docs.openzeppelin.com/contracts-cairo/0.10.0/erc721).
  **Yes, they must still be claimed**: a soulbound token still implements the ERC721 read surface, and
  `supports_interface` answers true for all three (prototype).
- **The camelCase twins.** OpenZeppelin ships `IERC721CamelOnly` and `IERC721MetadataCamelOnly` (`balanceOf`,
  `ownerOf`, `tokenURI`), because older Starknet wallets and indexers call them. The prototype exposes the read ones.
- **Wallets list NFTs from indexers that follow the standard `Transfer` event.** The mint emits
  `Transfer(from: 0, to, token_id)` with all three fields as keys, OpenZeppelin's layout. Without it the token may
  never show.

  **No official document of Ready (ex-Argent) or Braavos was found** that lists what a contract needs to be
  displayed. The points above are pieced together from OpenZeppelin's docs and community templates (for example
  https://github.com/nvthaovn/Starknet-ERC721-Cairo-1, which claims ArgentX, Braavos, Starkscan, Element, Unframed and
  Pyramid). A devnet cannot prove it, since the wallets' indexers do not watch it. The check is on the owner's first
  public deploy.
- **Metadata JSON** follows the ERC721 metadata schema as OpenSea documents it (https://docs.opensea.io/docs/metadata-standards):
  - `name`, `description`, `image`, and traits under `attributes` (`trait_type`, `value`);
  - a contract may return the JSON on chain, which is the `data:application/json;base64,` form.
- **Soulbound display.**
  - Ethereum has ERC-5192 (https://eips.ethereum.org/EIPS/eip-5192): `locked(tokenId)`, `Locked` and `Unlocked`
    events, detected through EIP-165. Its own discussion notes that marketplaces follow the events, not the view.
  - **No Starknet (SNIP or SRC5) equivalent was found.** A Starknet wallet therefore shows a game as an ordinary NFT,
    and a transfer started from the wallet reverts with `Collection: soulbound`.
  - Adding a `locked()` view with no recognised interface id would buy nothing today, so it is left out until a
    Starknet standard exists.

### Identity, leaderboard, quests, indexer, client

- **Identity is unchanged.** The player is the caller of `spawn` (a registered `Account`) and stays the token's
  owner. The leaderboard, the quests and achievements, and the `Account` names are unchanged.
- **Indexer.** It adds the `Collection` address and reads only its mints, `Transfer` with `from = 0`, which give the
  token id of each game. A `Transfer` with `from != 0` cannot happen; if one appears, the indexer halts, as for any
  event its rules exclude (a contract changed under it). "My games" is unchanged: by player, as today. The new
  event comes in the same lot as the contract (O-39).
- **Client.** Nothing is required. It may link a game to its token (contract address and token id).
- **`Lobby`.** It holds the mint, in `spawn`, and that is its only change. `Daily` and `Tutorial` hold nothing of it.

### Security audit (OPERATIONS)

D-11b removes the ownership checks, so the audit covers what remains:
- the minter check by id range (only `Daily` mints Daily ids, only `Tutorial` mints Tutorial ids);
- the one-shot owner setters (`Collection.set_minters`, `Account.set_collection`);
- no transfer path at all: the four entry points revert, and there is no internal transfer;
- no burn;
- no receiver callback at mint;
- `token_uri` is read-only and calls only the two game contracts' views;
- `Account`'s new storage does not overlap the player storage of the `paved` storage node.

### For the record: D-11 as first written

These were measured before D-11b, on the same base, and are kept in case transfers come back.

- **The owner check of Glitchbomb** (`owner_of` on every action, `Play.assert_caller_is_owner`) puts one external
  call into `build`. Measured:
  - +239,330 L2 gas on every move (a: 5,112,405 -> 5,351,735, +4.7 %; l: +3.9 %; two gas ceilings fail);
  - `Daily` +339 felts.
- **A cached owner** (the `Collection` rewrites `game.player_id` through a `Daily.transfer_game` hook at each
  transfer) kept every move identical to main, at a cost of `Daily` +333 felts (+241 for the hook's wrapper).
- D-11b makes both unnecessary.
