# D-23s brief: the selective buyer's edge under a per-token seed (measure)

Track CORE of Paved. A measurement task. Commit this brief as `docs/briefs/d23s-selective-buyer.md`, as the first commit of
your PR.

## Context

- **D-23** (owner, via the PM, 2026-10-13): Daily becomes Challenge. Each game's seed is Poseidon(salt, token id),
  where the token id is the Collection's global counter at spawn. The token id of the next purchase is therefore known
  before the purchase.
- **The risk (P-50 ruling 4).** A player can:
  1. read the next token id;
  2. compute the next deck;
  3. score that deck with a bot;
  4. buy only when the deck is good.
  At low traffic nobody else takes the id between the check and the purchase. A bad id is skipped only when someone
  else buys it.
- **The PM asks for the edge of such a selective buyer** against E[h] = 0.9 at today's `c` (1.222, `slope_bps`
  12,220; P-46). The owner decides from it whether a VRF (Cartridge's) becomes a mainnet gate.
- **The economy model** is `docs/architecture/economy.md`: the curve, `h`, `c`, the cap, the mean and the sample.
  `scripts/montecarlo/sim.py` computes it from `scores.csv`. `sampler.cairo` plays one game per snforge run, under
  D-18 (#326), with fixed days, strategies and seeds.

## Goal

1. **The model of the selective buyer.** Write down:
   - What the buyer sees: the deck of the next id. The deck depends only on the seed.
   - The bot's prediction: the buyer's own bot score on that deck, as a proxy for what the buyer will score. Use the
     sampler's best strategy. Say why, and what changes if the player plays better than the bot.
   - The decision: buy when the predicted score is at or above a threshold `t`.
   - What a purchase pays: `h` at that score, against the current mean, as `sim.py` computes it.
     - The mean moves with the scores bought. Model both cases: a lone selective buyer among normal buyers (the mean
       is held by the others), and a selective buyer whose purchases feed the mean (say how much at a given share of
       traffic).
2. **The data.** Score each deck once with the bot. The sampler today has 205 games over a few days.
   - A threshold test needs the score distribution over many distinct decks. Under D-23 every seed is a fresh
     random deck, so the 205 games can serve if they are distinct decks. Check that they are.
   - If more decks are needed for the tail (p90 and above), sample more seeds with the same sampler and strategy.
     Measure the wall time of a few games first, and keep the run under about 2 hours. Say how many decks you used
     and why that is enough. Give a confidence interval (bootstrap) on each edge.
3. **The figures**, for thresholds at the score percentiles p50, p75, p90, p95 and p99 of the bot's distribution:
   - the share of ids the buyer takes;
   - E[h | bought];
   - the edge against 0.9: E[h | bought] - 0.9, and the ratio;
   - the share of purchases at the cap of `h`;
   - each of these in both mean cases of point 1.
   Add one line: the threshold that maximises the buyer's expected profit per purchase, and per id observed.
4. **A note** `docs/measures/selective-buyer.md`:
   - the model;
   - the data and its size;
   - the table with intervals;
   - what it means at zero traffic, at low traffic and for normal traffic: in a few plain sentences, for the
     PM and the owner;
   - what a VRF, or a seed revealed after the purchase, removes.
   No recommendation on the gate: that is the owner's decision. Give the figure.

## Rules

- **Determinism.** The analysis script uses the standard library only (`python3 -I`), like `sim.py`. It gives the
  same output twice.
- **`sim.py` is unchanged.** Import its functions; do not copy or change the economy math. If it must change, stop and
  report.
- If you resample: one snforge run at a time, the D-251 runs below, and the new decks in a separate file, never
  overwriting `scores.csv`.

## Runs (VPS, D-251)

- scarb 2.20.1 and snforge 0.64.0 from `~/.asdf/installs/`.
- snforge: `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter> --max-threads 2`.
- Only after `free -g` shows 8 GB or more available. Record the peaks and the wall time.
- A run with no progress for 15 minutes is stopped and reported.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`.** If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- New files under `scripts/montecarlo/` (an analysis script, and a new scores file if you resample). `sampler.cairo`
  only if a resample needs a new seed range: then say exactly what changed.
- `docs/measures/selective-buyer.md` (new).
- `docs/briefs/d23s-selective-buyer.md`.
- Not `sim.py`, `scores.csv`, `output.md` or `fixture.py`; not `economy.md` (another task holds it); not `contracts/**`
  or `packages/**`.

## PR

- Title: `docs: D-23 selective buyer's edge under a per-token seed (measure)`.
- Body: the model in short, the data, the table, the plain reading, and the determinism check.
- Report: the PR's number and head, the table, the wall time and the peaks. Do not merge. A review follows.

