# D-18d brief: the score sample and the economy Monte-Carlo under D-18

Track CORE of Paved. Commit this brief as `docs/briefs/d18d-montecarlo-resample.md`, as the first commit of your PR.

## Context

- D-18 (#324, 7cb515f) removed the characters. Every structure now scores when it closes, with power 1. The score
  distribution of Daily games has therefore changed. For example, the full-deck golden went from 3,554 to 5,121.
- `docs/architecture/economy.md` calibrates the P8 curve on a score sample of 205 bot games (section "The sample",
  around line 332, and the figures at lines 44, 78, 247, 267-269 and 311):
  - `c = 1.813`, from `rho = E[h] = 0.9` on the sample;
  - the initial mean is 3,353 points, "set at deploy";
  - the 99th percentile of `h` is about 4.6;
  - 69 % of the games are below the mean.
- The sample comes from `scripts/montecarlo/sampler.cairo`, one game per snforge run, written to `scores.csv`.
  `sim.py` reads the sample and prints `output.md`.
- `sampler.cairo` no longer compiles on main: it uses `Role`, `Spot`, `builder.characters` and the six-argument
  `build`. Its strategies 1, 2 and 3 differ only by characters.
- `scripts/bench/mock-chain.ts` still has `occupied_spot` in its `TileRow` (line 36).

## Goal

1. **The sampler under D-18.** Make `sampler.cairo` compile and play on main.
   - Remove characters from every strategy.
   - Strategies that differed only by characters now collapse into one. Keep their ids, so `scores.csv` stays
     comparable, and say which ids now play the same game.
   - Keep the seeds and the days, so each game is the same deal as before.
   - Explain how it is run (where it is copied, the command), as `economy.md` does today, and keep that text true.
2. **Resample.** Play the same 205 games (same days, strategies and seeds) and write the new `scores.csv`. Show the old
   and new figures side by side:
   - mean, median, p90, p99, min, max;
   - the full-deck golden: it must reproduce 5,121.
3. **Re-run `sim.py`** on the new sample. It must stay deterministic: two runs give the same output, byte for byte.
   Commit the new `output.md`. Give the old and new value of every calibrated figure:
   - `c`;
   - the initial mean;
   - the p99 of `h`, and the share of games at the cap;
   - the share of games below the mean;
   - every other figure of `economy.md` that comes from `output.md`.
4. **`economy.md`.** Update the figures that come from the sample or from `sim.py`, and the text of "The sample".
   - Add a dated line: "Resampled under D-18 (2026-10-13)".
   - Do **not** change a parameter that a decision fixed: `sigma`, `rho`, `H`, `T`, the boost, BURN or BASE_PRICE.
     Only figures derived from them change.
   - If D-18 moves a figure past a limit that the text states (for example the cap of `h`, or a percentile that a
     gate names), flag it in the PR body under "For the PM". Do not change the rule.
5. **Where `c` and the initial mean live.** Read the contracts and `scripts/deploy.sh`:
   - is `c` a constant, a constructor argument or stored state?
   - is the initial mean (or its testnet value) passed at deploy?
   - what values does Sepolia's deployment hold (read `contracts/deployments/sepolia.json` and the code; send
     nothing)?
   - does the upgrade of `Daily`, `Tutorial` and `Account` planned for Sepolia (D-18c) need to change any of them?
   Answer in the PR body under "For D-18c". Change no contract and no deploy script.
6. **`mock-chain.ts`.** Remove `occupied_spot` from `TileRow`, and anything else in `scripts/bench/**` that still
   models characters. Check first what CLIENT's #322 already changed there. Run its test or typecheck, whichever
   exists.

## Runs (VPS, D-251)

- scarb 2.20.1 and snforge 0.64.0 from `~/.asdf/installs/`.
- snforge: `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter> --max-threads 2`.
- Only after `free -g` shows 8 GB or more available. One run at a time. Record the peaks, and the wall time of the
  whole resample.
- A run with no progress for 15 minutes is stopped and reported.
- `python3 -I scripts/montecarlo/sim.py`, standard library only.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- Never `git rebase`. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `scripts/montecarlo/**`, `scripts/bench/**`.
- `docs/architecture/economy.md`: only the figures from the sample and `sim.py`, the text of "The sample", and the
  dated line.
- `docs/briefs/d18d-montecarlo-resample.md`.
- Not `contracts/**`, not `packages/**`, not `scripts/deploy.sh`, not `contracts/deployments/**`.

## PR

- Title: `chore: D-18 score sample and economy Monte-Carlo resampled`.
- Body:
  - the sampler changes, and the strategy ids that collapsed;
  - the old and new sample statistics;
  - the old and new calibrated figures;
  - "For the PM": any figure past a stated limit;
  - "For D-18c": where `c` and the initial mean live, and what Sepolia holds;
  - the `mock-chain.ts` change.
- Report: the PR's number and head, everything in the body, and the peaks. Do not merge. A review follows.
