# L-1 brief: compare quiver_leaderboard 0.1.0 with the native leaderboard, by numbers

Track CORE of Paved. Commit this brief as `docs/briefs/l1-quiver-leaderboard.md`, as the first commit of your PR.

## Context

- `quiver_leaderboard 0.1.0` is published on scarbs.xyz (https://scarbs.xyz/packages/quiver_leaderboard). It was
  built from Grim World commit 3f0912507e9e71e1adeac663037050d468596861, tag `quiver_leaderboard-v0.1.0`. The
  registry sha256 is f8900c602c983acbbc39513a964eefacdbcb861902b2501d9e50b891981e770e.
- Paved may depend on it only as the pinned published version: `quiver_leaderboard = "=0.1.0"` in
  `contracts/Scarb.toml`. Never as a git or path dependency (O-1, Overseer).
- The planned swap is described in `docs/architecture/leaderboard.md`. The leaderboard sits behind the interface in
  `contracts/src/leaderboard.cairo`, so a package can replace it by changing that module alone. Part 2 of the
  document lists what Paved needs from a package. The rule to keep is in the module header and in the document:
  - `<=` the third score does not rank, so ties keep the earlier submission;
  - a score of 0 never ranks;
  - games are ranked, not players;
  - the order is the order of the calls;
  - the prize top 3 stays on chain and the full board lives in the indexer (P-18).
- Daily is at 72,947 CASM felts, 89.0 % of 81,920. That is exactly the P-44 cap.
- Sepolia is deployed from main 009bb3c (`contracts/deployments/sepolia.json`). Daily, Tutorial, Account, Economy
  and Collection are upgradable (U-1, D-17). Lobby is a library class, set by `set_lobby_class`. PavedToken and
  Vault are not upgradable.

## Goal

A measured comparison and a working swap on your branch. Open the PR as a **draft**. I decide adopt or not from your
figures: adopt if gas is not worse and Daily stays under the cap. Nothing merges unless it wins.

1. **Baseline on main**, before you change anything, with the same commands you use after:
   - the L2 gas of the leaderboard update on a settled Daily game. Use the existing snforge scenario that ends a
     Daily game and ranks it, or write one test, kept in the PR, that runs on both sides unchanged. Report the gas of
     the game-ending move: an empty board, a game that ranks into a full board, and a game that does not rank;
   - `scripts/class-sizes.sh`, every class.
2. **Read the package** as published: its interface, its storage, its events, and its licence. Read it from the
   resolved dependency, never from a Grim World clone. Say whether it keeps each point of the rule above. For each
   point it does not keep, say whether an adapter in `leaderboard.cairo` restores it, and at what cost.
3. **Swap** `contracts/src/leaderboard.cairo` to the package behind the same interface. Keep the views, the events
   and `Daily.claim` as they are. If a change outside this module is needed, name it and keep it minimal.
4. **After**: the same gas tests and `class-sizes.sh`. Report Daily and any class that grows. The P-44 cap of Daily is
   72,947 CASM felts, its size today, so Daily has no room: any growth exceeds the cap
   (`docs/architecture/class-headroom.md`, "Cap of `Daily` after U-1 (P-44)"). **If Daily passes 72,947 felts, or
   any class passes 90 % of 81,920, finish the measurement, then stop and report the figures. Do not trim
   anything.** Name the levers with figures instead of applying them, for example moving the ranking into the
   `Lobby` library. Changing the cap is the PM's call.
5. **Behaviour.** The golden tests stay unchanged and green. `contracts/src/tests/leaderboard.cairo` stays green
   unchanged; you may add tests, but not edit or delete them. Ties, bounds (u32 score, the 0 score, a full board)
   and what the indexer reads must stay the same: the `GameOver` event's `tournament_id` and the tournament view.
   Check against `docs/architecture/indexer.md`, and say yes or no for each.
6. **Storage on deployed Sepolia.** Say what the package forces on the storage layout of Daily and Tutorial
   (Lobby shares their layout, P-26; see `docs/architecture/upgrades.md`):
   - does an upgrade under D-17 keep existing tournaments readable (new storage only, no rename or retype), or does
     it need a migration or a redeploy?
   - name the slots or components it adds, and any substorage name clash.
   This part is analysis only: nothing is sent to Sepolia.
7. **Docs.** A results section in `docs/architecture/leaderboard.md`: the before/after tables, the rule checklist,
   the storage answer and your recommendation. It goes in this PR whatever the outcome.

If the package needs a breaking change to be usable, do not work around it: write what and why in the report, and
stop.

## Runs (VPS, D-251)

- scarb 2.20.1 and snforge 0.64.0 from `~/.asdf/installs/`.
- snforge: `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter> --max-threads 2`.
- scarb build: `prlimit --as=12884901888`.
- Only after `free -g` shows 8 GB or more available. One build at a time. Record the peaks.
- Scoped runs: the leaderboard, golden and gas tests, and `class-sizes.sh`, before and after. The whole suite once,
  at the end.
- A capped run with no progress for 15 minutes is stopped and reported.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- Never `git rebase`. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `contracts/Scarb.toml` (the one line `quiver_leaderboard = "=0.1.0"`) and `contracts/Scarb.lock`.
- `contracts/src/leaderboard.cairo`, `contracts/src/lib.cairo`.
- Only if needed and named in the report: `contracts/src/store.cairo`, `contracts/src/models/tournament.cairo`,
  `contracts/src/components/{playable,hostable}.cairo`, `contracts/src/systems/daily.cairo`.
- `contracts/src/tests/**`, `contracts/tests/**` (add tests; do not edit the goldens or the existing leaderboard
  tests).
- `contracts/abis/**`, through `scripts/abis.sh`, only if an ABI changes. Say so: an ABI change is a finding against
  adoption.
- `docs/architecture/leaderboard.md`, `docs/briefs/l1-quiver-leaderboard.md`.
- Not `scripts/**`, not `packages/**`, not `contracts/deployments/**`.

## PR

- A draft PR to main. Title: `feat: L-1 quiver_leaderboard 0.1.0 vs native leaderboard (draft, by numbers)`.
- Report:
  - the PR's number and head;
  - gas before and after, for the three cases;
  - CASM felts before and after, for every class that changed, with Daily as a percentage of 81,920;
  - the rule checklist and the indexer checklist;
  - the storage answer for Sepolia: upgrade or redeploy;
  - the licence;
  - the peaks;
  - your recommendation;
  - any breaking change needed from Grim World.
