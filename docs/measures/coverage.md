# Line coverage of the contracts, and the gaps that matter (P5)

Measured on 2026-10-14 on main at `420d9529`. Brief: `docs/briefs/coverage-1-measure.md`. This is a
measure and a test plan: no contract or test code changes here. Every `file:line` is at `420d9529`.

#391 (`25fad57c`) was merged after the measure. It adds a position check to `Challenge.build` and the tests in
`e2e/position.cairo`. The `systems/challenge.cairo` lines cited below from 245 on are 10 lines lower on main.
Nothing else in `contracts/src` moved.

A re-measure after T1, T2, P-58 and #395 is at the end of this file, section "Re-measure (after T1, T2, P-58, #395)". The sections above are the history of the first measure.

## Summary

- **Every test of the crate, 740 tests (731 passed, 9 ignored): 4,651 of 4,786 lines of `contracts/src`
  hit, 97.18 %** (`tests/**` and `mocks/**` excluded). Mocks included: 4,749 / 4,933, 96.27 %. This is
  information, not a target.
- **`scripts/measure.sh coverage-split` alone reports 94.40 % (4,518 / 4,786), and that figure is wrong.**
  Its `COVERAGE_GROUPS` were written at P5 and leave out every test module added since:
  - `paved::quests::`
  - `paved::tests::{collection, deck_walk, draw_mask, economy::, owners, seed, walk_cost}`

  That is 286 of the 740 tests, among them the 203 tests of `tests::economy` (Economy, the Vault, the token,
  the curve, the faucet, the router). The script's comment "Together they cover every test of the crate" no
  longer holds. The 97.18 % comes from the script's 27 groups plus 9 complementary groups. Those ran with
  the same `snforge` command and were merged with the same awk merge. Each of the 740 tests ran exactly
  once: 740 distinct `[PASS]`/`[IGNORE]` names in the logs, no duplicates, against 740 `#[test]` in
  `src/` and `tests/`.
- **Value and access contracts are at 100 % of their lines**: `systems/{economy,challenge,collection,setup,token,faucet}`,
  `economy/{curve,mean,ekubo}` and `components/ownable`. `systems/vault.cairo` misses one line (the camelCase ERC20 entry
  points).
  - The gaps that matter are therefore not unrun lines. They fall into three kinds:
    - branches on one line, which cairo-coverage cannot see (it emits line and function records, no branch records);
    - the vPAVED maths, which runs inside OpenZeppelin's `ERC4626Component`, outside `contracts/src`, so it
      is not instrumented at all;
    - lines that run but whose effect no test asserts.
  - They are listed by class below, with a test plan of two pull requests.
- **No confirmed bug.**
  - One hardening point: `Economy.swap` does not check the sign of the PAVED leg.
  - Two decisions to revisit:
    - the Vault or the router as a referrer: the documented premise is stale since P-56;
    - `set_setup` with games in flight.

  These are in "Findings for a ruling".

## Command and toolchain

- Machine: the Mac (aarch64, macOS, Darwin 27.0.0, 64 GB). One Cairo run at a time; no other Cairo run was
  active.
- Toolchain, from the asdf shims on the PATH:
  - scarb 2.20.1 (dd18779a1 2026-08-21), cairo 2.20.0, sierra 1.9.3;
  - snforge 0.64.0;
  - cairo-coverage 0.6.1 (`~/.asdf/installs/cairo-coverage/0.6.1/bin`, put first on the PATH by
    `measure.sh`).

  `RAYON_NUM_THREADS=1`. The `coverage` Scarb profile was used throughout.
- The script's shim guard refuses on this Mac. `~/.local/bin/scarb` exists, so the guard treats it as the
  shim, but it is a stray scarb **2.11.0** binary, not a shim (there is no `~/.local/bin/snforge`).
  - The runs therefore set `PAVED_SCARB_SHIM=$HOME/.asdf/shims/scarb` and
    `PAVED_SNFORGE_SHIM=$HOME/.asdf/shims/snforge`, so the guard checks the tools actually used.
  - `measure.sh` was not changed.
- Commands, from the repository root:

  ```sh
  PAVED_SCARB_SHIM=$HOME/.asdf/shims/scarb PAVED_SNFORGE_SHIM=$HOME/.asdf/shims/snforge \
    /usr/bin/time -l scripts/measure.sh coverage          # stopped above 16 GB, see below
  PAVED_SCARB_SHIM=$HOME/.asdf/shims/scarb PAVED_SNFORGE_SHIM=$HOME/.asdf/shims/snforge \
    /usr/bin/time -l scripts/measure.sh coverage-split    # exit 0, 609.55 s
  # The modules the split leaves out, run with the split's exact command (cd contracts):
  #   RAYON_NUM_THREADS=1 PATH=~/.asdf/installs/cairo-coverage/0.6.1/bin:$PATH \
  #   /usr/bin/time -l snforge test -P coverage --coverage --max-threads 2 <filter>
  # then the 27 + 7 lcov files merged with measure.sh's merge_lcov awk program
  ```

## Peaks

All peaks are `/usr/bin/time -l` "maximum resident set size" on the Mac. Bytes are given as decimal GB.

- **The Mac's offer**: MEMORY 0/45G and CPU 0/8, with 33.37G free. The orchestrator read it with `nexus resources` on
  2026-10-14, at the time of these runs.
- **The memory stop**: macOS has no address-space cap. Every run was watched by a watchdog that sampled
  snforge's RSS every 3 to 5 s and stopped it above **16 GB** (the Mac rule of `AGENTS.md`). That is well inside
  the 45G offer.
- Runs were strictly sequential: one coverage run at a time, never two at once.

