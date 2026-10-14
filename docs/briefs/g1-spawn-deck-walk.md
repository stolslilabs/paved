# G1 brief: cut spawn's deck walk (gas)

Track CORE of Paved. The first of the owner's gas iterations (PM, 2026-10-14), needed for the mainnet fee estimates.
A review and a correctness audit follow: this changes the deck every game is drawn from. Commit this brief as
`docs/briefs/g1-spawn-deck-walk.md`, as the first commit of your PR.

## The cost

- Spawn costs about 51M L2 gas, and about 35M of that is `Deck::tiles` (`contracts/src/types/deck.cairo:102`). It walks
  the indexes of the full tile set with one Poseidon per free index, removing tiles with a dynamic probability until
  the deck has `count()` tiles.
- Measured in #354 (D-23b): spawn m 49,873,311 and n 50,599,761 on main; the walk's length depends on the seed. See
  `docs/measures/baseline.md`, "After D-23".

## Goal

1. **Build the deck more cheaply.** Choose a design and justify it in the PR. Options to weigh:
   - a single Poseidon per batch of indexes, with random bits taken from the hash in slices;
   - a Fisher-Yates partial shuffle drawing the removed indexes directly;
   - any other method.
   The deck must stay:
   - uniform: each subset of `count()` tiles equally likely, or say exactly how it deviates and why that is
     acceptable;
   - deterministic from the seed;
   - stored as today (the bitmap), so the draw path reads it unchanged.
   Prove uniformity with a test or an argument in the PR: a sampled frequency test over many seeds, at least.
2. **The goldens change. This is a rule change, ruled by the PM (2026-10-14), which P0 requires.**
   - Every deck changes, so every golden's expected values change.
   - **Independence:** the new expected values must not come from running the new code alone. Derive them as D-18b
     did: the oracle's walks (`src/tests/oracle.cairo`, `differential.cairo`) over the new decks, then check the
     structure state against them.
   - Hand-check one golden game's total in the PR body.
   - Record the rule change in `docs/measures/golden-games.md`, with its date and the PM's ruling.
3. **The parity fixture** (`docs/architecture/parity-fixture.md` and its file): regenerate it from the new goldens.
   Tell CLIENT in the PR body what changed. CLIENT keeps its frozen tutorial golden (from 38f1c95), which this does not
   touch.
4. **Games in flight across the upgrade.** Sepolia gets this later by a D-17 upgrade of Challenge, not by a new
   deployment.
   - State in the PR how a game started before the upgrade behaves after it. Today the deck is built at spawn and
     stored as a bitmap: is any later draw or step reading the walk again? If no, a game in flight keeps its deck.
   - Prove it with a test: the old class spawns a game, the class is upgraded, the game is finished, and every draw
     matches the old deck. `tests/e2e/upgrade_d18.cairo` and `upgrade_d19.cairo` are the models.
5. **Measure.**
   - Spawn (m, n) and every scenario of `baseline.md`, before and after, in an "After G1" table.
   - Give the walk's cost alone, before and after.
   - Reset the ceilings to the measured value plus the usual 5 % where a figure falls. Scenario f is the tightest
     (98.05 %): say where it lands.
   - Challenge's CASM against the P-44 cap.

## Runs (VPS, D-251)

- scarb 2.20.1 and snforge 0.64.0 from `~/.asdf/installs/`.
- snforge: `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter> --max-threads 2`.
- scarb build: `prlimit --as=12884901888`.
- Only after `free -g` shows 8 GB or more available. One build at a time. Record the peaks.
- Scoped runs first (deck, golden, oracle, differential, upgrade, gas), then the whole suite once.
- A capped run with no progress for 15 minutes is stopped and reported.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network.

## Git

- Push the branch the plugin created for this thread right after the brief commit: CLIENT may build on it for the
  parity fixture.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `contracts/src/**`, `contracts/tests/**`.
- `contracts/abis/**`, through `scripts/abis.sh`, only if an ABI changes (none should: say so).
- The parity fixture's file and `docs/architecture/parity-fixture.md`.
- `docs/measures/baseline.md`, `docs/measures/golden-games.md`, `docs/architecture/class-headroom.md`.
- `docs/briefs/g1-spawn-deck-walk.md`.
- Not `packages/**`, not `scripts/**` (unless the parity fixture's generator lives there; then that file only, and say
  so), not `contracts/deployments/**`, and not `docs/architecture/upgrade-owner.md`, which another task writes.

## PR

- Title: `perf: G1, spawn's deck walk cut (gas), goldens re-derived`.
- Body:
  - the design;
  - uniformity, with its evidence;
  - the goldens: how they were derived, and the hand-checked game;
  - the parity fixture, and "For CLIENT";
  - games in flight across the upgrade, with the test;
  - gas before and after, spawn first;
  - sizes;
  - one line on the audit: correctness, since the deck is what every score is drawn from.
- Report: the PR's number and head, everything in the body, and the peaks. Do not merge.

