# D-20b brief: tournaments leave the code, the implementation

Track CORE of Paved. The change removes code that holds and pays tokens. A review and two audits follow (security
lens, economy lens; P-48). Commit this brief as `docs/briefs/d20b-no-tournaments-impl.md`, as the first commit of your
PR.

## The specification (merged in #332, cde34ff)

- D-20 and P-48 in `docs/programme/DECISIONS.md`.
- `docs/architecture/leaderboard.md`, section "D-20: tournaments leave the code (planned)". It holds:
  - the prize path, everything that goes;
  - Top3 and the on-chain ranking;
  - what stays: the seed, the day id, the settlement;
  - the storage left dead under P-42;
  - what `Lobby` and `Tutorial` lose;
  - the tokens;
  - the mocks, tests and goldens;
  - what `structure-state.md` and `upgrades.md` must add.
- `docs/architecture/public-interface.md`, "Breaking change D-20". `quests.md`: On the Podium is credited from the
  indexer.

Implement what they say, with the PM's rulings below. Where the code shows the note is wrong, follow the code's truth,
fix the note in the same PR, and say so in the PR body under "Spec corrections".

## The PM's rulings after #332 (2026-10-13)

1. **The on-chain ranking goes.** Take the reporting of the WIN task (task 9) out of the game-over path
   (`quests.cairo:98-100`, `playable.cairo:43`). The indexer will credit a Champion later. No achievement uses task 9.
2. **Rename the day id.**
   - `tournament_id` becomes `day_id` in `GameSpawned`, `GameOver` and `GameView`.
   - `current_tournament_id()` becomes `current_day()`.
   - `entry_price()` stays.
   - The layouts keep their order and types; only the names change.
   - List every rename in public-interface.md's D-20 diff.
