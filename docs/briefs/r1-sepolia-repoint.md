# R-1 brief: repoint Sepolia's Economy at a new MockRouter (E-9), part A: the tool and its rehearsal

Track CORE of Paved. Commit this brief as `docs/briefs/r1-sepolia-repoint.md`, as the first commit of your PR.

**Part A sends nothing to Sepolia.** It builds the repoint tool, rehearses it end to end on a local devnet, and
answers the questions below in the PR. Part B, the real run on Sepolia from merged main, is a later step. It starts
only when the PM confirms that the Sepolia indexer runs 55a5969 or later.

## Context

- E-9 merged in #309 (55a5969). `Economy.quote_swap` now calls the router's `quote_swap`, which Sepolia's current
  `MockRouter` (deployed at 009bb3c) lacks. So an `Economy` upgrade alone breaks Sepolia's quote.
- E-9 added the owner-only `Economy.set_router` (event `RouterSet`, view `router()`). The indexer ignores
  `RouterSet` from 55a5969 on.
- The procedure is in `docs/programme/OPERATIONS.md`, "Repointing Sepolia's `Economy` at a new `MockRouter`", and in
  `docs/architecture/economy.md`, "As built: E-9":
  1. the indexer ignores `RouterSet`;
  2. declare the E-9 `Economy` and `MockRouter` classes;
  3. deploy `MockRouter(PAVED, USDC)` and seed it (`add_liquidity`) at the old pool's current ratio. Its PAVED comes
     from an unstake of the deployer's Vault stake;
  4. one multicall of the owner's account: `Economy.upgrade`, `Economy.set_router`, `Economy.set_pool(<its
     pool_key()>, 0)`;
  5. commit the new addresses and class hashes in `sepolia.json`, then check `router()`, `quote_swap(1400000)` and
     one paid spawn.
- Sepolia today: `contracts/deployments/sepolia.json` (deployed from 009bb3c). D-16: the funded account in the VPS
  environment is used by variable name only. Nothing is printed. No keystore or accounts file is written with the
  key. Signing goes through `scripts/signer/` (P-40). Test tokens on the test network: CORE's act, not the owner's.
  SN_MAIN is refused.

## Goal (part A)

1. **The tool.** Choose one: a `scripts/deploy.sh sepolia --repoint` mode, or a separate `scripts/repoint.sh`. Say
   which and why. It must:
   - sign every step through `scripts/signer/`, as `deploy.sh` does;
   - keep `STARKNET_RPC_URL` and the key out of argv, echoes and logs. Extend `scripts/test-deploy-url.sh` to cover
     the new path with a marker URL;
   - check before sending anything:
     - chain id is SN_SEPOLIA;
     - the deployer is `Economy.owner()`;
     - the deployer's STRK covers the estimate (the signer's funding check);
     - the current `Economy.router()`, or the stored router, is the old MockRouter of `sepolia.json`;
     - `quote_swap` on the new class will have a router that answers;
   - be resumable: rerun after a stop, it reads what already landed (classes declared, the new MockRouter deployed
     and seeded, Economy already upgraded and repointed) and does only the rest. It never deploys a second
     MockRouter when one from a previous run is recorded;
   - choose the seed amounts and say how:
     - the old pool's current ratio, read from the old MockRouter's reserves;
     - a depth close to the old pool's;
     - an unstake of part of the deployer's Vault stake. Keep part of it staked: E-7, USDC that arrives while
       nobody stakes goes to the first staker;
     - USDC from the MockUSDC faucet;
   - write the new `MockRouter` address, the new class hashes and the repoint transaction hashes into
     `contracts/deployments/sepolia.json`, keeping every other field;
   - end with a smoke: `Economy.router()` is the new MockRouter, `Economy.quote_swap(1400000)` answers above 0, a paid
     spawn through Daily succeeds, and `owner()` still reads back on the five upgradable contracts.
2. **Rehearsal on a local devnet.** Run end to end, recorded in the PR:
   - deploy the 009bb3c state on starknet-devnet (seed 42): `deploy.sh devnet` from a checkout of 009bb3c in a
     scratch worktree of your own, or an equivalent way you explain;
   - run the tool from this branch against it;
   - run the smoke;
   - run the tool again: it must find everything done and send nothing;
   - a stop in the middle (kill it after the MockRouter deploy), then a rerun that completes.
   Use the devnet's predeployed account, passed through the child's environment only, as `--rehearse` does.
3. **Storage and classes.**
   - Compare `Economy`'s storage between 009bb3c and main: the upgrade keeps every existing field, and `router` is
     the field `set_router` writes. Quote the evidence.
   - List every other class whose hash differs between `sepolia.json` and a build of main (Daily, Tutorial, Account,
     Collection, Lobby, PavedToken, Vault), and why. Part A upgrades only `Economy`. Name any other upgrade Sepolia
     would need, and do not do it.
4. **The questions of the PM, answered in the PR body.**
   - **Indexer:** after the repoint, `sepolia.json` changes (the new MockRouter, the class hashes, maybe more). Does
     the running indexer (from 55a5969) accept the new file without a rebuild? Read how it checks its database
     against the deployment (`packages/indexer/**`, `deploy/indexer/**`): which fields it compares, and whether
     they change. If it needs a new release or a rebuild, say so and give the exact commit.
   - **Client:** the release on paved.bal7hazar.com is built from 1235607. Does the client read the MockRouter
     address, or any field that changes? Check `packages/**` for its use of `sepolia.json`. Does it need a rebuild
     after the repoint, and from which commit? Name that commit, or say "after part B's sepolia.json PR merges".
5. **Docs.** Update the OPERATIONS.md procedure with the tool's command and what it checks.

## Tests

- `scripts/test-deploy-url.sh` stays green, extended to the new path.
- The signer suite: `node --test` in `scripts/signer`.
- The rehearsal (point 2), with its output in the PR.

## Runs (VPS)

- starknet-devnet: `~/.asdf/installs/starknet-devnet/0.10.0/bin/starknet-devnet`. The asdf shim fails in worktrees.
- scarb build: `prlimit --as=12884901888`, after `free -g` shows 8 GB or more available. One build at a time.
- Node: `NODE_OPTIONS=--max-old-space-size=<MB>`. Record the peaks.
- Never export the `STARKNET_*` variables into tests or the rehearsal. **Nothing is sent to Sepolia in part A**, not
  even an estimate. Part B is briefed separately.
- A run with no progress for 15 minutes is stopped and reported.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- Never `git rebase`. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `scripts/deploy.sh` or a new `scripts/repoint.sh`, and `scripts/test-deploy-url.sh`.
- `scripts/signer/**`, only if a signer command is missing. Say which.
- `docs/programme/OPERATIONS.md`, `docs/briefs/r1-sepolia-repoint.md`.
- Not `contracts/src/**`. Not `packages/**` (read only). Not `contracts/deployments/**`: part B writes them.

## PR

- Title: `feat: R-1 Sepolia repoint tool for the E-9 router (part A, rehearsed)`.
- Report:
  - the PR's number and head;
  - the tool chosen;
  - the rehearsal output (each step, the rerun, the stop and resume, the smoke);
  - the seed amounts and how they were chosen;
  - the storage evidence;
  - the class differences;
  - the indexer and client answers, with commits;
  - the peaks.
- A review follows.
