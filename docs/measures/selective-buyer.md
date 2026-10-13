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
- **Fed.** The buyer's purchases enter the mean. `s` is the buyer's share of the purchases, counted in
  purchases. In the mean, each purchase weighs its stake, as on chain:
  - the buyer stakes 10 on every deck it buys (1 or 10 in the skipping strategy below);
  - the other buyers stake 3.41 on average, under `sim.py`'s base stake mix (`inverse`).
  So at `s` = 10 %, the buyer holds about 25 % of the weight of the mean. The mean is `chain_mean` of the
  population sample, weighted `(1 - s) x 3.41`, plus the buyer's scores, each weighted `s x stake / n`. The same
  function gives the mean of both the threshold buyer and the skipping strategy. The note shows `s` = 10 %,
  50 % and 100 %. At 100 %, the buyer is the only buyer: zero traffic.

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
  - Every conclusion below holds at the ends of its intervals, with one exception: at zero traffic, p99. There
    the interval of the selection, [-0.53, +0.27], spans 0, so the 5 decks leave the sign undetermined. At zero
    traffic, the conclusion "selection does not pay" holds from p50 to p95.
- **Intervals.** A bootstrap: the 410 decks are resampled with replacement 2,000 times (fixed seed 23), and
  each threshold is recomputed on each resample. The intervals are the 2.5 and 97.5 percentiles.
  - They are conditional on the P-46 calibration: the mean 3,980, `c` 1.222 and the population sample are held
    fixed.
  - So they leave out the uncertainty of the 50-deck calibration that sets `c`.
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
| all ids | 4,355 | 1.270 [1.207, 1.324] | +0.370 [+0.307, +0.424] | 1.41 [1.34, 1.47] | 0 |
| p50 | 4,679 | 1.783 [1.749, 1.815] | +0.883 [+0.849, +0.915] | 1.98 [1.94, 2.02] | +0.514 [+0.465, +0.563] |
| p75 | 4,881 | 1.916 [1.878, 1.949] | +1.016 [+0.978, +1.049] | 2.13 [2.09, 2.17] | +0.646 [+0.590, +0.701] |
| p90 | 5,076 | 2.033 [1.988, 2.078] | +1.133 [+1.088, +1.178] | 2.26 [2.21, 2.31] | +0.763 [+0.696, +0.826] |
| p95 | 5,205 | 2.106 [2.045, 2.169] | +1.206 [+1.145, +1.269] | 2.34 [2.27, 2.41] | +0.836 [+0.755, +0.913] |
| p99 | 5,504 | 2.262 [2.145, 2.309] | +1.362 [+1.245, +1.409] | 2.51 [2.38, 2.57] | +0.992 [+0.871, +1.058] |

**Mean fed by the buyer, at 50 % of the purchases.**

| Threshold | Mean | E[h \| bought] | Edge vs 0.9 | Ratio | Selection |
|---|---:|---:|---:|---:|---:|
| all ids | 5,118 | 0.924 [0.883, 0.960] | +0.024 [-0.017, +0.060] | 1.03 [0.98, 1.07] | 0 |
| p50 | 6,103 | 1.039 [0.969, 1.096] | +0.139 [+0.069, +0.196] | 1.15 [1.08, 1.22] | +0.115 [+0.048, +0.174] |
| p75 | 6,715 | 1.345 [1.194, 1.395] | +0.445 [+0.294, +0.495] | 1.49 [1.33, 1.55] | +0.421 [+0.276, +0.490] |
| p90 | 7,307 | 1.412 [1.405, 1.420] | +0.512 [+0.505, +0.520] | 1.57 [1.56, 1.58] | +0.488 [+0.452, +0.530] |
| p95 | 7,699 | 1.424 [1.414, 1.433] | +0.524 [+0.514, +0.533] | 1.58 [1.57, 1.59] | +0.500 [+0.463, +0.543] |
| p99 | 8,605 | 1.447 [1.430, 1.453] | +0.547 [+0.530, +0.553] | 1.61 [1.59, 1.61] | +0.523 [+0.483, +0.562] |

**Mean fed by the buyer, at 100 % of the purchases (the buyer alone).**

