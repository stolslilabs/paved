# The selective buyer's edge under a per-token seed (D-23s)

Measured 2026-10-13 on main 7d04872 (D-18 economy defaults: `sigma` 0, `c` 1.222, cap `H` 5, mean 3,980).
Brief: `docs/briefs/d23s-selective-buyer.md`. Script: `scripts/montecarlo/selective.py`; its full output, with
every interval, is `scripts/montecarlo/selective.md`.

Under D-23, a Challenge game's seed is `Poseidon(salt, token id)`, where the token id is the Collection's global
counter at spawn. The next token id is known before the purchase. This note measures what a buyer gains by
checking the next deck with a bot, and buying only when the deck is good. It gives the figure; whether a VRF
becomes a mainnet gate is the owner's decision.

## 1. The model

**What the buyer sees.** The seed of the next id. `leaderboard.md` ("D-23: Daily becomes Challenge (planned)")
gives the planned source: the token id is the game id, the next is `game_count + 1`, and the salt is 0. Even a
non-zero salt would be readable, since contract storage is public. The seed fixes the 38 tiles of the deck (`Deck::tiles`). The order of the draws
also depends on the moves, because each build and discard reseeds the game (`Game::reseed`, from the tile's
position). So a deck is not one fixed sequence of tiles. But the whole game is a deterministic function of the
seed and of the moves, so the buyer can play any line offline before buying.

**The bot's prediction.** The buyer's own bot score on that deck is the sampler's greedy strategy (0):

- It is the sampler's best bot: mean 5,176 points on the 50 days of `scores.csv`, against 4,670 for noisy and
  1,405 for novice.
- It is deterministic, so each deck gets exactly one score.
- The score is not a forecast. It is a floor the buyer can lock in: replaying the bot's moves after the purchase
  gives exactly that score.
- If the player plays better than the bot (a person, or a search over lines offline, which the determinism
  allows), every deck scores higher. Both parts of the edge below then grow: the skill part, on any deck, and
  the selection part. The figures here are therefore a lower bound for a buyer at least as good as greedy.

**The decision.** Buy the next id when the bot's score is at or above a threshold `t`. Each threshold is a
percentile of the bot's score distribution (nearest rank). The table also gives a row "all ids": the same bot
with no selection.

**What a purchase pays.** `h(score / mean)` with sim.py's curve and calibration, imported from `sim.py`
(`payout_factor`, `chain_mean`, `calibrate`; the economy math is not copied):

- 0 below the mean (`sigma` 0);
- `c x score / mean` above it, with `c` 1.222 (E[h] = 0.9 on the population: 25 % greedy, 50 % noisy,
  25 % novice);
- capped at 5, which is reached at a score of 16,282 at the mean of 3,980.

The mean is the one the contract tracks: scores under 100 are left out, and each score is weighted by stake.
It is taken stationary, as `sim.py`'s calibration takes it.

**Two cases for the mean:**

- **Held.** A lone selective buyer among normal buyers. The others hold the mean at 3,980.
- **Fed.** The buyer's purchases enter the mean. At a share `s` of all purchases, the mean is `chain_mean` of
  the population sample weighted `1 - s`, plus the buyer's bought scores weighted `s` (equal stakes). The note
  shows `s` = 10 %, 50 % and 100 %. At 100 %, the buyer is the only buyer: zero traffic.

The edge is `E[h | bought] - 0.9`, and the ratio is `E[h | bought] / 0.9`. **Selection** is `E[h | bought]`
minus the same bot's E[h] on every id, in the same mean case. It isolates what knowing the deck adds to what
the bot's skill alone earns.

## 2. The data

- **The 50 greedy games of `scores.csv`** (days 11 to 60), plus **360 new greedy games**
  (`scripts/montecarlo/decks.csv`, days 61 to 420). Both use the same sampler, strategy 0 and seed 0, with
  `sampler.cairo` unchanged. A new deck only needs a new day.
