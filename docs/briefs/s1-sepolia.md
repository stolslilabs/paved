# S-1 brief: deploy.sh for Starknet Sepolia (phase 1: the code, no deployment)

Track CORE of Paved, P8. Commit this brief as `docs/briefs/s1-sepolia.md`, as the first commit of your PR.

Owner decision D-16, relayed by the PM on 2026-10-10: a public test deployment on Starknet Sepolia, for playtests
that calibrate E4. D-8 is widened: devnet for tests, Sepolia for playtests. Mainnet stays the owner's act.

## This PR deploys NOTHING

Phase 1 is this PR:
- the code;
- the docs;
- tests on devnet.

It gets a review and a security audit, then it is merged.

Phase 2 comes later: the actual Sepolia deployment, run from merged main, and `deployments/sepolia.json` committed
in a follow-up PR. You do not run phase 2. **Never send a transaction to Sepolia in this task**, not even a read
that needs the account.

## Goal: `scripts/deploy.sh sepolia`

The PM decided:

- **(a) Test USDC is our `MockUSDC`, with a bounded faucet.**
  - Today `MockUSDC.mint(recipient, amount)` is unbounded (`contracts/src/mocks/usdc.cairo`). Bound it with a
    per-call cap and a per-address cap (for example 1,000 USDC per call and 10,000 per address), named constants,
    with tests.
  - `deploy.sh` allows `MockUSDC` on devnet and Sepolia, and still refuses it on mainnet by name.
  - Devnet's own setup (the pool's 10,000 USDC) must still work. Give the deployer a way within the caps (several
    calls, or a constructor premint to the deployer only), and say which.
- **(b) The swap path is the real Ekubo router on Sepolia. No `MockRouter` off devnet.**
  - The pool is PAVED / test USDC at a 5 % fee (`0.05 x 2^128`, as economy.md says), with Ekubo's tick spacing for
    that fee. The deployer account funds it: 800,000 PAVED and 10,000 test USDC, as on devnet.
  - Take the Sepolia addresses of Ekubo's core, router and positions contracts, and the pool-creation and
    liquidity calls, from Ekubo's official sources (its repository or docs). Cite each address and the URL in the
    script and in `contracts/deployments/README.md`. If an address cannot be verified from an official source,
    stop and report: never guess an address.
  - `Economy`'s swap uses `IRouter.swap` and `IClear.{clear, clear_minimum}`, as `contracts/src/economy/ekubo.cairo`
    declares them. Check that these declarations match the Sepolia router's ABI (read its class with
    `starknet_getClassAt`, a read without the account), and report.
  - `Economy.quote_swap` is devnet only (P-35). On Sepolia the client uses Ekubo's public quote API. Write that in
    the README.
  - Launch rate: 7.6e31, the post-fee rate at a 5 % fee, as on devnet.
- **(c) Owner stake and wiring.**
  - The owner stakes in the `Vault` in the same deployment, before `Economy` is wired (`set_game`).
  - Then `PavedToken.set_minter(Economy)`.
  - The smoke asserts `minter() == Economy` and `admin() == 0`, as on devnet.
  - The P-38 test PAVED transfers stay devnet only.
- **(d) The seed is unchanged** (D-13).
- **Output:** `contracts/deployments/sepolia.json`, with the same shape and key names as `devnet.json` (O-19:
  `0x` and 64 hex digits for addresses and class hashes):
  - `contracts.{Account, Daily, Tutorial, Economy, PavedToken, Vault, Collection, MockUSDC}`;
  - the Ekubo addresses and the pool key;
  - `chain_id`, `rpc_url` (by variable name, see below), `deployed_at` and `deployed_block`.
- **The smoke on Sepolia** (phase 2) must leave no trace (P-24) or only test-sized traces, and say which. Write it
  now, and run its devnet equivalent now.

## The funded account (phase 2), and secrets

- The owner says a funded Starknet account is in the VPS environment. **Never print, log, echo or write its values**:
  no `set -x`, no `env` dump, no value in a file, a commit or a report.
- You may list the variable **names** only, for example `env | cut -d= -f1 | grep -i -E 'starknet|sepolia|account|rpc'`,
  and name in the script the variables it reads (account address, private key, RPC URL).
- `sncast` must use the key without writing it to disk. If `sncast` can only take an accounts file or a keystore
  holding the key, stop and report the options. Do not write the key to a file.
- `deploy.sh sepolia` refuses to start if a needed variable is missing, naming it, never its value.

## Docs

- `docs/programme/DECISIONS.md`: record D-16, with the date, the owner via the PM, (a) to (d), and "mainnet stays
  the owner's act".
- `docs/programme/OPERATIONS.md`: the Sepolia procedure. Phase 2 is run from merged main on the VPS, with the
  account by variable name. It writes `sepolia.json` and commits it in a follow-up PR. The smoke follows, then the
  report of the addresses.
- `contracts/deployments/README.md`: the Sepolia network, the Ekubo addresses with their sources, the faucet caps,
  and the quote path.
- `docs/architecture/economy.md`: an "As built: S-1" note.

## Invariants

- `Daily` stays at or under 72,607 CASM. Every class stays under 90 %. `scripts/class-sizes.sh` passes.
- The goldens and the gas of moves a0 to l are unchanged. This PR should not touch game contracts at all.
- The devnet deploy and its smoke still pass. Run them on the Mac or wherever `starknet-devnet` is: it is not on
  the VPS, so say where you ran them.
- `MockRouter` stays devnet only, and both mocks stay refused on mainnet by name.

## Runs (VPS)

- scarb 2.20.1 and snforge 0.64.0 from `~/.asdf/installs/`.
- Cairo runs: `RAYON_NUM_THREADS=1 prlimit --as=12884901888 -- /usr/bin/time -v ... --max-threads 2`, only after
  `free -g` shows 8 GB or more available. Record the peaks.
- Node: a `NODE_OPTIONS` heap cap, never prlimit.
- Scoped runs: the MockUSDC tests, the deploy shell tests (`scripts/test-deploy-url.sh`), and `class-sizes.sh`.
- The devnet smoke runs where devnet exists.

## Git

- Push the branch the plugin created for this thread (`hp/paved-core/t-...`). Do not create or rename a branch.
- Never `git rebase`. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `scripts/deploy.sh`, `scripts/test-deploy-url.sh`.
- `contracts/src/mocks/usdc.cairo` and its tests, `contracts/abis/MockUSDC.json` (through `scripts/abis.sh`).
- `contracts/deployments/README.md`. Not `sepolia.json`: that is phase 2.
- `docs/programme/{DECISIONS,OPERATIONS}.md`, `docs/architecture/economy.md` (the As built note),
  `docs/briefs/s1-sepolia.md`.
- No game contract, no indexer, no CLIENT file.

## PR

- Branch from main, PR to main.
- Title: `feat: S-1 deploy.sh for Starknet Sepolia (D-16), no deployment yet`.
- Report:
  - the PR's number and head;
  - the Ekubo addresses, with their sources;
  - the ABI check of the Sepolia router;
  - the faucet caps;
  - the names of the account variables (names only);
  - where and how the devnet smoke ran;
  - the peaks.
- A review and a security audit follow.
