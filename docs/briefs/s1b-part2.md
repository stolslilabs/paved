# S-1b part 2 brief: deploy.sh signs on Sepolia through scripts/signer (P-40)

Track CORE of Paved. Commit this brief as `docs/briefs/s1b-part2.md`, as the first commit of your PR.

## Context

- D-16 (owner, via the PM): Starknet Sepolia is the public test network. A funded account is in the VPS environment.
  Use it by variable name only and never print, log or write a value. No keystore or accounts file is written with
  the key. Deploys go from the VPS. Mainnet stays the owner's act; SN_MAIN is refused.
- P-39: Sepolia uses the mocks, as devnet does. P-40: signing goes through the starknet.js signer in `scripts/signer/`
  (merged in #297, 6451c37), proved with `deploy.sh sepolia --rehearse` on a local devnet.
- U-1 merged in #298 (82dcfe4): five contracts are upgradable; the class hashes changed.
- Today `deploy.sh sepolia` checks `STARKNET_ACCOUNT_ADDRESS`, `STARKNET_PRIVATE_KEY` and `STARKNET_RPC_URL` by name,
  then exits 3 ("signing on sepolia is not settled").

## Goal

1. **Wire the sending steps.** On `sepolia`, deploy.sh's declare, deploy, invoke and multicall go through
   `scripts/signer/` instead of sncast. Remove the exit 3. Keep sncast on devnet if that is simpler, or move devnet
   to the signer too (`SIGNER_NETWORK=devnet`); say which and why.
   - `--rehearse` runs the same Sepolia code path against a local starknet-devnet, with the node's predeployed key
     passed to the signer through the environment of the child process only.
   - `STARKNET_RPC_URL` never appears in argv or in any echo, error or log of deploy.sh. `sc()`, `declare_class` and
     every helper that echoes sncast output must not leak it on the Sepolia path (#293 audit note 3).
   - The signer is installed with `npm ci` in `scripts/signer/` only, never globally.
2. **CI (PM, 2026-10-10: code that signs with the deployer key is tested by the required check).**
   - Add `scripts/signer/**` to the path filter in `.github/workflows/test.yaml` (a filter that triggers a job inside
     the `ci` aggregate).
   - Add a job that runs the signer's unit tests (`npm ci && npm test` in `scripts/signer/`, Node 24), and make
     `ci` depend on it.
   - A devnet rehearsal in CI only if it is cheap (starknet-devnet 0.10.0 binary, under about 2 minutes); otherwise
     write it in OPERATIONS.md as a reviewer step and say so.
3. **Notes carried from #297 (re-review t-0162, re-audit t-0163):**
   - `SIGNER_NETWORK=devnet` requires a devnet-only method (`devnet_getConfig`) to answer before signing: a tunnel
     to Sepolia passes the URL check.
   - Node options as an allowlist: only `--max-old-space-size=<n>` is accepted. This also refuses
     `--heapsnapshot-*`, `--require`, `--import` and a quoted `--inspect`.
   - State the SIGUSR1 inspector limit in the README, or start Node with `--disable-sigusr1`.
   - The split-write limit of the sanitiser in the README.
   - A felt range check on every felt argument.
   - The test "right chain id goes on to sign" asserts the exit status and that a signing method was reached.
4. **Variable names.** Check that the VPS environment has the three variables, by name only: for example
   `[ -n "${STARKNET_PRIVATE_KEY:+x}" ] && echo set`. Never print a value, never run `env` or `printenv` unfiltered.
   If the names differ, report the names you found (names only) and stop before mapping them.
5. **devnet.json.** Regenerate `contracts/deployments/devnet.json` with `scripts/deploy.sh devnet` on this branch
   (U-1 changed the class hashes), and say whether anything else in it changed.
6. **Docs.** OPERATIONS.md: the Sepolia procedure with the signer (commands, the variables by name, what is
   checked before anything is sent). `scripts/signer/README.md` for the notes above.

Do NOT deploy to Sepolia in this PR. The real deploy runs from merged main in a later step.

## Tests

- The signer's unit tests, including the new ones (devnet_getConfig gate, Node options allowlist, felt range, chain
  id test asserting status and a signing method).
- `scripts/test-deploy-url.sh` stays green; extend it if the Sepolia path's argv or echoes change: no
  `STARKNET_RPC_URL` value in any output of a failing sepolia run (use a fake URL with a marker string).
- `scripts/deploy.sh sepolia --rehearse` on a local devnet, end to end, with the smoke (owner() on five contracts).
- `scripts/deploy.sh devnet` end to end.

## Runs (VPS)

- starknet-devnet: `~/.asdf/installs/starknet-devnet/0.10.0/bin/starknet-devnet` (the asdf shim fails in worktrees).
- Node: `NODE_OPTIONS=--max-old-space-size=<MB>` at 1.5× the measured peak, never prlimit. Record the peaks.
- scarb build: `prlimit --as=12884901888`, after `free -g` shows 8 GB or more available. One build at a time.
- A run with no progress for 15 minutes is stopped and reported.
- Never put a real key into a test. Do not export the STARKNET_* variables into tests or the rehearsal.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- Never `git rebase`. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `scripts/deploy.sh`, `scripts/test-deploy-url.sh`, `scripts/signer/**`.
- `.github/workflows/test.yaml` (path filter, the signer job, `ci`'s needs only).
- `contracts/deployments/devnet.json`, `contracts/deployments/README.md`.
- `docs/programme/OPERATIONS.md`, `docs/briefs/s1b-part2.md`.
- Not `contracts/src/**`, not `packages/**`.

## PR

- Title: `feat: S-1b part 2 deploy.sh signs on Sepolia via scripts/signer (P-40)`.
- Report: the PR's number and head; the rehearsal's output (addresses on the local devnet, smoke result); the CI job
  and its runtime; whether a devnet rehearsal runs in CI; the variable names found (names only); the peaks.
- A review and a security audit follow.