- **410 distinct decks.** The sampler's seed is `Poseidon(0, 1000 + day)`: the Daily seed of the salt 0 and
  the tournament id `day(index) / 86400`. Every day has its own tournament id, so every day is a distinct
  Poseidon seed. With D-23's salt 0, that is exactly the seed of token id `1000 + day`. So the 410 decks are the
  decks of token ids 1,011 to 1,420, as long as the deck and the draw code stay as they are. The script also
  checks that no day appears twice with two scores.
- **D-19.** The sample was played at main 7d04872, before D-19 (#331). D-19 skips the majority walk in single
  player and changes no golden, so the bot's scores carry over.
- **The 205 games of `scores.csv` are not 205 decks.** They are 50 decks: four bots on each of 50 days. Only the
  50 greedy games are one score per deck for this bot.
- **Why 410 is enough.**
  - At p90, the bought set is 42 decks. The 95 % interval on `E[h | bought]` (mean held) is ±0.10 around 2.59.
  - At p99, the bought set is 5 decks. The interval widens to [2.84, 3.25] and is reported as such.
  - Every conclusion below holds at the ends of its intervals.
- **Intervals.** A bootstrap: the 410 decks are resampled with replacement 2,000 times (fixed seed 23), and
  each threshold is recomputed on each resample. The intervals are the 2.5 and 97.5 percentiles.
- **The runs.** VPS, scarb 2.20.1 and snforge 0.64.0, under
  `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test --ignored test_sampler
  --max-n-steps 200000000 --max-threads 2`, one game per run, one run at a time.
  - The test build and the check game (day 10, which reproduces the golden's 5,121): 3:53 and 6,653,184 kB
    peak RSS.
  - The 360 games: 4,324 s in all, 8.5 to 26.8 s a run, 3,649,948 to 3,799,504 kB peak RSS a run.
  - None failed. Day 11 reproduced `scores.csv`'s 3,305.

The bot's scores on the 410 decks: mean 5,506, min 1,518, max 10,626; p50 5,479, p75 6,668, p90 7,743,
p95 8,143, p99 9,899.

## 3. The figures

95 % bootstrap intervals in brackets. No purchase in any case reaches the cap of `h`: 0.0 % [0.0 %, 0.0 %]
everywhere, since the best deck, 10,626, is below the 16,282 the cap needs at a mean of 3,980. The ids taken
are the same in every mean case:

| Threshold | Ids taken |
|---|---|
| p50 | 50.2 % |
| p75 | 25.1 % |
| p90 | 10.2 % |
| p95 | 5.1 % |
| p99 | 1.2 % |

**Mean held by the other buyers (3,980): a lone selective buyer.**

| Threshold | Score t | E[h \| bought] | Edge vs 0.9 | Ratio | Selection |
|---|---:|---:|---:|---:|---:|
| all ids | — | 1.501 [1.422, 1.575] | +0.601 [+0.522, +0.675] | 1.67 [1.58, 1.75] | 0 |
| p50 | 5,479 | 2.097 [2.035, 2.155] | +1.197 [+1.135, +1.255] | 2.33 [2.26, 2.39] | +0.596 [+0.538, +0.651] |
| p75 | 6,668 | 2.349 [2.275, 2.417] | +1.449 [+1.375, +1.517] | 2.61 [2.53, 2.69] | +0.848 [+0.774, +0.919] |
| p90 | 7,743 | 2.593 [2.497, 2.691] | +1.693 [+1.597, +1.791] | 2.88 [2.77, 2.99] | +1.092 [+0.987, +1.191] |
| p95 | 8,143 | 2.754 [2.619, 2.900] | +1.854 [+1.719, +2.000] | 3.06 [2.91, 3.22] | +1.253 [+1.109, +1.399] |
| p99 | 9,899 | 3.128 [2.843, 3.248] | +2.228 [+1.943, +2.348] | 3.48 [3.16, 3.61] | +1.626 [+1.348, +1.757] |

**Mean fed by the buyer, at 10 % of the purchases.**

| Threshold | Mean | E[h \| bought] | Edge vs 0.9 | Ratio | Selection |
|---|---:|---:|---:|---:|---:|
| all ids | 4,133 | 1.393 [1.319, 1.460] | +0.493 [+0.419, +0.560] | 1.55 [1.47, 1.62] | 0 |
| p50 | 4,265 | 1.957 [1.908, 2.002] | +1.057 [+1.008, +1.102] | 2.17 [2.12, 2.22] | +0.564 [+0.509, +0.618] |
| p75 | 4,347 | 2.151 [2.094, 2.202] | +1.251 [+1.194, +1.302] | 2.39 [2.33, 2.45] | +0.758 [+0.692, +0.822] |
| p90 | 4,427 | 2.332 [2.261, 2.402] | +1.432 [+1.361, +1.502] | 2.59 [2.51, 2.67] | +0.939 [+0.856, +1.020] |
| p95 | 4,479 | 2.447 [2.350, 2.550] | +1.547 [+1.450, +1.650] | 2.72 [2.61, 2.83] | +1.054 [+0.944, +1.163] |
| p99 | 4,601 | 2.706 [2.510, 2.786] | +1.806 [+1.610, +1.886] | 3.01 [2.79, 3.10] | +1.313 [+1.119, +1.409] |

**Mean fed by the buyer, at 50 % of the purchases.**

| Threshold | Mean | E[h \| bought] | Edge vs 0.9 | Ratio | Selection |
|---|---:|---:|---:|---:|---:|
| all ids | 4,743 | 1.075 [1.028, 1.128] | +0.175 [+0.128, +0.228] | 1.19 [1.14, 1.25] | 0 |
| p50 | 5,404 | 1.544 [1.479, 1.560] | +0.644 [+0.579, +0.660] | 1.72 [1.64, 1.73] | +0.470 [+0.418, +0.502] |
| p75 | 5,815 | 1.608 [1.590, 1.624] | +0.708 [+0.690, +0.724] | 1.79 [1.77, 1.80] | +0.533 [+0.483, +0.577] |
| p90 | 6,212 | 1.661 [1.641, 1.681] | +0.761 [+0.741, +0.781] | 1.85 [1.82, 1.87] | +0.587 [+0.533, +0.633] |
| p95 | 6,474 | 1.693 [1.667, 1.720] | +0.793 [+0.767, +0.820] | 1.88 [1.85, 1.91] | +0.619 [+0.563, +0.668] |
| p99 | 7,082 | 1.758 [1.710, 1.776] | +0.858 [+0.810, +0.876] | 1.95 [1.90, 1.97] | +0.683 [+0.617, +0.729] |

**Mean fed by the buyer, at 100 % of the purchases (the buyer alone).**

| Threshold | Mean | E[h \| bought] | Edge vs 0.9 | Ratio | Selection |
|---|---:|---:|---:|---:|---:|
| all ids | 5,506 | 0.753 [0.705, 0.783] | -0.147 [-0.195, -0.117] | 0.84 [0.78, 0.87] | 0 |
| p50 | 6,827 | 0.597 [0.548, 0.657] | -0.303 [-0.352, -0.243] | 0.66 [0.61, 0.73] | -0.156 [-0.209, -0.072] |
| p75 | 7,649 | 0.574 [0.494, 0.654] | -0.326 [-0.406, -0.246] | 0.64 [0.55, 0.73] | -0.179 [-0.259, -0.084] |
| p90 | 8,443 | 0.479 [0.330, 0.581] | -0.421 [-0.570, -0.319] | 0.53 [0.37, 0.65] | -0.273 [-0.425, -0.155] |
| p95 | 8,968 | 0.452 [0.327, 0.695] | -0.448 [-0.573, -0.205] | 0.50 [0.36, 0.77] | -0.300 [-0.428, -0.039] |
| p99 | 10,184 | 0.507 [0.215, 0.991] | -0.393 [-0.685, +0.091] | 0.56 [0.24, 1.10] | -0.245 [-0.533, +0.263] |

**The profit-maximising threshold (mean held).** Profit is in USDC per USDC paid, at stake 10. The value
of `h` comes from `sim.py`'s constants: the 70 % burn, the 5 % pool fee on the way in and the way out, and
the stake boost of 1.10. With a supply factor of 1 and no slippage, profit is `0.695 x h - 1`. It breaks
even at `h` 1.44, a score of 4,686.

- **Per purchase:** profit rises with `t` up to the best deck of the sample (10,626, +1.27 per USDC), since
  `h` grows with the score.
- **Per id observed:** profit peaks at `t` = 4,688, the break-even score. The buyer takes 66.3 % of the ids
  and makes +0.367 per USDC paid, or +0.244 per id observed. The same bot buying every id makes +0.043 per
  USDC paid.

**Skipping by buying at stake 1.** When no one else buys, the only way past a bad id is to buy it. The buyer
then takes every id: stake 10 at or above `t`, stake 1 below. The table gives USDC back per USDC paid
(`selective.md`, last table):

| Threshold | Buyer alone: mean | Return | Mean held: return |
|---|---:|---:|---:|
| all ids, stake 10 | 5,506 | 0.523 | 1.043 |
| p50 | 6,588 | 0.471 | 1.377 |
| p75 | 6,992 | 0.555 | 1.436 |
| p90 | 6,915 | 0.596 | 1.371 |
| p99 | 5,969 | 0.465 | 1.080 |

## 4. What it means

**The baseline, first.** E[h] = 0.9 is the average over a population that is one quarter novice. The greedy
bot is better than that population, so it earns 1.50 on any deck with no selection at all. That skill edge is
the game working as designed, and a VRF does not change it. Knowing the deck adds the **selection** column on
top of it.

**Normal traffic** (the buyer is a small share of the purchases; the mean is held or barely moved).

- Buying only the decks at or above the bot's median adds +0.60 to `h` (2.10 against 1.50).
- Buying the top 10 % adds +1.09 (2.59).
- At 10 % of the traffic, the buyer's own scores raise the mean by 4 to 16 %, and these figures drop by
  7 to 13 %. They stay large.
- The id is consumed by others quickly, so the buyer sees a fresh deck after every purchase by anyone else.
- In money, mean held, at stake 10: buying every deck the bot scores at 4,688 or more returns +0.37 per USDC,
  against +0.04 for the same bot buying blind. Nothing reaches the cap of `h`.

**Low traffic** (others buy rarely, the mean is mostly theirs).

- The buyer waits for someone else to take a bad id, or buys it at stake 1 to move on.
- Skipping at stake 1 while the others still hold the mean returns 1.38 to 1.44 per USDC at the p50 to p75
  thresholds, against 1.04 for blind stake-10 play.
- Waiting costs only time, and the buyer's take is bounded by how many ids the others consume.

**Zero traffic** (the buyer is alone and feeds the whole mean).

- Selection does not pay. The mean becomes the buyer's own average, so many of the decks it buys score below it.
- E[h | bought] falls to 0.45 to 0.60, below the 0.75 of buying every id, and skipping at stake 1 returns
  0.47 to 0.60 per USDC.
- The edge exists only when other players hold the mean. It is taken from them through the curve, and from
  the house through a mint above 0.9 of the burn.

## 5. What a VRF, or a seed revealed after the purchase, removes

- **What it removes.** If the seed is unknown when the purchase is final, the buyer cannot score the next deck,
  and every purchase is a blind draw. The **selection** column goes to zero in every case. What stays is the
  skill row, "all ids": 1.50 for this bot with the mean held, as for any good player on any deck.
- **The condition.** The purchase must not be undone after the seed is known. If the seed is drawn and the game
  spawned in the same transaction as the purchase, a contract can read the seed and revert on a bad deck. A
  greedy game is far too expensive to run in that transaction, but a cheap test of the deck's composition is
  not. A reveal in a later transaction, after the purchase is final, closes this.
- **What it does not change.** Neither change touches the curve, `c`, the mean or the cap.
