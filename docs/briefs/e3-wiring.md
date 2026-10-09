# E3 brief: wire Economy into Daily, Lobby, deploy and the indexer

Track CORE of Paved (track ECO carried by paved-core), phase P8, PR E3. Commit this brief as
`docs/briefs/e3-wiring.md`, as the first commit of your PR.

Spec: `docs/architecture/economy.md` on main (2256724): section 1 (the flows of one paid game), "PR plan" item E3,
"Gates before a paid game leaves devnet", "As built: E2". Rulings: P-31, P-34 (expiry 24 h, the score enters the
purchase day, settle from (D + 2) x 86400), P-34b, P-35 (`quote_swap`, devnet only), owner D-10 to D-14 in
`docs/programme/DECISIONS.md`. E3a (the seed behind `SeedSource`, #271) is already merged: do not redo it.

## Goal

1. **Paid spawn.** `Daily.spawn(stake, referrer, min_out)`: `Lobby` pulls exactly `stake x 2 USDC` from the
   player into `Economy` in the same call, just before `Economy.purchase(game_id, player, stake, price, referrer,
   min_out)`. The game id passed is the game's own id. The referrer must be a registered player (`Account`) and not
   the payer; otherwise it is ignored (no referral) or refused, as economy.md says.
2. **Game over.** For each way a Daily game ends (`build`, `discard`, `surrender`), `Lobby.report` calls
   `Economy.record(game_id, score)`. It has no `in_day` since P-34.
3. **Prize.** The entry no longer feeds the tournament prize: the prize is sponsor-only (P-31).
4. **Tutorial.** A Tutorial spawn calls neither `purchase` nor `record`.
5. **Deploy.** `scripts/deploy.sh devnet` deploys and wires everything.
   - Classes: `PavedToken`, `Vault`, `Economy`, and on devnet `MockUSDC` and `MockRouter`.
   - Keys in `contracts/deployments/<net>.json`, as CLIENT reads them: `contracts.Economy`, `contracts.PavedToken`,
     `contracts.Vault`, and `contracts.MockUSDC` on devnet or `contracts.USDC` off devnet.
   - Economy's launch rate is 7.6e31, the post-fee rate (economy.md section 5).
   - From E1's audit:
     - the owner stakes its 200,000 PAVED in the `Vault` in the same deployment, before `Economy.set_game`, and
       never fully unstakes;
     - `PavedToken.set_minter(Economy)`, and the smoke asserts `minter() == Economy` and `admin() == 0`;
     - the script refuses `MockRouter` and `MockUSDC` by name off devnet.
   - Write in `contracts/deployments/README.md` that a keeper settles each day at (D + 2) x 86400. This is E2's
     prior race and E-2 of economy.md.
6. **Indexer.** `packages/indexer` decodes Economy's events (today in `IGNORED`), with their API fields. The API is v1
   and append-only, with safe integers (P-19).

## Notes carried from E2's reviews (small, in this PR)

- A constructor test with a rate of 2^128 (`'Economy: rate overflow'`).
- `.expect(errors::RATE_OVERFLOW)` on the guard write in `purchase`, instead of a bare unwrap.
- `quote_swap`: `.expect('Economy: amount too large')` instead of a bare unwrap. Neither `Lobby` nor the deploy
  ever calls it: it is the client's devnet view.
- economy.md section 5:
  - "once per block timestamp";
  - "about 0.31 % up, 0.28 % down".

## Invariants and acceptance

- **Goldens identical.** Never edit an expected value.
- **`Daily` at most 72,607 CASM felts** (the prototype). It is 72,424 on main, so there is a 183-felt margin. If
  `Daily` would pass it, stop and report the figures before going further: growth in `Daily` goes to the PM.
- **Every class at most 90 %**: `scripts/class-sizes.sh` passes. Print the table.
- **Gas:**
  - moves a0 to f within +0.1 % of main;
  - the gas of spawn and of the closing moves measured and reported, with the cause stated.
- **Trust in `Daily`**, tests from E2's audit:
  - a spawn at stake `k` moves exactly `k x 2 USDC` from the player, and `Economy` holds 0 after it;
  - a spawn without the approval, or with a stake of 0 or 11, reverts and leaves no game and no terms;
  - the game id passed to `purchase` is the game's own id;
  - `record` reaches `Economy` for `build`, `discard` and `surrender`;
  - the referrer is a registered player, not the payer;
  - a Tutorial spawn calls neither `purchase` nor `record`.
- **E2's notes:** a spawn with a USDC donation already on `Economy` still pulls the full price from the player.
- **Devnet smoke**, through `scripts/deploy.sh devnet` and its smoke step: buy a paid game, play the Tutorial, then
  settle the paid game on a later day, at (D + 2) x 86400. It must leave no trace (P-24).
- **Indexer:** the devnet scenario passes with the new events.
- **ABIs:** `contracts/abis/{Daily,Tutorial,Lobby,Economy}.json` are regenerated through `scripts/abis.sh`, and the
  "Contract ABIs up to date" check passes.
- **`docs/architecture/public-interface.md`:** the new entry points and events.

## Machine and runs (Mac, ruling P-33)

You run on the Mac, in your own worktree. Never checkout, reset, clean or stash in `/Users/bal7hazar/git/paved`
itself.

- **Toolchain:** scarb 2.20.1 and snforge 0.64.0 (check the Mac's asdf paths with `asdf where`). `RAYON_NUM_THREADS=1`
  and `--max-threads 2`.
- **Measuring:** wrap every build and test run in `/usr/bin/time -l`. Record the peak ("maximum resident set size")
  in the PR. There is no address-space cap on macOS.
- **Before a run:** read `machine-capacity mac`. Paved runs at most 2 heavy Cairo runs at once on the Mac, and the
  organisation at most 4.
- **Stop and report** if a peak passes 16 GB.
- **Scoped runs:** `golden`, `test_gas_`, `economy`, `daily`, `tutorial`, `lobby`, and the e2e tests you touch. The
  whole suite once at the end.
- **Committed gas figures** (`docs/measures/baseline.md`) come from Linux: take them from the CI log of the PR's
  `Test game` job (`gh run view --job <id> --log`), never from the Mac.
- **The devnet smoke** needs `starknet-devnet` (`scripts/node/`). If it is not installed on the Mac, say so in your
  report with what you checked. The smoke then runs on the VPS in a separate step: do not install anything.

## Allowlist

- `contracts/src/systems/{daily,lobby,tutorial,account}.cairo`, `contracts/src/components/hostable.cairo`,
  `contracts/src/types/mode.cairo`, `contracts/src/constants.cairo`.
- `contracts/src/economy/economy.cairo`, only for the notes above, and its tests.
- Test setups and e2e tests under `contracts/src/tests/`, `contracts/tests/gas.cairo`.
- `scripts/deploy.sh`, `scripts/node/**`, `contracts/deployments/{README.md,devnet.json}`,
  `contracts/abis/{Daily,Tutorial,Lobby,Economy}.json`, `scripts/abis.sh`.
- `packages/indexer/**`: the decoders, the API fields and their tests.
- `docs/architecture/public-interface.md`, `docs/measures/baseline.md`.
- `docs/architecture/economy.md`: the two section 5 notes and an "As built: E3" section.
- `docs/briefs/e3-wiring.md`: this brief.

Not allowed:
- CLIENT's files (`packages/chain/**`, `app/**`, `packages/app-web/**`): list what CLIENT must change in your report
  instead;
- `contracts/src/systems/collection.cairo` and the mint at spawn: that is E5b, which follows this PR.

## PR

- Branch from main, PR to main.
- Title: `feat: E3 wire Economy into Daily, Lobby, deploy and the indexer`.
- Report:
  - the PR's number and head;
  - the size table;
  - the gas table: a0 to f against main, spawn, the closing moves;
  - the peaks;
  - the smoke's output;
  - what CLIENT must change.
- A security audit and an economy audit follow the review.
