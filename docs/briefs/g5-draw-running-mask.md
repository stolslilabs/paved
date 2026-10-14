# G5 brief: cut the draw's variable cost (gas)

Track CORE of Paved. The next of the owner's gas iterations (PM, 2026-10-14), after G1 (#363) and G4 (#366). A review
follows. Commit this brief as `docs/briefs/g5-draw-running-mask.md`, as the first commit of your PR.

## The cost

- G1 found it (#363, its report): the draw's variable cost is `slot_card`'s 128-bit power per withdrawn card it steps
  over (`contracts/src/helpers/random_deck.cairo`). A running mask would cut it without changing which card is drawn.
- Measure first: the draw's cost on the move scenarios of `docs/measures/baseline.md` ("After G4"), and how it grows
  with the number of cards already withdrawn.

## Goal

1. **Draw the same card, more cheaply.** Replace the per-card power with a running mask, or another method you
   justify. The rule:
   - **every draw returns exactly the same card as today, for every deck and every withdrawn set**;
   - no golden changes;
   - the parity fixture does not change, so CLIENT's engine needs nothing.
   Prove equality:
   - a test that compares the new draw with the old one (kept as a test-only reference) over many seeds and
     withdrawn sets, including the edges (the first draw, the last card, a deck with every card but one withdrawn);
   - the goldens unchanged (`git diff` of `contracts/src/tests/golden/**` and `docs/measures/golden-games.md`: none);
   - the parity fixture unchanged.
2. **Measure.** Every scenario of `baseline.md`, before and after, in an "After G5" table, with spawn and the draw-heavy
   moves first.
   - Ceilings reset to measured + 5 % where a figure falls; none may rise.
   - Scenario f is the tightest: say where it lands.
   - Challenge's CASM against the P-44 cap.
3. **Storage and ABI:** no change. Say so (`scripts/abis.sh` shows no diff).
4. **Sepolia:** this ships in a later D-17 upgrade of Challenge. A game in flight draws the same cards before and after
   by construction. Say so, and add an upgrade test only if the draw reads any state differently.

## Runs (VPS, D-251)

- scarb 2.20.1 and snforge 0.64.0 from `~/.asdf/installs/`.
- snforge: `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter> --max-threads 2`.
- scarb build: `prlimit --as=12884901888`.
- Only after `free -g` shows 8 GB or more available. One build at a time. Record the peaks.
- Scoped runs first (random_deck, golden, gas, oracle), then the whole suite once.
- A capped run with no progress for 15 minutes is stopped and reported.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `contracts/src/**`, `contracts/tests/**` (ceilings).
- `docs/measures/baseline.md`, `docs/architecture/class-headroom.md`.
- `docs/briefs/g5-draw-running-mask.md`.
- Not `scripts/**`, not `packages/**`, not `contracts/deployments/**`, not `contracts/abis/**` (no ABI may change).

## PR

- Title: `perf: G5, the draw's running mask (gas), same cards drawn`.
- Body:
  - the design;
  - the equality proof;
  - goldens and parity unchanged;
  - gas before and after;
  - sizes;
  - one line on why no audit: the draw's result is unchanged and proven equal, and no state or ABI changes.
- Report: the PR's number and head, everything in the body, and the peaks. Do not merge.