- `scripts/measure.sh coverage`, the first unsplit run, with default threads: **reached 18.5 GB and was stopped**
  by the 16 GB stop.
  - The watchdog saw snforge at 17,168,544 kB and stopped it. `time -l` reports a peak of 18,478,940,160 bytes
    (18.48 GB).
  - That was 49.64 s in, during test execution: the test build was warm from the split.
  - It produced no lcov. `coverage` cannot run on a 16 GB budget as written. It also has no `--max-threads`
    flag: the split's groups pass `--max-threads 2`.
- Two earlier attempts were stopped by hand. Their lcov files were discarded.
  - A first `coverage-split`, stopped after two groups to try the unsplit run. Peaks: `types` 11.08 GB,
    `elements` 12.32 GB.
  - A first complementary pass, stopped after two groups because its PATH lacked the cairo-coverage directory.
    snforge then printed `No version is set for command cairo-coverage` and failed with exit status 126. Peaks:
    8.88 GB and 8.51 GB.
- `scripts/measure.sh coverage-split`: 609.55 s wall time, exit 0, largest peak **14.64 GB (`e2e`)**.
- The complementary groups: 179.24 s wall time, largest peak **13.99 GB (`tests-draw-mask`)**.

The P5 baseline split (`docs/measures/baseline.md`) peaked at 7.70 GB. These peaks are 10.6 to 14.6 GB because
the `coverage` profile keeps code locations (`Scarb.toml`: about 2.5 GB more at build) and because the crate
has grown. Each group rebuilds and peaks above 10 GB, so the split stays a Mac or CI run, as
`measure.sh` and `AGENTS.md` say.

| Group (filter) | Tests | Peak RSS | Wall time |
| --- | --- | --- | --- |
| types (`paved::types::`) | 107 passed | 12.29 GB | 24.1 s |
| elements | 21 passed | 12.35 GB | 17.0 s |
| helpers-random-deck | 16 passed | 12.72 GB | 21.6 s |
| helpers-multiplier | 5 passed | 12.37 GB | 15.7 s |
| models | 15 passed | 12.38 GB | 16.5 s |
| structure-record | 10 passed | 12.37 GB | 16.1 s |
| structure-placement | 6 passed | 12.51 GB | 17.0 s |
| structure-state | 3 passed | 12.41 GB | 16.3 s |
| structure-oriented | 1 passed | 12.42 GB | 16.7 s |
| structure-tables-1 to 12 (`--partition i/12`) | 40 passed in all | 10.63 to 12.61 GB | 23.8 to 26.4 s each |
| store | 1 passed | 12.37 GB | 15.2 s |
| e2e (`paved::tests::e2e::`) | 184 passed | **14.64 GB** | 52.5 s |
| golden | 19 passed, 1 ignored | 13.67 GB | 27.5 s |
| differential | 7 passed | 13.06 GB | 22.5 s |
| oracle | 1 passed | 12.39 GB | 16.3 s |
| gas (`test_gas_`) | 17 passed | 8.43 GB | 10.1 s |
| *complement:* quests (`paved::quests::`) | 3 passed | 12.38 GB | 15.5 s |
| *complement:* tests-collection | 31 passed | 12.32 GB | 18.2 s |
| *complement:* tests-deck-walk | 4 passed, 1 ignored | 13.39 GB | 22.9 s |
| *complement:* tests-draw-mask | 16 passed | 13.99 GB | 35.3 s |
| *complement:* tests-economy (`paved::tests::economy::`) | 197 passed, 6 ignored (the mainnet fork) | 12.95 GB | 38.2 s |
| *complement:* tests-owners | 19 passed | 12.62 GB | 20.3 s |
| *complement:* tests-seed | 8 passed | 12.44 GB | 17.5 s |
| *complement:* tests-walk-cost | 1 ignored, no lcov | 8.88 GB | 5.9 s |
| *complement:* tests-legacy (`paved::tests::legacy`) | no test (frozen classes only), no lcov | 8.88 GB | 5.4 s |

## Per module

Lines found and hit per file of `contracts/src`, from the merged lcov. `tests/**` is excluded. A file with no
executable line (interfaces, constants, `lib.cairo`) does not appear in the lcov.

| Directory | Lines hit / lines | Coverage |
| --- | --- | --- |
| (root) | 268 / 268 | 100.00 % |
| components | 119 / 123 | 96.75 % |
| economy | 86 / 86 | 100.00 % |
| elements | 656 / 675 | 97.19 % |
| helpers | 207 / 216 | 95.83 % |
| models | 333 / 336 | 99.11 % |
| structure | 1592 / 1681 | 94.71 % |
| systems | 706 / 707 | 99.86 % |
| types | 684 / 694 | 98.56 % |
| **TOTAL (mocks excluded)** | **4651 / 4786** | **97.18 %** |

