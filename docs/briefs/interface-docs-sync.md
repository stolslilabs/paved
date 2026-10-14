# Brief: the published-interface docs, brought to the code (audit findings)

Track CORE of Paved. The published-interface audit of main at a28f1e8d found no code bug, three minor doc drifts and ten notes. Its report is at `/home/claude/.herdr-projects/paved-core/scratch/audit-iface-report.md`: read it whole, since each finding has file:line on both sides. This PR fixes the documents. Commit this brief as `docs/briefs/interface-docs-sync.md`, as the first commit of your PR.

## Fix, from the report (finding numbers)

1. Minor: `public-interface.md:238` points "the other events" at `native-storage.md:95-106`, which predates D-18, D-20 and D-23. State the current events in public-interface.md (from `events.cairo` and the ABIs: keys and data, in order). Mark native-storage.md's table as history, with a pointer.
2. Minor: the D-24 and D-25 (E) tables give `'Daily: ...'` errors in their "After" columns; the code has `'Challenge: ...'`. Fix them to the code.
3. Minor: public-interface.md does not state the current surface of Economy, PavedToken and Faucet. Add a section for each: entry points, views, events and errors, from the code and the ABIs. Economy's views must include `router()`, `split_bps()` and the rest.
4. Note: Setup's event list: add `QuestCompleted` and `QuestClaimed`, as "declared, not emitted (event mode)", citing indexer.md.
5. Note: the Vault's third constructor argument is `exit_fee`, not `exit_fee_bps`.
6. Note: upgrade-owner.md's anchors are pinned to f94c34fd. Re-anchor them to current main, or change the pin line to the new sha.
7. Note: upgrade-owner.md:54 says Economy "holds nothing between transactions". Say that router-returned or donated USDC waits on Economy until the next purchase swaps it into the margin.
8. Note (a code comment in `systems/challenge.cairo:9-10`): **leave it for later.** G7a edits `contracts/src` in parallel. Instead, correct the doc side (public-interface.md:281-283): the referral exclusions (P-58: zero, the payer, the Vault, the router, Economy, the game), and what min_out bounds (the whole swap).
9. Note: the events emitted at deploy by the constructors: the Vault's `ExitFeeSet { previous: 0, fee: 500 }`, Economy's `PoolSet` and `EconomyConfigured`, and every Ownable constructor's `OwnershipTransferred`. Document them.
10. Note: the price comes from two constants, `CHALLENGE_PRICE` (Challenge) and `BASE_PRICE` (Economy's check), both 2,000,000. Say so, and that public-interface.md's "cannot diverge" holds only while both constants are equal.
11. Note: the guardian after a fresh deployment is a manual `set_guardian` call. The release-day checklist (another thread) carries the step. Here, say it in upgrade-owner.md.
12. Note: `Collection.set_minters` emits no event. Say so.
13. Note: a pending ownership transfer cannot be cancelled with `transfer_ownership(0)`. The owner overwrites it with `transfer_ownership(owner)`, then `accept_ownership`. Say so in upgrade-owner.md.

## Rules

- Documents only. Every statement you add must match the code at your head: cite file:line.
- Do not change any code, comment or ABI.

## Runs

- No build or test is needed.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `docs/architecture/public-interface.md`, `upgrade-owner.md`, `native-storage.md` (the history marker only).
- `docs/briefs/interface-docs-sync.md`.
- Not `contracts/**`, not `docs/programme/**` (the release-day checklist is another thread's), not `docs/architecture/g7-gas-plan.md`.

## PR

- Title: `docs: the published interface brought to the code (audit at a28f1e8d)`.
- Use `gh pr create` with this line in the body: `Review: none — documents only (interface docs synced to the code)`.
- Body: a table mapping each finding to its change.
- Report: the PR's number and head. Do not merge.

