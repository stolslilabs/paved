# D-23b brief: Daily becomes Challenge, and each game's seed comes from its token id

Track CORE of Paved. The last contract step before the fresh Sepolia deployment (F), after step E (#350). A review and
a correctness audit follow: the rename touches every file, and the seed change touches what every score is drawn from.
Commit this brief as `docs/briefs/d23b-challenge-rename-seed.md`, as the first commit of your PR.

## The specification

- D-23 and P-50 in `docs/programme/DECISIONS.md`, and P-53's order.
- `docs/architecture/leaderboard.md`, "D-23: Daily becomes Challenge (planned)":
  - the table of external names that change;
  - "Storage: no address moves";
  - who reads `contracts.Daily`;
  - the seed.
- `docs/architecture/public-interface.md`, "Breaking change D-23".
- That section was written before D-20, D-21, D-24 and E, so its line numbers are stale and some rows are already
  gone (`IDailyQuests`, `lobby_class`, `DailySeed`'s tutorial branch). Re-read the code.
- What changed since, already decided:
  - **Sepolia gets one fresh deployment (P-53), not an in-place upgrade.** Ignore the note's "Daily is upgraded in
    place" lines.
  - **The day id is `day_id` since D-20** (`GameSpawned`, `GameOver`, `GameView`, `current_day()`), not
    `tournament_id`.
  - **The PM's addition:** remove the `PlayerCreated` variant from the event enum. Do it only once CLIENT's W1d (#349)
    is on main and `packages/indexer/src/events.test.ts` on main no longer reads it. Check with grep first. If it
    still reads it, keep the variant and say so.

## What to build

1. **The rename (P-50 ruling 1).** Every external name, per the note's table, as main is now:
   - the contract and module: `systems/daily.cairo` becomes `systems/challenge.cairo`, contract `Challenge`;
   - the interfaces and impls, the ABI file (`Challenge.json`) and the event enum path;
   - `Mode::Daily` becomes `Mode::Challenge`, with **code 1 unchanged**; the felt `'DAILY'` becomes `'CHALLENGE'`;
   - the constants and the error strings;
   - `Collection.daily()` becomes `challenge()`. **`Collection`'s storage field `daily` keeps its name (P-42)**: its
     address is `sn_keccak("daily")`. Only the view is renamed;
   - `scripts/deploy.sh`'s devnet and fresh path: `Challenge` everywhere, and the deployment file it writes keys the
     contract `contracts.Challenge`.
   - **No storage name changes.** Pin `Collection.daily` by name, as the other dead or kept fields are pinned.
   - **Do not touch `--repoint` and `--d18`.** They run from the pinned commit 06c024d against the live
     `sepolia.json`'s `contracts.Daily`. If the artifact checker then sees `Daily` loaded only in those paths, add
     `Daily` to its `PINNED_06C024D` allow-list, scoped to those paths as Account and Lobby are.
   - The docs:
     - rename across `docs/architecture/**` and the root `readme.md`;
     - keep "Daily" where it names history (decisions D-1 to D-22, the measures of past phases, the "As built" sections
       of past phases);
     - `docs/programme/DECISIONS.md` rows stay as written.
2. **The seed (P-50 ruling 2).**
   - A new `TokenSeed`, `impl TokenSeedImpl of SeedSource<TokenSeed>`: Poseidon(salt, token id), where the token id is
     the game id.
   - `SeedSource` stays.
   - `DailySeed` and `Mode::seed`'s day branch go.
   - Spawn uses `TokenSeed`.
   - The day id stays as it is, computed from the time, for `day_id` and the economy.
   - **The goldens stay identical (P0).** The harness spawns through `spawn_with` with a test source that gives the old
     day seed (the pattern of `tests/seed.cairo`), so every expected value stays. A new test pins `TokenSeed`: two games
     of the same day get different seeds, equal to Poseidon(salt, id).
   - The parity fixture (`docs/architecture/parity-fixture.md`): its games are keyed by the seed or the deck. Say
     whether it changes, and keep CLIENT's replay valid.
3. **E-1 goes (P-50 ruling 4).** Mark risk E-1 (the replay of the shared day deck) "retired by D-23" in `economy.md`.
   Leave `scripts/montecarlo/sim.py`'s replayer strategy as it is: the base population does not use it, and changing
   the simulation is not this task. Say so in one line.
4. **`PlayerCreated`**: see the PM's addition above.

## Tests

- The whole suite, with the goldens unchanged. Show the diff of `contracts/src/tests/golden/**` and
  `docs/measures/golden-games.md`: none.
- `TokenSeed`'s test. The seed source of spawn: a Challenge spawn's seed is Poseidon(0, game id).
- `Mode` code 1 is `Challenge`. Codes 2 and 3 still read as `None`.
- `Collection.daily`'s storage pin, and `challenge()` returns it.
- The ABIs: regenerate with `scripts/abis.sh`. `Daily.json` becomes `Challenge.json`, with no other ABI change than the
  names, plus `PlayerCreated` if removed. Write the diff into public-interface.md's D-23 section as built.
- `scripts/test-deploy-url.sh` and `scripts/check-artifact-names.sh` green.
- The devnet deploy (`deploy.sh devnet` on a local starknet-devnet) runs end to end and writes `contracts.Challenge`.
- Gas and sizes: no scenario past its ceiling; give Challenge's CASM. A rename should change nothing but path strings.

## Runs (VPS, D-251)

- scarb 2.20.1 and snforge 0.64.0 from `~/.asdf/installs/`.
- snforge: `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter> --max-threads 2`.
- scarb build: `prlimit --as=12884901888`.
- Only after `free -g` shows 8 GB or more available. One build at a time. Record the peaks.
- Scoped runs first, then the whole suite once.
- A capped run with no progress for 15 minutes is stopped and reported.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network.
- For `scripts/test-deploy-url.sh`, put Node 24's binary first on `PATH`.

## Git

- **Push the branch right after the brief commit**: CLIENT builds its PR on it. Then keep pushing.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `contracts/src/**`, `contracts/tests/**`, and `contracts/abis/**` through `scripts/abis.sh`, plus its README.
- `scripts/deploy.sh` (devnet and fresh paths only), `scripts/test-deploy-url.sh`, `scripts/abis.sh`,
  `scripts/check-artifact-names.sh`.
- `docs/architecture/**`, the root `readme.md`, `docs/measures/**` (figures, and names outside history).
- `docs/briefs/d23b-challenge-rename-seed.md`.
- Not `packages/**`, not `contracts/deployments/**`, not `scripts/signer/**` (unless it names the `Daily` artifact:
  then names only, and say so), not `scripts/montecarlo/**`, and not the `--repoint` and `--d18` paths.

## PR

- Title: `feat: D-23, Daily becomes Challenge, and the seed comes from the token id`.
- Body:
  - the rename table, as built;
  - storage: no address moved, with the `Collection.daily` pin;
  - the seed: the old source and the new;
  - the goldens unchanged, and how;
  - the ABI diff;
  - `PlayerCreated`: removed or kept, and why;
  - deploy.sh and `contracts.Challenge`;
  - sizes and gas;
  - "For CLIENT": every renamed name, the ABI file, the deployment key, the seed;
  - one line on the audit: correctness, since the seed is what every score is drawn from.
- Report: the PR's number and head, everything in the body, and the peaks. Do not merge.