| File | Lines | Hit | Coverage |
| --- | --- | --- | --- |
| `components/hostable.cairo` | 21 | 20 | 95.2 % |
| `components/ownable.cairo` | 21 | 21 | 100.0 % |
| `components/payable.cairo` | 3 | 2 | 66.7 % |
| `components/playable.cairo` | 78 | 76 | 97.4 % |
| `day.cairo` | 1 | 1 | 100.0 % |
| `economy/curve.cairo` | 42 | 42 | 100.0 % |
| `economy/ekubo.cairo` | 7 | 7 | 100.0 % |
| `economy/mean.cairo` | 37 | 37 | 100.0 % |
| `elements/decks/base.cairo` | 50 | 31 | 62.0 % |
| `elements/decks/simple.cairo` | 30 | 30 | 100.0 % |
| `elements/layouts/*.cairo` (20 files) | 616 | 616 | 100.0 % |
| `events.cairo` | 6 | 6 | 100.0 % |
| `helpers/bitmap.cairo` | 6 | 5 | 83.3 % |
| `helpers/math.cairo` | 9 | 9 | 100.0 % |
| `helpers/multiplier.cairo` | 24 | 24 | 100.0 % |
| `helpers/random_deck.cairo` | 177 | 169 | 95.5 % |
| `models/builder.cairo` | 12 | 12 | 100.0 % |
| `models/game.cairo` | 175 | 172 | 98.3 % |
| `models/index.cairo` | 4 | 4 | 100.0 % |
| `models/tile.cairo` | 145 | 145 | 100.0 % |
| `quests.cairo` | 88 | 88 | 100.0 % |
| `seed.cairo` | 2 | 2 | 100.0 % |
| `store.cairo` | 121 | 121 | 100.0 % |
| `structure/assessment.cairo` | 16 | 16 | 100.0 % |
| `structure/forest.cairo` | 45 | 41 | 91.1 % |
| `structure/oriented.cairo` | 595 | 553 | 92.9 % |
| `structure/owners.cairo` | 38 | 35 | 92.1 % |
| `structure/placement.cairo` | 138 | 136 | 98.6 % |
| `structure/record.cairo` | 112 | 110 | 98.2 % |
| `structure/state.cairo` | 133 | 129 | 97.0 % |
| `structure/tables.cairo` | 565 | 536 | 94.9 % |
| `structure/walk.cairo` | 39 | 36 | 92.3 % |
| `systems/challenge.cairo` | 117 | 117 | 100.0 % |
| `systems/collection.cairo` | 123 | 123 | 100.0 % |
| `systems/economy.cairo` | 296 | 296 | 100.0 % |
| `systems/faucet.cairo` | 20 | 20 | 100.0 % |
| `systems/setup.cairo` | 72 | 72 | 100.0 % |
| `systems/token.cairo` | 26 | 26 | 100.0 % |
| `systems/vault.cairo` | 53 | 52 | 98.1 % |
| `types/area.cairo` | 159 | 158 | 99.4 % |
| `types/category.cairo` | 51 | 51 | 100.0 % |
| `types/deck.cairo` | 55 | 54 | 98.2 % |
| `types/direction.cairo` | 36 | 35 | 97.2 % |
| `types/layout.cairo` | 73 | 72 | 98.6 % |
| `types/mode.cairo` | 27 | 26 | 96.3 % |
| `types/move.cairo` | 10 | 10 | 100.0 % |
| `types/orientation.cairo` | 20 | 20 | 100.0 % |
| `types/plan.cairo` | 130 | 126 | 96.9 % |
| `types/spot.cairo` | 133 | 132 | 99.2 % |
| `views.cairo` | 50 | 50 | 100.0 % |
| *mocks* `mocks/account.cairo` | 7 | 7 | 100.0 % |
| *mocks* `mocks/erc20/erc20.cairo` | 35 | 0 | 0.0 % |
| *mocks* `mocks/erc20/interface.cairo` | 3 | 3 | 100.0 % |
| *mocks* `mocks/reentrant_token.cairo` | 22 | 18 | 81.8 % |
| *mocks* `mocks/router.cairo` | 70 | 70 | 100.0 % |
| *mocks* `mocks/token.cairo` | 10 | 0 | 0.0 % |

`mocks/token.cairo` (`Token`) and `mocks/erc20/erc20.cairo` (its component) are never deployed by a test. Only
their interfaces are used, so 0 % there is test scaffolding, not a gap.

### The lines reported as missed

Of the 135 missed lines (mocks excluded), most are attribution artefacts of the instrumented trace, as P5
found:

- the `pub enum Event {}` lines of the components (`hostable:35`, `payable:35`, `playable:27`);
- the headers of `match` and loop lines in `structure/{oriented,tables}`, `types/*`, `random_deck`;
- inlined straight-line statements, for example:
  - `playable.cairo:236` (`structures.track`), on the unconditional path of every build;
  - `game.cairo:362, 371, 380`;
  - `structure/{state,record,placement,walk,owners,forest}`.

The genuinely unreached code is outside the four classes below:

- the deck literal table `decks/base.cairo:124-143` (`indexes`; the decks are read through their packed bitmaps);
- `bitmap.cairo:54` (`x & ~mask`);
- the default arms (`Plan::None`, `_ =>`) of `types/*`.

## The gaps that matter

No file of the four classes has an unrun line except `vault.cairo:94`. Each class therefore lists:

- what line coverage cannot show (a branch inside one line, code outside `contracts/src`);
- the lines that run unasserted (the worst cases, for value and access).

Paths are under `contracts/src/`. Every claim below was checked against the tests.

### Value (PAVED and USDC: Economy, curve, mean, token, faucet, Challenge.purchase)

Unreached branches:

| Where | What is never reached | Scenario that reaches it |
| --- | --- | --- |
| `systems/economy.cairo:1076` (`swap`) | `!used.sign` false: a USDC leg reported as paid out. Only the short fill is tested (`test_purchase_refuses_a_partial_fill`) | the mock router answers `used = {2_000_000, sign: true}`, then a purchase reverts `'Economy: partial fill'` |
| `systems/economy.cairo:895` (`quote_swap`) | `paved_leg.mag == 0` with `sign == false`. The mock answers a zero output as `{0, sign: true}` | the mock quotes `{0, false}`, and `quote_swap` returns 0 |
| `systems/economy.cairo:613-614` (constructor) | a zero `paved`, `usdc`, `vault` or `router`. A zero vault would send the margin's PAVED to address 0 | deploy with each one zero, and the reason is `'Economy: zero address'` |
| `systems/token.cairo:105-106` (constructor) | a zero recipient or zero admin. No test expects `'PavedToken: zero recipient'` | deploy `[0, ADMIN]`, then `[RECIPIENT, 0]` |
| `economy/curve.cairo:105, 133`; `economy.cairo:374, 706` | the overflow `expect`s (`'Curve: overflow'`, time, rate). They are practically unreachable | at most one pure `payout(u128::MAX, ...)` test |

