# Brief: one source for the game price, an event on Collection.set_minters, and Challenge.spawn's comment

Track CORE of Paved. The PM's rulings of 2026-10-14 on the published-interface audit (#414: "two price constants", "set_minters emits no event", the spawn comment). A review follows; no audit. **It changes Collection's ABI (a new event), so CLIENT follows on this branch** (the indexer halts on an unknown selector): **push your branch right after your brief commit**, before any code. Commit this brief as `docs/briefs/price-source-and-minters-event.md`, as the first commit of your PR.

**Machine: the VPS.**

## Goal

1. **One source for the game price.**
   - `Challenge` pulls `stake x CHALLENGE_PRICE` (`constants.cairo:13`, through `Mode::price`, `types/mode.cairo:30-35`).
   - `Economy.purchase` checks `price == stake x BASE_PRICE` (`systems/economy.cairo:38`, `:647`). Both are 2,000,000.
   - Keep ONE constant, and make the other place use it. Choose which, and where it lives so both contracts import it, and say why.
   - The value stays 2,000,000. No rule, storage or price change.
   - Test that Challenge's pulled price and Economy's checked price come from the same constant. A compile-time single definition is enough; say how it is enforced.
   - Update `docs/architecture/public-interface.md`'s note on the two constants (#414 added it).
2. **An event on `Collection.set_minters`** (`systems/collection.cairo:328-340`). An access change must be visible.
   - Add an event, for example `MintersSet { ... }`, with fields that let an indexer see the new minters, in the style of `Setup.set_economy` and `set_collection`'s events.
   - Emit it on every call.
   - Tests: the event is emitted with the right data, and only the owner (or whoever may call it today) can call it.
   - Regenerate the ABIs with `scripts/abis.sh`: only Collection.json should change, plus Challenge.json or Economy.json if item 1 changes a view. Say which.
   - Document the event in public-interface.md, and in upgrade-owner.md if set_minters is an owner power.
3. **`Challenge.spawn`'s doc comment** (`systems/challenge.cairo:9-10`): the referral exclusions are P-58's (zero, the payer, the Vault, the router, Economy, the game), and `min_out` bounds the whole swap (the burn quote plus the Vault's part), not only the burn.

## Rules

- Goldens and parity byte-identical: `git diff origin/main -- contracts/src/tests/golden docs/measures/golden-games.md packages` must be empty.
- Gas: every scenario stays under its ceiling, and none rises. Say whether anything moved.
- No storage layout change.

## Runs (VPS)

- scarb and snforge through the shims on PATH only (plain `scarb`, `snforge`). Never prepend `~/.asdf/installs` to PATH or call a binary by its path. At most one Cairo build or test run at a time on the VPS: the shim lock queues them.
- `PAVED_SCARB_SHIM` and `PAVED_SNFORGE_SHIM` are test hooks only. Never point them at real binaries.
- snforge: `RAYON_NUM_THREADS=1 prlimit --as=16106127360 -- /usr/bin/time -v snforge test <filter> --max-threads 2`. scarb build: `prlimit --as=12884901888`. Only after `free -g` shows 8 GB or more available. Record the peaks.
- Scoped runs first (collection, economy, challenge, gas), then the whole suite once.
- Never use or print the `STARKNET_*` variables. Nothing is sent to any network.

## Git

- **Push your branch right after the brief commit** (CLIENT builds on it), and then as you go.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `contracts/src/constants.cairo`, `types/mode.cairo`, `systems/economy.cairo`, `systems/challenge.cairo` (the price source and the comment), `systems/collection.cairo`, `contracts/src/events.cairo` if events live there.
- Their tests under `contracts/src/tests/**`.
- `contracts/abis/**` via `scripts/abis.sh`.
- `docs/architecture/public-interface.md`, `upgrade-owner.md`.
- `docs/briefs/price-source-and-minters-event.md`.
- Not `scripts/**` (the readiness thread edits deploy.sh), not `packages/**` (CLIENT's), not `contracts/deployments/**`.

## PR

- Title: `fix: one source for the game price, an event on Collection.set_minters, and spawn's comment (audit)`.
- Body:
  - each item;
  - the ABI diff;
  - "For CLIENT": the new event's selector and layout;
  - gas;
  - one line on why no audit.
- Report: the PR's number and head, the branch name, the commands with their peaks. Do not merge.
