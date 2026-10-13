# D-18c brief, part A: the Sepolia upgrade tool for D-18 and its devnet rehearsal

Track CORE of Paved. Commit this brief as `docs/briefs/d18c-sepolia-upgrade.md`, as the first commit of your PR.

**Part A sends nothing to Sepolia**, not even an estimate. It builds the upgrade tool and rehearses it end to end on
a local devnet, chained after R-1's repoint. Part B is the real run, briefed separately. It runs right after R-1 part B
once the PM gives the word on the indexer.

## Context

- Sepolia today: `contracts/deployments/sepolia.json`, committed at 5200c63 (#303) from contracts deployed at 009bb3c
  (`deployed_at`). Its Daily and Tutorial games may be open with characters placed.
- R-1 part A (#313, 352377c) built `scripts/deploy.sh sepolia --repoint [--check-only]`. Read it, and its procedure,
  checks and resume in `docs/programme/OPERATIONS.md`. Your tool mirrors it: the same signer path, the same `v`
  helper for reads that must stop the run, receipt-checked resume through a key in the deployment file, the same
  handling of the signer's whole-line "not landed" verdict, `REPOINT_WAIT_S`-style waits, and SN_MAIN refused.
- D-18 (#324, 7cb515f) removed characters. `Daily`, `Tutorial` and `Account` change class (Account embeds the `Built`
  event); `Lobby` changes class too.
  - The old Lobby stays correct (it carries the dead bits through), but the upgrade declares the new one and calls
    `set_lobby_class` on `Daily` and on `Tutorial` (`systems/daily.cairo:267`, `systems/tutorial.cairo:162`).
  - Open games are scored under the new rules from the upgrade on and keep what they scored (#324,
    `src/tests/e2e/upgrade_d18.cairo`). A downgrade after a D-18 move is unsupported.
- P-46 (PM): `Economy.configure` with `slope_bps` 12,220. `configure` takes the whole `Config`
  (`economy.cairo:174, :771`). Keep every other field at its current on-chain value, read first; only the slope
  changes. The initial mean is left to converge (no setter).
- D-17 / U-1: the five upgradable contracts are gated by the two-step `OwnableComponent`. The owner is the deployer
  account in the VPS environment (D-16).

## Goal

1. **The tool.** A `scripts/deploy.sh sepolia --d18 [--check-only]` mode, or another name you justify. It mirrors
   `--repoint`.
   - **Before sending anything, it checks:**
     - chain id is SN_SEPOLIA;
     - the deployer is `owner()` of `Daily`, `Tutorial`, `Account` and `Economy`;
     - R-1's repoint is complete: the `repoint` key of the deployment file says so, and `Economy.router()` is the
       file's new `MockRouter`. Otherwise it refuses: D-18c runs after R-1 part B;
     - the current class hashes of `Daily`, `Tutorial` and `Account` are those of the deployment file (or the D-18
       classes already, on a resume);
     - the current `Economy` config, read and printed. The new config differs only by `slope_bps` = 12,220;
     - the deployer's STRK covers the estimate (the signer's funding check).
   - **Steps:**
     1. declare the D-18 classes of `Daily`, `Tutorial`, `Account` and `Lobby` (skip any already declared);
     2. **one multicall of the owner's account:** `Daily.upgrade`, `Tutorial.upgrade`, `Account.upgrade`,
        `Daily.set_lobby_class`, `Tutorial.set_lobby_class`, `Economy.configure`. If one multicall cannot hold them,
        say why, and give the order and the resume points;
     3. write into the deployment file: the new class hashes (`contracts.<name>.class_hash`), `classes.Lobby`, and a
        `d18` key with the tx hashes. Keep every other field.
   - **Resumable:** rerun after a stop, it reads what landed (classes declared, contracts upgraded, lobby class set,
     slope set) and sends only the rest. A rerun after completion sends nothing.
   - **Smoke at the end:**
     - each contract's class hash is the D-18 class;
     - `lobby_class()` on Daily and Tutorial is the new Lobby, if a view exists (if none, say how you check it);
     - `Economy` config has slope 12,220 and the rest unchanged;
     - `owner()` reads back on the five upgradable contracts;
     - one paid Daily spawn and one move with the D-18 `build(game_id, orientation, x, y)`;
     - the `builder` view returns its four fields.
   - `STARKNET_RPC_URL` and the key stay out of argv, echoes and logs. Extend `scripts/test-deploy-url.sh` to the new
     path with a marker URL.
2. **The rehearsal on a local devnet**, recorded in the PR, run the way #313's was:
   - **The Sepolia state.** Deploy the 009bb3c contracts on starknet-devnet (seed 42), from a checkout of 009bb3c in
     a scratch worktree of your own.
   - **Open games with characters.**
     - One Daily game, paid, with at least one character placed on a structure that is still open: a road or a
       city, and a forest if you can.
     - One Tutorial game stopped mid-script with a character placed.
     - Record the scores and the placed characters before the upgrade.
   - **R-1's repoint** from main: `deploy.sh devnet`-equivalent of `--repoint`, as #313 rehearsed it.
   - **Your tool:** `--check-only` first, which must end with "every check passed; nothing was sent"; then the run;
     then the smoke.
   - **Finish the open games** with the D-18 build:
     - no spot is blocked by an old character;
     - a structure that closes scores once, by the new formula;
     - what scored before the upgrade is kept.
     Compare with what `upgrade_d18.cairo` predicts.
   - **Resume:** stop the run after the declares (kill it), rerun, and it completes. Run it again after completion:
     it sends nothing.
   - **Order guard:** the tool refuses before the repoint (show it on a fresh 009bb3c devnet).
   - Use the devnet's predeployed account, passed through the child's environment only, as `--rehearse` does.
3. **Indexer and client, answered in the PR (read only).**
   - After D-18c, `sepolia.json`'s class hashes change; the addresses and the block do not. Does the indexer at
     55a5969 accept the file without a rebuild (its deploymentHash)?
   - Does it decode any event whose layout D-18 changed? CLIENT's inventory says no `Built`, `Discarded` or `Scored`;
     check `packages/indexer/**`.
   - Which client commit can serve Sepolia after D-18c? It must hold both CLIENT's D-18 PR and part B's
     `sepolia.json`.
4. **Docs.** `docs/programme/OPERATIONS.md`: the D-18 upgrade procedure, its command, what it checks, its resume,
   and the order (after the repoint). Say that a downgrade after D-18 moves is unsupported for open games.

## Tests

- `scripts/test-deploy-url.sh`, extended, green.
- The signer suite, if you touch `scripts/signer/**`: `node --test` in `scripts/signer`.
- The rehearsal (point 2), with its output in the PR.

## Runs (VPS)

- starknet-devnet: `~/.asdf/installs/starknet-devnet/0.10.0/bin/starknet-devnet` (the asdf shim fails in worktrees).
- scarb build: `prlimit --as=12884901888`, after `free -g` shows 8 GB or more available. One build at a time.
- Node: `NODE_OPTIONS=--max-old-space-size=<MB>`. Record the peaks.
- **Never export the `STARKNET_*` variables** into tests or the rehearsal. Nothing is sent to Sepolia.
- A run with no progress for 15 minutes is stopped and reported. Stop every devnet you started, by its own PID, and
  remove your scratch worktree at the end.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`.** If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `scripts/deploy.sh`, `scripts/test-deploy-url.sh`.
- `scripts/signer/**`, only if a signer command is missing. Say which.
- `docs/programme/OPERATIONS.md`, `docs/briefs/d18c-sepolia-upgrade.md`.
- Not `contracts/src/**`. Not `packages/**` (read only). Not `contracts/deployments/**`: part B writes them.

## PR

- Title: `feat: D-18c Sepolia upgrade tool (Daily, Tutorial, Account, Lobby, slope), rehearsed`.
- Report:
  - the PR's number and head;
  - the tool's name, and why;
  - the multicall and its calls;
  - the rehearsal output: each step, the open games before and after, the resume, the rerun, the order guard and
    the smoke;
  - the indexer and client answers, with commits;
  - the peaks.
- A review follows.