Dead by construction, with no test possible (noted so that nobody tries):

- `curve.cairo:60-61`: the factor cannot exceed 2x.
- `economy.cairo:756`: `means.read(day) == 0`. An unexpired record always finds its day open, since a day closes at `(d + 2) x DAY` and a game expires by `time + DAY`.
- `economy.cairo:120`: `referral <= 10_000 - burn` cannot fail within the bounds.
- `economy.cairo:676`: `amount - quote` cannot underflow after `NOT_PAID`.

Run but not asserted, worst first:

1. **`economy.cairo:785-791`: `settle` uses the curve frozen at purchase, and no test proves it.**
   - No test settles a game bought before a `configure`. Every settled game has `sigma = 0`.
   - If `settle` read `self.config` instead of `terms.{sigma_bps, slope_bps, cap}`, every test would still pass.
2. **`economy.cairo:818`: `minted += reward`.** No test compares the return of a batch with more than one paying game: `test_fixture_matches_sim` ignores it. `minted = reward` would pass every test.
3. **`economy.cairo:863-865`: `quote().mean`, taken from today's prior once a day has one.** This is never asserted against a moved EMA. `quote().threshold` with a non-zero sigma, and `factor` away from the target, are never asserted either.
4. **`economy.cairo:720-739`: fields of `Purchased` that are not compared.**
   - `referrer` and `referral` for a self-referral.
   - `margin` and `vault_paved` with a USDC donation.
   - The Vault's balance in the zero-margin case `(9_000, 1_000)` of `test_configure_the_split_at_its_bounds_and_its_event`.
5. **`token.cairo:115`: `MinterSet`.** It is never asserted.
6. `settle([1, 1])`, the same game twice in one batch, is never run. It is safe today because the outcome is written as SETTLED before the next iteration.

`Challenge.purchase` (`challenge.cairo:466-477`) is fully pinned:

- each of its four referrer conditions has its own test (`e2e/cold_paths.cairo:392, 404, 416, 429`);
- the price debit is asserted (`e2e/economy.cairo:62`).

### Access (owner, game, guardian, minter, two-step ownership, upgrades)

Every restricted entry point of every contract has a refusal test with the exact reason and an effect
test. The exceptions are listed after the matrix.

| Contract | Entry point | Refusal | Effect |
| --- | --- | --- | --- |
| all ownables | `transfer_ownership`, `accept_ownership` | `e2e/access.cairo` (wrong caller, owner, no proposal, twice, zero, overwrite) | pending owner plus `OwnershipTransferStarted` / `OwnershipTransferred` for Challenge, Setup, Economy, Collection. **Vault: not in `ownables()`**, functional only through `test_upgrade_follows_the_ownership_transfer` |
| Challenge | `set_setup`, `set_guardian`, `pause_spawn`, `unpause_spawn`, `upgrade` | `e2e/access.cairo`, `e2e/guardian.cairo`, `e2e/upgrades.cairo` | views plus events, `Upgraded` plus a probed slot |
| Setup | `define_*`, `set_reporter`, `report`, `set_economy`, `set_collection`, `upgrade` | `e2e/quests.cairo`, `e2e/setup_system.cairo`, `e2e/access.cairo` | events, views |
| Setup | `retire_quest`, `retire_achievement` | `test_quests_retire_*_not_owner` | **none**: `test_quests_owner_retires` (`e2e/quests.cairo:195`) asserts nothing |
| Economy | `configure`, `set_game`, `set_router`, `upgrade` | `tests/economy/economy.cairo` | events plus state |
| Economy | `set_pool` | `test_set_pool_by_anyone_else_reverts` | state only. **`PoolSet` (`economy.cairo:1028`) is never asserted** |
| Economy | `purchase`, `record` (game only) | `test_{purchase,record}_by_anyone_else_reverts`, always with the game set | the purchase and record tests |
| Collection | `set_minters`, `mint`, `upgrade` | `tests/collection.cairo` (by range, before the minters, by zero) | `Transfer`, owner, balance |
| Vault | `set_exit_fee`, `upgrade` | `test_vault_fee_by_a_stranger_reverts`, `test_upgrade_reverts_for_non_owner` | `ExitFeeSet`, the upgrade keeps the shares, rate and votes |
| PavedToken | `set_minter`, `mint` | `tests/economy/token.cairo` | balances and supply. **`MinterSet` is never asserted**. No `upgrade` (`ENTRYPOINT_NOT_FOUND`, tested) |

Gaps:

- **First operands of one-line guards that never decide the outcome.** Every refusal test uses a non-zero caller, so the second operand alone already refuses:
  - `economy.cairo:979`: `game.is_non_zero()` in `assert_game`, with the game unset and a zero caller;
  - `token.cairo:131`: `minter.is_non_zero()`, before `set_minter` and with a zero caller;
  - `token.cairo:120`: `admin.is_non_zero()`, after the admin is cleared and with a zero caller.
- **`components/ownable.cairo:81`.** `accept_ownership` by the zero caller with no proposal passes the pending check (0 == 0). Only `set_owner`'s zero check (`:101`) stops it, with the reason `'Ownable: new owner is zero'`. This is untested.
- **The Vault's two-step ownership events** are never asserted, because the Vault is missing from `ownables()` (`e2e/access.cairo:25`).
- **`setup.cairo:257-260, 279-282`.** `retire_*` runs with no assertion: no `QuestRetired` or `AchievementRetired` check, and no check that a retired quest refuses a re-definition.
- **`ownable.cairo:104`.** The constructor's `OwnershipTransferred { previous_owner: 0, new_owner }` is never asserted. The indexer reads it.
- **`tests/economy/vault.cairo:235`.** `test_vault_constructor_refuses_a_zero_owner` is a bare `#[should_panic]` with no expected reason.
- Minor: no test calls `transfer_ownership` as the pending owner, so that path is not pinned.

