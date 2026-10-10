# E5b brief: mint the game NFT at spawn, the registry, the deploy and the indexer

Track CORE of Paved (track ECO carried by paved-core), phase P8, PR E5b. Commit this brief as
`docs/briefs/e5b-mint.md`, as the first commit of your PR.

Spec: `docs/architecture/economy.md` on main, section 9 "Games as NFTs" ("Design", "Identity, leaderboard,
quests, indexer, client") and "PR plan" item E5. Owner decisions D-11 and D-11b. E5a (#270) already merged the
`Collection` contract on its own (`contracts/src/systems/collection.cairo`), and E3 (#275) merged the economy wiring.
Do not redo either of them.

## Goal

1. **Registry.** `Account` gains the `Collection` address: `set_collection(collection)`, owner only, one shot,
   non-zero, with a `CollectionSet` event and a `collection()` view. This mirrors E3's `set_economy`.
2. **Mint at spawn, from `Lobby`.**
   - `Lobby.spawn`, which runs as `Daily` or `Tutorial` by library call, reads `Account.collection()`. It then
     mints the game's token to the player: a plain mint, with no receiver callback.
   - The token id is the game id for Daily, and `2^32 + game id` for Tutorial.
   - When the collection is not set, the spawn reverts (as `'Lobby: economy not set'` does for Daily), and no game
     is left.
3. **Deploy.** `scripts/deploy.sh devnet`:
   - deploys `Collection(owner)`;
   - then, as the owner, calls `Account.set_collection(collection)` and `Collection.set_minters(daily, tutorial)`;
   - writes `contracts.Collection` in `devnet.json`;
   - its smoke reads back `token_uri` for a Daily and a Tutorial game, and `owner_of` for both.
4. **Indexer.** `packages/indexer` decodes the `Collection`'s mint `Transfer` (from 0). It records the token id per
   game, as section 9 says, in an append-only API v1 field with safe integers (P-19).

## Carried from E5a's security audit (t-0120)

- No entry point of `Lobby`, `Daily` or `Tutorial` may let a caller choose a token id, or call `Collection.mint`
  freely. Pre-minting a future game id would make every later spawn revert with `already minted`.
  - Test: no public path reaches `mint` with a caller-chosen id.
  - Test: a spawn always mints exactly the new game's own id.
- Optional: `set_minters` refuses `daily == tutorial`, with a test.
- Optional: the camelCase `setApprovalForAll` is added to the revert test.

## Carried from E3's audits (reclaim notes; tests only, in this PR)

- `test_reclaim_then_late_game_over_ranks_nothing`:
  - spawn a Daily game on day D and sponsor it;
  - end the day and reclaim (rank 0);
  - end the game on D+1;
  - assert that it ranks nothing in D, and that no rank can claim.
- `test_reclaim_sums_two_sponsorships_of_one_sponsor`: sponsor 1,000,000 and then 500,000 on day D, from the same
  address. The reclaim returns 1,500,000, and `Daily` holds 0.
- A sponsorship after the day lands in day D+1, not D (test).
- `test_lobby_and_daily_share_the_storage_layout` also reads the `sponsorships` slot on `Daily`.
- `docs/architecture/public-interface.md`: the prize of a reclaimed day stays the historical total, and the
  `Reclaimed` events give what went back.

## Also in this PR (a #241 follow-up)

- `scripts/deploy.sh` prints `(unparsed)` for a malformed userinfo. Make it say what it could not parse, with a
  test or a smoke case.

## Invariants and acceptance (from economy.md, E5)

- **`Daily` and `Tutorial` class sizes identical to main.** `Daily` is at its 72,607 cap. If either would grow,
  stop and report the figures.
- **Every class at most 90 %:** `scripts/class-sizes.sh` passes. Print the table.
- **Gas of moves a0 to l identical to main.**
- **Spawn gas reported**, against the prototype's +837,910 for Daily and +844,700 for Tutorial (test profile).
- **Goldens:** never edit an expected value. A budget may rise only by the spawn's mint, with the cause stated.
- **One-shot setters:** `set_collection` and `set_minters` are one shot (tested).
- **Ownership:** the player owns the token right after spawn, and the soulbound reverts still hold (E5a's tests stay
  green).
- **`token_uri`** decodes to section 9's JSON for a running and a finished game, both Daily and Tutorial, through the
  real contracts (not a double).
- **ABIs:** `contracts/abis/{Account,Collection}.json` are regenerated through `scripts/abis.sh`, under the
  staleness check.
- **Devnet:** `devnet.json` is regenerated on this branch with `deploy.sh devnet --unmerged` for the smoke. The
  committed devnet.json is regenerated from main after the merge, as with E3.

## Machine and runs (VPS)

The Mac is unreachable, so you run on the VPS (PM, 2026-10-10).
- scarb 2.20.1 and snforge 0.64.0 from `~/.asdf/installs/`.
- Every snforge or scarb run is `RAYON_NUM_THREADS=1 prlimit --as=12884901888 -- /usr/bin/time -v ...`, with
  `--max-threads 2`. Record each peak, and stop and report above 8 GB RSS.
- Before each build, check `free -g`: start only when "available" is 8 or more. Never run two builds at once.
- Scoped runs: `collection`, `lobby`, the e2e tests you touch, `reclaim`, `golden`, `test_gas_`. The whole suite
  once at the end.
- Committed gas figures come from the PR's CI `Test game` log (`gh run view --job <id> --log`).
- `starknet-devnet` for the smoke: if it is not installed on the VPS, say so in your report. Do not install
  anything; the smoke then runs where it is available, in a later step.

## Ordering with #276

#276 (devnet.json and the MockUSDC/MockRouter ABIs) is merging now. Leave `contracts/deployments/devnet.json` and
`scripts/abis.sh` alone until it is on main. Then `git merge origin/main` (no rebase) before you touch them.

## Git

- Push the branch the plugin created for this thread (`hp/paved-core/t-...`). Do not create or rename a branch.
- Never `git rebase` (Overseer rule until nexus #123). If main moves, merge origin/main. Plain pushes only.

## Allowlist

- `contracts/src/systems/{account,lobby,collection}.cairo` (for `collection.cairo`, only the optional
  `set_minters` check).
- `contracts/src/components/hostable.cairo` (the mint call at spawn only), `contracts/src/store.cairo` (an
  `account()` accessor if needed), `contracts/src/lib.cairo`.
- Test setups, e2e and gas tests: `contracts/src/tests/**`, `contracts/tests/**`, but not
  `contracts/src/tests/differential.cairo`, which another thread holds.
- `scripts/deploy.sh`, `contracts/deployments/{README.md,devnet.json}`, `contracts/abis/**`, `scripts/abis.sh`.
- `packages/indexer/**`: the mint decoder and the token id field.
- `docs/architecture/{economy,public-interface,indexer}.md`: an "As built: E5b" note and the new fields.
- `docs/briefs/e5b-mint.md`: this brief.
- Not CLIENT's files: list what CLIENT must change in your report.

## PR

- Branch from main, PR to main.
- Title: `feat: E5b mint the game NFT at spawn, registry, deploy, indexer`.
- Report:
  - the PR's number and head;
  - the size table;
  - the gas table: a0 to l against main, and spawn for Daily and Tutorial;
  - the peaks;
  - the smoke's output;
  - what CLIENT must change.
- A security audit follows the review.