| Threshold | Mean | E[h \| bought] | Edge vs 0.9 | Ratio | Selection |
|---|---:|---:|---:|---:|---:|
| all ids | 5,506 | 0.753 [0.705, 0.783] | -0.147 [-0.195, -0.117] | 0.84 [0.78, 0.87] | 0 |
| p50 | 6,827 | 0.597 [0.548, 0.657] | -0.303 [-0.352, -0.243] | 0.66 [0.61, 0.73] | -0.156 [-0.209, -0.072] |
| p75 | 7,649 | 0.574 [0.494, 0.654] | -0.326 [-0.406, -0.246] | 0.64 [0.55, 0.73] | -0.179 [-0.259, -0.084] |
| p90 | 8,443 | 0.479 [0.330, 0.581] | -0.421 [-0.570, -0.319] | 0.53 [0.37, 0.65] | -0.273 [-0.425, -0.155] |
| p95 | 8,968 | 0.452 [0.327, 0.695] | -0.448 [-0.573, -0.205] | 0.50 [0.36, 0.77] | -0.300 [-0.428, -0.039] |
| p99 | 10,184 | 0.507 [0.216, 0.994] | -0.393 [-0.684, +0.094] | 0.56 [0.24, 1.10] | -0.245 [-0.529, +0.266] |

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

| Threshold | Score t | Mean held | Fed 10 % | Fed 50 % | Buyer alone |
|---|---:|---:|---:|---:|---:|
| all ids, stake 10 | 1,518 | 1.043 (3,980) | 0.882 (4,355) | 0.642 (5,118) | 0.523 (5,506) |
| p50 | 5,479 | 1.377 (3,980) | 1.239 (4,378) | 0.869 (5,592) | 0.471 (6,588) |
| p75 | 6,668 | 1.436 (3,980) | 1.321 (4,269) | 0.986 (5,452) | 0.555 (6,992) |
| p90 | 7,743 | 1.371 (3,980) | 1.294 (4,153) | 1.005 (5,037) | 0.596 (6,915) |
| p95 | 8,143 | 1.265 (3,980) | 1.214 (4,099) | 0.972 (4,765) | 0.531 (6,599) |
| p99 | 9,899 | 1.080 (3,980) | 1.048 (4,050) | 0.886 (4,468) | 0.465 (5,969) |

## 4. What it means

**The baseline, first.** E[h] = 0.9 is the average over the calibration population: 25 % greedy, 50 % noisy
(mean 4,670) and 25 % novice (mean 1,405). The greedy bot plays better than that mix, so it earns more than 0.9
on any deck with no selection at all:

- On the 50 calibration decks of `scores.csv` (mean score 5,176), the blind bot's E[h] is 1.37.
- On the 410 decks (mean score 5,506), it is 1.50.

So about 0.13 of the 0.60 is the difference between the two samples: the 360 new decks score higher on
average. The other 0.47 is skill. Either way, this edge is the game working as designed, and a VRF does not
change it. Knowing the deck adds the **selection** column on top of it.

Model estimates (PM request, 2026-10-13): the `c` that brings the blind greedy bot to E[h] 0.9 is 0.804
(`slope_bps` 8,037) on the 50 calibration decks, or 0.733 (7,329) on the 410. The mix then falls to 0.59 or
0.54.

**Normal traffic** (the buyer is a small share of the purchases; the mean is held or barely moved).

- Buying only the decks at or above the bot's median adds +0.60 to `h` (2.10 against 1.50).
- Buying the top 10 % adds +1.09 (2.59).
- At 10 % of the purchases (about 25 % of the stake-weighted mean), the buyer's own scores raise the mean by
  9 to 38 %. `E[h | bought]` then drops by 15 to 28 %, to 1.78 at p50 and 2.03 at p90. The selection is
  +0.51 to +0.99.
- The id is consumed by others quickly, so the buyer sees a fresh deck after every purchase by anyone else.
- In money, mean held, at stake 10: buying every deck the bot scores at 4,688 or more returns +0.37 per USDC,
  against +0.04 for the same bot buying blind. Nothing reaches the cap of `h`.

**Low traffic** (others buy rarely, so the buyer makes a large share of the purchases).

- The buyer waits for someone else to take a bad id, or buys it at stake 1 to move on. The skipping table
  gives the second.
- At 10 % of the purchases, skipping at stake 1 returns 1.21 to 1.32 per USDC (p50 to p95), against 0.88 for
  blind stake-10 play.
- At 50 % of the purchases, it returns 0.87 to 1.01, against 0.64 blind. It still beats blind play, but it is
  near break-even.
- Mean held, 1.38 to 1.44 (p50 to p75) is the upper bound: the case where others hold the whole mean.
- Waiting is not measured. Its take is bounded by how many ids the others consume.

**Zero traffic** (the buyer is alone and feeds the whole mean).

- From p50 to p95, selection does not pay. The mean becomes the buyer's own average, so many of the decks it
  buys score below it.
  - E[h | bought] falls to 0.45 to 0.60, below the 0.75 of buying every id.
  - Skipping at stake 1 returns 0.47 to 0.60 per USDC.
- At p99 (5 decks) the sign is undetermined.
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