### The vPAVED fee and dead-share maths

The arithmetic of `deposit`, `mint`, `withdraw`, `redeem`, `max_*`, `preview_*` and `convert_*` runs in
OpenZeppelin's `ERC4626Component`. That component is outside `contracts/src` and is not in the lcov. Only
the hooks in `vault.cairo` are measured: `before_deposit`, the two fee functions, `withdraw_limit` and
`_preview_redeem_assets`, and all of them are hit. The figure here is read from the tests,
`tests/economy/vault.cairo`.

Asserted exactly:

- Deposit and mint at a stable rate.
- The margin raising the rate.
- `preview_redeem` and `redeem` with a fee (101 → 100 at 100 bps), and the fee kept in `total_assets`.
- `max_withdraw == preview_redeem(balance)`, and `max_redeem == balance`, at an odd rate with a fee.
- Exits above the max revert.
- Exits by an approved spender spend the fee's shares.
- The inflation attack with the dead shares.
- A zero deposit and a one-unit deposit above rate 1 revert `'Vault: zero shares'`.
- The margin while only the dead shares remain.
- A 150-step random walk: the assets cover the shares, and the dead shares keep their value.

Gaps:

| What | Status | Test that closes it |
| --- | --- | --- |
| `max_deposit`, `max_mint` | never called (0 calls in the tests) | both are `u256` max, for any account |
| `mint(0)`, the zero-share refusal on the `mint` path | untested (only `deposit` is) | reverts `'Vault: zero shares'` |
| `preview_withdraw` with a fee | asserted only as a range (`> 100` and `<= 101` PAVED) | the exact value `ceil((a + ceil(a x f / 10_000)) x (S + 1) / (A + 1))` at an odd rate |
| the fee at its ceiling, 1,000 bps | only inside the random walk, with invariants | a redeem worth 110 PAVED pays exactly 100; a withdraw of 100 burns the shares of 110 |
| the fee's upward rounding on dust | untested | at 500 bps, a redeem of 1 share at rate 1 pays 0 and burns the share; `preview_redeem(1) == 0` |
| `withdraw(0)`, `redeem(0)` | untested | both pay 0 and burn 0 (no revert): pins today's behaviour |
| `vault.cairo:94`, `ERC20CamelOnlyImpl` (`totalSupply`, `balanceOf`, `transferFrom`) | the one missed line | the camel views equal the snake ones; `transferFrom` spends the allowance |
| dead shares at deployment | done by the deployment (`tests/setup.cairo:185`), not by the constructor | covered: every test that runs the setup holds them |

### The expiry (S1)

Fully covered at the boundary second (`e2e/expiry.cairo`, `e2e/economy.cairo:232`,
`tests/economy/economy.cairo:694-760`):

- **build and discard:** both pass at `start + 24 h - 1` and revert `'Game: expired'` at `start + 24 h`, leaving the game unchanged; a discard 30 days later reverts too;
- **surrender:** passes at expiry, and the game is recorded expired;
- **record and settle:** a record at expiry is marked expired and enters no mean; a record after the close is expired and changes no day or EMA; the settle of an expired game pays 0 and closes its day empty;
- **edge games:** a game over on the last second is not expired, and a game spawned before the upgrade gets 24 h from its own start.

Gaps, all minor:

- `build` long after expiry: only `discard` is tried at +30 days.
- `surrender` long after expiry (+30 days, after its day has closed), recorded expired with its frozen score.
- `surrender` of an expired game with no move at all (score 0).
- A day in which one game never ends: the other games of the day still settle at `(d + 2) x DAY`, and the never-ended game stays unrecorded (`settle` reverts `'Economy: not recorded'`).

## Findings for a ruling (no code changed)

None is a bug with the deployed router and the current owner. Each is described with the scenario that shows
it.

1. **`Economy.swap` does not check the sign of the PAVED leg (`economy.cairo:1069-1078`).** `quote_swap`
   does: `'Economy: wrong delta'`.
   - Scenario: a router, replaced by `set_router` or buggy, returns the PAVED leg as paid in (`{100 PAVED, sign: false}`).
   - `min_out` passes on the magnitude, and `bought` is phantom. R and the rate are computed on PAVED never received.
   - The purchase then reverts only if Economy cannot cover `vault_paved`. With PAVED donated to Economy it goes through, and the donation goes to the Vault instead of being burned.
   - Hardening means a code change (one assert), so it is outside a tests-only PR.
2. **The Vault or the router as a referrer.** `docs/architecture/economy.md` (D-25 E) keeps the Vault allowed, on the premise that "a referral paid to the Vault is counted once (`referral` 5 % plus `margin` 25 %: the Vault holds 30 %)". Since P-56 the margin reaches the Vault as PAVED, and USDC sent to the Vault is stranded (`vault.cairo:21`).
   - **Vault:** `spawn(1, vault, 0)` sends 5 % of the price in USDC to the Vault, where nothing can use it.
   - **Router:** `spawn(1, router, 0)` pays the router. `clear(usdc)` brings that USDC back to Economy, where it joins the next purchase's margin. `Purchased` then reports it as paid as a referral and counts it again in a margin: the double count the rule avoids for Economy.

   The decision to revisit: exclude both, or document the loss.
3. **`Challenge.set_setup` with games in flight (`challenge.cairo:254`).**
   - Scenario: game 1 is bought on Economy A. The owner then calls `set_setup(S2)`, where S2 is wired to Economy B. The game's ending move then calls `B.record(1)`, which reverts `'Economy: unknown game'`. If S2 has not allowlisted Challenge, it reverts `'Quest: not reporter'` instead.
   - The game cannot end, and `settle` on A reverts `'Economy: not recorded'`.
   - Only the zero-setup case is documented (`challenge.cairo:427-431`). Is this an intended owner power?