3. **Past events.** `Sponsored`, `Claimed` and `Reclaimed` leave the code but stay documented as past events, with
   their layouts, in public-interface.md (#332 already does this; keep it true).
4. **Sepolia prize funds.**
   - Read, without sending anything, the test prize funds still held for Sepolia's `Daily`: the sponsored and
     unclaimed amounts per day, and the balances of the contract that holds them.
   - Report the figure in the PR body.
   - They stay dead unless the figure is material. The Sepolia deployment is fresh after D-23b anyway (P-53).
5. **P-53.** Record the PM's ruling on the D-25 mapping as a row in `DECISIONS.md` (text below).
6. **Gas watch.** After D-19b, scenario f sits at 98.1 % of its ceiling. If this change pushes any scenario past its
   ceiling, stop and report. Do not raise a ceiling without saying why.

### The P-53 row (PM, 2026-10-13)

Add it in the table's format. What reverses it: "The owner's answer on Treasury, or a measurement that contradicts the
class-limit figure". Its text:

> D-25 mapping:
> - one fresh Sepolia deployment after D-23b (R-1 part B and D-18c part B stay on the PM's indexer word);
> - Economy stays one contract, in `systems/` beside Token and Vault, with curve, mean and ekubo as libraries;
> - Setup is the single registry of the wiring, read through one view per call;
> - the Faucet is MockUSDC moved to `systems/`, caps kept, refused by deploy.sh on mainnet and guarded by chain id in
>   its constructor;
> - the Treasury is provisional: an owner-held collector of the stored LP position, `collect_fees()` open to anyone,
>   its fees held with an owner-only withdraw, sent to one owner-set address once the owner names it;
> - Account leaves `systems/`: a mock Account stays in `mocks/` for tests, and the rest, `manageable` included, is
>   deleted;
> - the order is A (the move) + B (the Faucet) + D-20b, then C (the Treasury), then D (Setup), then E (Account out),
>   then D-23b, then F (the fresh deployment).

## Storage (P-42)

- Removed fields stay declared, never written or read, never reused: `tournaments`, `sponsorships`, `rankings` and the
  others the note lists. Name each one in a comment where it stays declared.
- No field is renamed or retyped. The day id's rename is an event, struct and view name only, not a storage name. If a
  storage name holds "tournament", leave it and say so.

## Tokens (security and economy)

- After this PR, no path transfers prize tokens. List every token transfer that remains in the classes touched, and
  show that each one belongs to the economy (purchase, settlement, Vault) and not to a prize.
- Check that removing `reclaim` and `claim` leaves no other path that reads the prize storage, and that the economy
  settlement does not read it.
- `mocks/reentrant_token.cairo`: remove it if only the prize tests use it. Say which.

## Tests

- Remove the prize tests (`tests/e2e/reclaim.cairo` and the claim and sponsor tests), and say which.
- Keep every other test green. The goldens do not change (no score changes): a golden diff is a failure.
- Add a test that a game over no longer reports task 9, and that the other game-over reports are unchanged.
- The renamed fields: the events and views tests assert the new names.
- ABIs: regenerate with `scripts/abis.sh`. The diff must be exactly the D-20 diff of public-interface.md plus the
  rename. Say if it differs.
- `scripts/deploy.sh`: remove the prize references (sponsor, claim, tournament) that it holds today, only as far as CI
  (`scripts/test-deploy-url.sh`) needs. The fresh deployment path is F's, later.

## Measures

- `scripts/class-sizes.sh` before and after: `Daily` and `Lobby` should shrink. Give the figures.
- Gas: the scenarios of `docs/measures/baseline.md`, before and after, in an "After D-20" table. The ceilings stay
  unless a scenario passes one.

## Sepolia read (ruling 4)

- Read-only calls through `STARKNET_RPC_URL`, used by name.
- Pass the URL to curl through its config on stdin, never in argv. Print only the figures.
- **Never print, log or write the value** of `STARKNET_RPC_URL`, `STARKNET_PRIVATE_KEY` or
  `STARKNET_ACCOUNT_ADDRESS`. No `env`, no `printenv`, no `set -x`.
- Send nothing. If the read fails, report the exact error, redacted. Never switch endpoints.

## Runs (VPS, D-251)

- scarb 2.20.1 and snforge 0.64.0 from `~/.asdf/installs/`.
- snforge: `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter> --max-threads 2`.
- scarb build: `prlimit --as=12884901888`.
- Only after `free -g` shows 8 GB or more available. One build at a time. Record the peaks.
- Scoped runs first (e2e, economy, quests, golden, gas, views), then the whole suite once at the end.
- A capped run with no progress for 15 minutes is stopped and reported.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `contracts/src/**`, `contracts/tests/**`, and `contracts/abis/**` through `scripts/abis.sh`.
- `scripts/deploy.sh` and `scripts/test-deploy-url.sh`: the prize references only.
- Docs:
  - `docs/programme/DECISIONS.md`: the P-53 row, and the D-20 rows only if the code corrects them;
  - `docs/architecture/leaderboard.md`: the D-20 section becomes "As built: D-20";
  - `docs/architecture/public-interface.md`: the D-20 section and the rename;
  - `docs/architecture/quests.md`: task 9;
  - `docs/architecture/structure-state.md` and `upgrades.md`: what the note's "For D-20b" asks;
  - `docs/architecture/class-headroom.md`, `docs/measures/baseline.md`: figures.
- `docs/briefs/d20b-no-tournaments-impl.md`.
- Not `packages/**`, not `contracts/deployments/**`, not `contracts/src/economy/**` beyond removing a prize
  reference (another task moves those files next).

## PR

- Title: `feat: D-20, tournaments leave the code (prize path out, day_id rename, P-53)`.
- Body:
  - the summary;
  - the ABI diff, as built;
  - the token transfers that remain;
  - the dead storage;
  - the tests removed and added;
  - goldens unchanged;
  - sizes and gas before and after;
  - the Sepolia prize-funds figure;
  - "Spec corrections";
  - "For META" (events gone, renamed fields) and "For CLIENT" (entry points and views gone, renamed fields);
  - one line on why audits are asked: the change removes code that holds and pays tokens.
- Report: the PR's number and head, everything in the body, and the peaks. Do not merge.