4. **`ownable.cairo:81`.** A zero-caller `accept_ownership` with no proposal is stopped only by `set_owner`'s zero check, with a misleading reason. It is safe today, and the access test plan pins it.

## Test plan

Tests only, no contract code. Two pull requests with disjoint allowlists, so they can run in parallel. Each runs
locally with `snforge test <its module filter>` (15 GiB cap on the VPS, or the Mac).

### PR T1: value and vPAVED

Allowlist:

- `contracts/src/tests/economy/economy.cairo`
- `contracts/src/tests/economy/vault.cairo`
- `contracts/src/tests/economy/token.cairo`
- `contracts/src/tests/economy/curve.cairo`

| Test (file) | Assertion |
| --- | --- |
| `test_settle_pays_with_the_curve_frozen_at_purchase` (economy) | buy game 1, `configure({sigma: -3_000, slope: 1_000, cap: 1, ..})`, buy game 2, record both at 6,000, settle at `DAY0 + 2`. Then `terms(1).reward == payout(r1, 6_000, threshold(mean, sigma1), slope1, cap1)`, and `Settled` of game 2 has `threshold == threshold(mean, -3_000)` |
| `test_settle_returns_the_sum_of_a_batch` (economy) | two paying games on one day: `settle([a, b]) == balance(pa) + balance(pb)`, both non-zero |
| `test_settle_the_same_game_twice_in_one_batch_pays_once` (economy) | `settle([1, 1]) == terms(1).reward`, and the player's balance is the reward once |
| `test_quote_uses_todays_prior_not_the_moved_ema` (economy) | buy game 2 on `DAY0 + 2` (prior `MEAN0`), then settle `DAY0` so the EMA moves. `quote(1).mean == MEAN0` and `ema().1 != MEAN0` |
| `test_quote_threshold_follows_sigma` (economy) | after `configure` with sigma -3,000: `quote(1).threshold == threshold(mean, -3_000)` |
| `test_purchase_refuses_a_usdc_leg_paid_out` (economy) | the mock swap returns `used = {2_000_000, true}`: `should_panic('Economy: partial fill')` |
| `test_quote_swap_of_a_zero_paved_leg_paid_in_is_zero` (economy) | the mock quote returns `{0, false}`: `quote_swap(1_400_000) == 0` |
| `test_constructor_refuses_a_zero_address` (economy) | deploy with a zero paved, usdc, vault and router in turn; each deploy error is `'Economy: zero address'` |
| `test_purchase_before_set_game_reverts_for_zero` (economy) | Economy without `set_game`, zero caller, funded: `purchase` and `record` revert `'Economy: not the game'` |
| `test_set_pool_takes_another_fee_on_the_same_tokens` (economy, extended) | `PoolSet { pool_key: other, sqrt_ratio_limit }` emitted |
| `test_purchase_referring_oneself_pays_no_referral` (economy, extended) | `Purchased.referrer == 0` and `referral == 0` |
| `test_donations_to_economy_join_the_margin_and_the_burn` (economy, extended) | `Purchased.margin` and `vault_paved` equal the expected figures |
| `test_configure_the_split_at_its_bounds_and_its_event` (economy, extended) | in the zero-margin case, the Vault's PAVED balance is unchanged |
| `test_vault_max_deposit_and_max_mint_are_unbounded` (vault) | `max_deposit(a) == max_mint(a) == Bounded::<u256>::MAX` |
| `test_vault_mint_of_zero_shares_reverts` (vault) | `should_panic('Vault: zero shares')` |
| `test_vault_preview_withdraw_is_exact_with_the_fee` (vault) | at 100 bps and an odd rate: `preview_withdraw(a) == ceil((a + ceil(a x 100 / 10_000)) x (S + 1) / (A + 1))`, and `withdraw` returns it |
| `test_vault_exits_at_the_fee_ceiling` (vault) | at 1,000 bps and rate 1: `redeem(110 PAVED) == 100 PAVED`, and `preview_withdraw(100 PAVED) == 110 PAVED` |
| `test_vault_redeem_of_dust_pays_nothing` (vault) | at 500 bps and rate 1: `preview_redeem(1) == 0`, and `redeem(1)` returns 0 and burns 1 share |
| `test_vault_zero_exits_change_nothing` (vault) | `withdraw(0)` and `redeem(0)` return 0, with balances and supply unchanged |
| `test_vault_camel_entry_points` (vault) | `totalSupply() == total_supply()`, `balanceOf(a) == balance_of(a)`, and `transferFrom` moves the shares and spends the allowance |
| `test_vault_constructor_refuses_a_zero_owner` (vault, tightened) | `should_panic(expected: 'Vault: zero address')` |
| `test_token_constructor_refuses_zero_recipient_and_zero_admin` (token) | the deploy errors are `'PavedToken: zero recipient'` and `'PavedToken: not admin'` |
| `test_token_mint_reverts_for_zero_before_a_minter_is_set` (token) | zero caller: `should_panic('PavedToken: not minter')` |
| `test_token_set_minter_reverts_for_zero_after_the_admin_is_cleared` (token) | zero caller: `should_panic('PavedToken: not admin')` |
| `test_token_minter_mints_and_total_supply_follows` (token, extended) | `MinterSet { minter: MINTER() }` emitted |
| `test_payout_overflow_reverts` (curve, optional) | `payout(u128::MAX, ...)` panics with `'Curve: overflow'` |

### PR T2: access and expiry

Allowlist:

- `contracts/src/tests/e2e/access.cairo`
- `contracts/src/tests/e2e/quests.cairo`
- `contracts/src/tests/e2e/expiry.cairo`

| Test (file) | Assertion |
| --- | --- |
| `ownables()` gets the Vault (access) | the existing propose and accept tests then assert the Vault's `OwnershipTransferStarted` and `OwnershipTransferred` |
| `test_access_constructor_emits_ownership_transferred` (access) | spy before deploying; `OwnershipTransferred { previous_owner: 0, new_owner: OWNER }` is emitted |
| `test_access_accept_ownership_by_zero_without_proposal_reverts` (access) | zero caller, no proposal: `should_panic('Ownable: new owner is zero')`, for every ownable |
| `test_access_pending_owner_cannot_transfer` (access) | the pending owner's `transfer_ownership` reverts `'Ownable: caller is not owner'` |
| `test_quests_owner_retires` (quests, extended) | `QuestRetired { quest_id: 1 }` and `AchievementRetired { achievement_id: 9 }` emitted; a second `retire_quest(1)`, or a `define_quest(1, ..)`, reverts with the retired reason |
| `test_expiry_a_build_long_after_reverts` (expiry) | at `start + 30 days`, `build` reverts `'Game: expired'` |
| `test_expiry_a_surrender_long_after_is_recorded_expired` (expiry) | at `start + 30 days`, after its day closed: `surrender` passes, `terms.recorded && terms.expired`, the score is frozen, and the day is unchanged |
| `test_expiry_an_expired_game_with_no_move_surrenders_at_zero` (expiry) | the score is 0, it is recorded expired, and it settles for 0 |
| `test_expiry_a_game_that_never_ends_does_not_block_its_day` (expiry) | game A ends, game B is never ended; at `(d + 2) x DAY`, `settle([A])` pays and closes the day; `settle([B])` reverts `'Economy: not recorded'` |

Left out of both until ruled (findings 1 to 3): the `swap` sign check (a contract change), the Vault and router
referrer, and `set_setup` with games in flight. If the rulings keep today's behaviour, T2 can pin each one with a
test that asserts the behaviour as documented.

### Outside this plan: `scripts/measure.sh`

`COVERAGE_GROUPS` needs the nine groups listed in the summary (`tests-legacy` has no tests). Without them,
`coverage-split` under-reports by 2.8 points, and by 9.2 points on `systems/`: 90.66 % against 99.86 %.
`coverage` would also need `--max-threads 2` to stay under 16 GB. This is a separate task, since the script
is outside this brief's allowlist.

Fixed (hp/paved-core/t-0319): `COVERAGE_GROUPS` has the eight groups that hold tests (`tests-legacy` has none), `measure.sh check-groups` fails when a test module is in no group,
and `coverage` passes `--max-threads 2` (not re-measured).

## Re-measure (after T1, T2, P-58, #395)

Measured on 2026-10-14 on main at `f8ed19f5` (T1 #398, P-58 #399, `measure.sh` #395 `5c480528`). Brief:
`docs/briefs/coverage-2-remeasure.md`. A measure only: no contract, test or script changed. T2 is not in this tree: the last
commits of main are T1 (#398) and the P-58 documents (#399), so the access gaps of "Access" above are still open.

### Command, toolchain, peaks

- Command, from the worktree root, on the Mac: `scripts/measure.sh coverage-split` (the first run), then once
  `scripts/measure.sh coverage` (unsplit, `--max-threads 2`). One run at a time.
- PATH: `~/.asdf/shims` put ahead of `~/.local/bin`. `scarb 2.20.1 (dd18779a1 2026-08-21)`, `snforge 0.64.0`,
  `cairo-coverage 0.6.1` (from the script's default `CAIRO_COVERAGE_BIN_DIR`). `RAYON_NUM_THREADS=1` (the script's).
- The guard only warned, as #395 intends: `no shim at ~/.local/bin/scarb (a native binary, not a script)` and `no shim at
  ~/.local/bin/snforge`. It also printed `tr: Illegal byte sequence` once, from `head -c 2 | tr -d '\0'` on the native
  scarb binary. It is harmless (the guard still took the "native binary" branch), and it is a small script defect on macOS.
  `PAVED_*_SHIM` were not set.
- Memory stop: `/usr/bin/time -l` in `run_capped`, and a watchdog (outside the repository) that sampled the RSS of every
  `snforge`, `scarb` and `cairo-coverage` process every 2 s and stopped the run above 15,625,000 kB (16 GB).
- **`coverage-split`: exit 0, 956 s wall time (15.9 min), 35 groups, none stopped.** Peak per group, in `time -l` bytes
  (decimal GB): largest **`tests-draw-mask` 15.89 GB**, then `e2e` 14.31, `golden` 14.12, `structure-tables-4` 13.61,
  `elements` 13.18; the others 10.85 to 12.97; `gas` and `tests-walk-cost` 9.01. The largest group is 0.11 GB under the
  stop and is 1.9 GB above the 13.99 GB of the first measure (the groups are not stable between runs by 1 to 2 GB, so
  the margin to 16 GB is thin).
- Tests: **774 passed, 0 failed, 9 ignored = 783**. That is the number of `#[test]` in `src/` and `tests/` (783), with
  no test name run twice (783 `[PASS]`/`[IGNORE]` lines, all distinct). The first measure counted 740: 43 tests were
  added since (T1 and others).

### What #395's skip did (real snforge 0.64.0, cairo-coverage 0.6.1)

The group `tests-walk-cost` (filter `paved::tests::walk_cost`) holds only `#[ignore] test_walk_cost_full_deck`.

- snforge printed `[IGNORE] paved::tests::walk_cost::test_walk_cost_full_deck`, then
  `[WARNING] No trace data to generate coverage from`, then `Tests: 0 passed, 0 failed, 1 ignored, 782 filtered out`.
  It exited with a status that the script took as 0 (the group was not reported as failed), and it wrote no lcov.
- `measure.sh` printed `group tests-walk-cost: no runnable test (all ignored), skipped`, did not look for
  `coverage.lcov` for it, and carried on with `gas`, then the merge. The run ended with exit 0 and a table.
- Before #395 this group stopped the run (no lcov). Now it is skipped, and no stale lcov of the previous group was copied.
- The skip is not specific to that group: any group with `0 passed` and a non-zero `ignored` takes it.

### Unsplit `scripts/measure.sh coverage` (optional run): does not fit

With `--max-threads 2` the unsplit run was **stopped by the 16 GB stop**. The watchdog saw snforge at 15,928,448 kB, and
`time -l` reports a peak of **16,311,123,968 bytes (16.31 GB)**, about 105 s after the start (test build warm). The 2 s
sampling overshoots the stop a little. It produced no usable lcov: the `coverage.lcov` left in `contracts/coverage/`
(ignored by git) is that of the stopped run and was not read. Before this change the same run, with default threads,
reached 18.48 GB; `--max-threads 2` lowers it by about 2 GB and is not enough. Unsplit `coverage` (and so `all`) does not
fit a 16 GB budget; `coverage-split` is the way. Whether it would finish with more headroom is not known.

### Result of `coverage-split` alone

| Directory | Lines hit / lines | Coverage | First measure |
| --- | --- | --- | --- |
| (root) | 268 / 268 | 100.00 % | 268 / 268 |
| components | 119 / 123 | 96.75 % | 119 / 123 |
| economy | 86 / 86 | 100.00 % | 86 / 86 |
| elements | 656 / 675 | 97.19 % | 656 / 675 |
| helpers | 207 / 216 | 95.83 % | 207 / 216 |
| models | 333 / 336 | 99.11 % | 333 / 336 |
| structure | 1592 / 1681 | 94.71 % | 1592 / 1681 |
| systems | 719 / 719 | 100.00 % | 706 / 707 |
| types | 684 / 694 | 98.56 % | 684 / 694 |
| **TOTAL (mocks excluded)** | **4664 / 4798** | **97.21 %** | 4651 / 4786, 97.18 % |

- The first measure's "every test" figure was 4,651 / 4,786 (97.18 %), and `coverage-split` alone reported 94.40 %.
  Now `coverage-split` alone is the all-tests figure: every test module is in a group, 783 of 783 tests ran once. The 97.21 %
  is the figure of the whole crate, and is no longer a union of two scripts.
- Per-file rows that changed (all others are the same as in "Per module"):

| File | Lines hit / lines, first measure | Now |
| --- | --- | --- |
| `systems/challenge.cairo` | 117 / 117 | 123 / 123 |
| `systems/economy.cairo` | 296 / 296 | 302 / 302 |
| `systems/vault.cairo` | 52 / 53 (the camelCase entry points, `:94`) | **53 / 53** |

  The 6 lines each of `challenge.cairo` and `economy.cairo` are new code (the position check of #391, which the first
  measure's table already listed, and the P-58 / PM rulings of #396); they are hit. The `vault.cairo` line is the one T1
  was to cover. The 19 files of `elements/layouts/` are 595 / 595 (the first table gave 616 for 20 files; the merged lcov lists 19).
- The measure was at `f8ed19f5`; line numbers of "Value" and "Access" above were taken at `420d9529` and are not re-checked here.

### Remaining uncovered lines: value and access

**None.** Every line of `systems/{economy,challenge,collection,setup,token,faucet,vault}`, of `economy/{curve,mean,ekubo}` and of
`components/ownable` is hit (the lcov has no `DA:` record at 0 in any of them). The gaps of "Value" and "Access" above
(branches on one line, the vPAVED maths in OpenZeppelin, lines that run but are not asserted, the access gaps T2 was to
close) are not visible to line coverage, so this measure neither confirms nor closes them.

### Remaining uncovered lines: everywhere else (134 lines)

Outside value and access, line numbers at `f8ed19f5`, paths under `contracts/src/`:

- `components/hostable.cairo:35`, `components/payable.cairo:35`, `components/playable.cairo:27, 236`
- `elements/decks/base.cairo:124-131, 133-143` (19 lines)
- `helpers/bitmap.cairo:54`; `helpers/random_deck.cairo:118, 126, 150, 176, 317, 355, 365, 374`
- `models/game.cairo:362, 371, 380`
- `structure/forest.cairo:98, 127, 151, 153`; `structure/owners.cairo:73, 94, 124`; `structure/placement.cairo:206, 288`;
  `structure/record.cairo:218, 271`; `structure/state.cairo:75, 86, 121, 311`; `structure/walk.cairo:36, 61, 108`
- `structure/oriented.cairo` (42 lines: 24, 51, 77, 103, 114, 137, 148, 175, 186, 221, 232, 263, 274, 305, 316, 347, 358, 385,
  396, 423, 434, 469, 480, 511, 522, 557, 568, 603, 614, 645, 656, 691, 702, 753, 764, 811, 822, 877, 888, 915, 926, 958)
- `structure/tables.cairo` (29 lines: 70, 96, 122, 130, 139, 150, 160, 170, 180, 189, 198, 209, 219, 230, 241, 251, 262, 277,
  291, 307, 316, 963, 964, 975, 976, 999, 1000, 1008, 1009)
- `types/area.cairo:129`, `deck.cairo:98`, `direction.cairo:107`, `layout.cairo:80`, `mode.cairo:96`,
  `plan.cairo:187, 239, 291, 317`, `spot.cairo:113`

### Not done

- No fix of the script (brief). Two points found for the owner of `measure.sh`: the `tr: Illegal byte sequence` message of the
  shim guard on macOS, and that `coverage` (unsplit) cannot fit 16 GB even with `--max-threads 2`, so its comment and
  `AGENTS.md` ("not yet re-measured") can now say so.
